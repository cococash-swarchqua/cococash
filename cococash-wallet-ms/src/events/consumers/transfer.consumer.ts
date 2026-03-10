/**
 * Transfer Consumer - CocoCash Wallet MS
 * RF-09: Async event-driven processing via SQS
 * 
 * Consumes transfer.initiated events from SQS queue
 * and processes them using TransferService
 */

import {
    SQSClient,
    ReceiveMessageCommand,
    DeleteMessageCommand,
    Message
} from '@aws-sdk/client-sqs';
import { TransferService } from '../../services/transfer.service';
import { TransferInitiatedEvent } from '../../models/transfer.model';

export class TransferConsumer {
    private sqsClient: SQSClient;
    private queueUrl: string;
    private isRunning: boolean = false;

    constructor(private transferService: TransferService) {
        this.sqsClient = new SQSClient({
            region: process.env.AWS_REGION || 'us-east-1'
        });

        this.queueUrl = process.env.SQS_TRANSFER_QUEUE_URL || '';
    }

    /**
     * Start polling SQS queue for transfer events
     */
    async start(): Promise<void> {
        if (!this.queueUrl) {
            console.error('SQS queue URL not configured');
            return;
        }

        this.isRunning = true;
        console.log('Transfer consumer started, polling SQS queue...');

        while (this.isRunning) {
            try {
                await this.pollMessages();
            } catch (error) {
                console.error('Error polling messages:', error);
                // Wait before retrying
                await this.sleep(5000);
            }
        }
    }

    /**
     * Stop the consumer
     */
    stop(): void {
        this.isRunning = false;
        console.log('Transfer consumer stopped');
    }

    /**
     * Poll and process messages from SQS
     */
    private async pollMessages(): Promise<void> {
        const command = new ReceiveMessageCommand({
            QueueUrl: this.queueUrl,
            MaxNumberOfMessages: 10,
            WaitTimeSeconds: 20, // Long polling
            VisibilityTimeout: 30, // SQS visibility timeout
            MessageAttributeNames: ['All']
        });

        const response = await this.sqsClient.send(command);

        if (!response.Messages || response.Messages.length === 0) {
            return;
        }

        for (const message of response.Messages) {
            await this.processMessage(message);
        }
    }

    /**
     * Process individual SQS message
     */
    private async processMessage(message: Message): Promise<void> {
        try {
            if (!message.Body) {
                console.warn('Empty message body');
                await this.deleteMessage(message);
                return;
            }

            // Parse SNS wrapper (when SQS is subscribed to SNS)
            let eventData: TransferInitiatedEvent;
            const body = JSON.parse(message.Body);

            if (body.Message) {
                // Message came through SNS
                eventData = JSON.parse(body.Message);
            } else {
                eventData = body;
            }

            // Only process transfer.initiated events
            if (eventData.eventType !== 'transfer.initiated') {
                console.log(`Ignoring event type: ${eventData.eventType}`);
                await this.deleteMessage(message);
                return;
            }

            console.log(`Processing transfer ${eventData.transferId}`);

            // RF-09, RF-10, RF-11: Process transfer with consistency
            await this.transferService.processTransfer(eventData.transferId);

            // Delete message on success
            await this.deleteMessage(message);

            console.log(`Successfully processed transfer ${eventData.transferId}`);

        } catch (error) {
            console.error('Error processing message:', error);
            // Message will return to queue after visibility timeout
            // This enables retry logic
        }
    }

    /**
     * Delete processed message from queue
     */
    private async deleteMessage(message: Message): Promise<void> {
        if (!message.ReceiptHandle) return;

        const command = new DeleteMessageCommand({
            QueueUrl: this.queueUrl,
            ReceiptHandle: message.ReceiptHandle
        });

        await this.sqsClient.send(command);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
