/**
 * Transfer Publisher - CocoCash Wallet MS
 * RF-14: Publish domain events (SNS)
 * 
 * Publishes events to SNS topics for async processing
 */

import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import {
    TransferInitiatedEvent,
    TransferCompletedEvent,
    TransferFailedEvent
} from '../../models/transfer.model';

interface AccountCreatedEvent {
    eventType: 'account.created';
    accountId: string;
    userId: string;
    timestamp: Date;
}

export class TransferPublisher {
    private snsClient: SNSClient;
    private transferTopicArn: string;
    private accountTopicArn: string;

    constructor() {
        this.snsClient = new SNSClient({
            region: process.env.AWS_REGION || 'us-east-1'
        });

        this.transferTopicArn = process.env.SNS_TRANSFER_TOPIC_ARN || '';
        this.accountTopicArn = process.env.SNS_ACCOUNT_TOPIC_ARN || '';
    }

    /**
     * Publish transfer.initiated event
     * RF-09: Event-driven async processing
     */
    async publishTransferInitiated(event: TransferInitiatedEvent): Promise<void> {
        await this.publishToSNS(this.transferTopicArn, event);
        console.log(`Published transfer.initiated event for transfer ${event.transferId}`);
    }

    /**
     * Publish transfer.completed event
     */
    async publishTransferCompleted(event: TransferCompletedEvent): Promise<void> {
        await this.publishToSNS(this.transferTopicArn, event);
        console.log(`Published transfer.completed event for transfer ${event.transferId}`);
    }

    /**
     * Publish transfer.failed event
     */
    async publishTransferFailed(event: TransferFailedEvent): Promise<void> {
        await this.publishToSNS(this.transferTopicArn, event);
        console.log(`Published transfer.failed event for transfer ${event.transferId}`);
    }

    /**
     * Publish account.created event
     * RF-14: Domain events for business actions
     */
    async publishAccountCreated(event: AccountCreatedEvent): Promise<void> {
        await this.publishToSNS(this.accountTopicArn, event);
        console.log(`Published account.created event for account ${event.accountId}`);
    }

    private async publishToSNS(topicArn: string, event: object): Promise<void> {
        if (!topicArn) {
            console.warn('SNS topic ARN not configured, skipping event publish');
            return;
        }

        const command = new PublishCommand({
            TopicArn: topicArn,
            Message: JSON.stringify(event),
            MessageAttributes: {
                eventType: {
                    DataType: 'String',
                    StringValue: (event as any).eventType
                }
            }
        });

        await this.snsClient.send(command);
    }
}
