// Event Consumer - SQS event processing
// Consumes transfer.completed and transfer.failed events from SQS
// Writes immutable transaction records to DynamoDB

package main

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	sqsTypes "github.com/aws/aws-sdk-go-v2/service/sqs/types"
	"github.com/google/uuid"
)

// EventConsumer polls SQS and processes transfer events
type EventConsumer struct {
	sqsClient *sqs.Client
	queueURL  string
	repo      *TransactionRepository
}

// NewEventConsumer creates a new consumer instance
func NewEventConsumer(sqsClient *sqs.Client, queueURL string, repo *TransactionRepository) *EventConsumer {
	return &EventConsumer{
		sqsClient: sqsClient,
		queueURL:  queueURL,
		repo:      repo,
	}
}

// Start begins the polling loop (blocking)
func (c *EventConsumer) Start(ctx context.Context) {
	log.Println("Event consumer started")

	for {
		select {
		case <-ctx.Done():
			log.Println("Event consumer stopped")
			return
		default:
			c.pollMessages(ctx)
		}
	}
}

// pollMessages receives and processes messages from SQS
func (c *EventConsumer) pollMessages(ctx context.Context) {
	result, err := c.sqsClient.ReceiveMessage(ctx, &sqs.ReceiveMessageInput{
		QueueUrl:            aws.String(c.queueURL),
		MaxNumberOfMessages: 10,
		WaitTimeSeconds:     20, // Long polling
		VisibilityTimeout:   30,
	})
	if err != nil {
		// Don't log on context cancellation
		if ctx.Err() != nil {
			return
		}
		log.Printf("Error receiving SQS messages: %v", err)
		time.Sleep(5 * time.Second)
		return
	}

	for _, msg := range result.Messages {
		if err := c.processMessage(ctx, msg); err != nil {
			log.Printf("Error processing message %s: %v", deref(msg.MessageId), err)
			// Message will return to queue after visibility timeout
			continue
		}

		// Delete successfully processed message
		c.deleteMessage(ctx, msg)
	}
}

// processMessage parses and stores a transfer event
func (c *EventConsumer) processMessage(ctx context.Context, msg sqsTypes.Message) error {
	if msg.Body == nil {
		log.Println("Skipping empty message")
		return nil
	}

	// Parse SNS envelope (messages come SNS -> SQS)
	var event TransferEvent
	var snsMsg SNSMessage

	if err := json.Unmarshal([]byte(*msg.Body), &snsMsg); err == nil && snsMsg.Message != "" {
		// Message came through SNS
		if err := json.Unmarshal([]byte(snsMsg.Message), &event); err != nil {
			return err
		}
	} else {
		// Direct message (testing)
		if err := json.Unmarshal([]byte(*msg.Body), &event); err != nil {
			return err
		}
	}

	log.Printf("Processing event: %s for transfer %s", event.EventType, event.TransferID)

	now := nowISO()
	transactionID := uuid.New().String()

	// Create TWO records: one for sender (debit), one for receiver (credit)
	// This allows both users to see the transaction in their history

	if event.EventType == "transfer.completed" {
		// Record for sender
		senderRecord := TransactionRecord{
			UserID:               event.SourceUserID, // Partition key — Cognito UUID
			Timestamp:            now,
			TransactionID:        transactionID + "-debit",
			TransferID:           event.TransferID,
			Type:                 "TRANSFER_SENT",
			Amount:               event.Amount,
			Currency:             "CCC",
			SourceAccountID:      event.SourceAccountID,
			DestinationAccountID: event.DestinationAccountID,
			Status:               "COMPLETED",
			EventSource:          "cococash-wallet-ms",
			EventType:            event.EventType,
			RecordedAt:           now,
		}

		if err := c.repo.PutTransaction(ctx, senderRecord); err != nil {
			return err
		}

		// Record for receiver
		receiverRecord := TransactionRecord{
			UserID:               event.DestinationUserID, // Partition key — Cognito UUID
			Timestamp:            now,
			TransactionID:        transactionID + "-credit",
			TransferID:           event.TransferID,
			Type:                 "TRANSFER_RECEIVED",
			Amount:               event.Amount,
			Currency:             "CCC",
			SourceAccountID:      event.SourceAccountID,
			DestinationAccountID: event.DestinationAccountID,
			Status:               "COMPLETED",
			EventSource:          "cococash-wallet-ms",
			EventType:            event.EventType,
			RecordedAt:           now,
		}

		if err := c.repo.PutTransaction(ctx, receiverRecord); err != nil {
			return err
		}
	} else if event.EventType == "transfer.failed" {
		// Only record for sender (failed)
		failedRecord := TransactionRecord{
			UserID:               event.SourceUserID, // Partition key — Cognito UUID
			Timestamp:            now,
			TransactionID:        transactionID + "-failed",
			TransferID:           event.TransferID,
			Type:                 "TRANSFER_FAILED",
			Amount:               event.Amount,
			Currency:             "CCC",
			SourceAccountID:      event.SourceAccountID,
			DestinationAccountID: event.DestinationAccountID,
			Status:               "FAILED",
			Description:          event.Reason,
			EventSource:          "cococash-wallet-ms",
			EventType:            event.EventType,
			RecordedAt:           now,
		}

		if err := c.repo.PutTransaction(ctx, failedRecord); err != nil {
			return err
		}
	} else if event.EventType == "deposit.completed" {
		// Single record: the account that received the deposit (credit)
		depositRecord := TransactionRecord{
			UserID:               event.AccountID, // Beneficiary
			Timestamp:            now,
			TransactionID:        transactionID + "-deposit",
			TransferID:           event.DepositID,
			Type:                 "DEPOSIT_COMPLETED",
			Amount:               event.Amount,
			Currency:             "CCC",
			SourceAccountID:      "EXTERNAL",
			DestinationAccountID: event.AccountID,
			Status:               "COMPLETED",
			Description:          event.Description,
			EventSource:          "cococash-wallet-ms",
			EventType:            event.EventType,
			RecordedAt:           now,
		}

		if err := c.repo.PutTransaction(ctx, depositRecord); err != nil {
			return err
		}
	}

	log.Printf("Successfully processed transfer %s (%s)", event.TransferID, event.EventType)
	return nil
}

// deleteMessage removes a processed message from SQS
func (c *EventConsumer) deleteMessage(ctx context.Context, msg sqsTypes.Message) {
	_, err := c.sqsClient.DeleteMessage(ctx, &sqs.DeleteMessageInput{
		QueueUrl:      aws.String(c.queueURL),
		ReceiptHandle: msg.ReceiptHandle,
	})
	if err != nil {
		log.Printf("Error deleting SQS message %s: %v", deref(msg.MessageId), err)
	}
}
