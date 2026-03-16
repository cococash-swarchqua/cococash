// Report Consumer - SQS event processing for monthly report generation
// Consumes batches of account IDs from the report-users queue,
// queries DynamoDB for each user's transactions in the report period,
// and publishes consolidated data to the report-txns SNS topic.

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/sns"
	snstypes "github.com/aws/aws-sdk-go-v2/service/sns/types"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	sqsTypes "github.com/aws/aws-sdk-go-v2/service/sqs/types"
)

// AccountInfo mirrors the structure from get-accounts Lambda
type AccountInfo struct {
	ID            string `json:"id"`
	UserID        string `json:"userId"`
	AccountNumber string `json:"accountNumber"`
}

// ReportBatchMessage is the message received from get-accounts via SNS→SQS
type ReportBatchMessage struct {
	Period   string        `json:"period"`   // "2026-02"
	Accounts []AccountInfo `json:"accounts"` // batch of accounts
}

// ReportPayload is the consolidated message published to pdf-maker via SNS
type ReportPayload struct {
	UserID        string              `json:"userId"`
	AccountID     string              `json:"accountId"`
	AccountNumber string              `json:"accountNumber"`
	Period        string              `json:"period"`
	Transactions  []TransactionRecord `json:"transactions"`
}

// ReportEventConsumer polls the report-users SQS queue and processes report batches
type ReportEventConsumer struct {
	sqsClient *sqs.Client
	snsClient *sns.Client
	queueURL  string
	topicARN  string
	repo      *TransactionRepository
}

// NewReportEventConsumer creates a new report consumer instance
func NewReportEventConsumer(sqsClient *sqs.Client, snsClient *sns.Client, queueURL, topicARN string, repo *TransactionRepository) *ReportEventConsumer {
	return &ReportEventConsumer{
		sqsClient: sqsClient,
		snsClient: snsClient,
		queueURL:  queueURL,
		topicARN:  topicARN,
		repo:      repo,
	}
}

// Start begins the polling loop for report generation (blocking)
func (c *ReportEventConsumer) Start(ctx context.Context) {
	log.Println("Report event consumer started")

	for {
		select {
		case <-ctx.Done():
			log.Println("Report event consumer stopped")
			return
		default:
			c.pollMessages(ctx)
		}
	}
}

// pollMessages receives and processes report batch messages from SQS
func (c *ReportEventConsumer) pollMessages(ctx context.Context) {
	result, err := c.sqsClient.ReceiveMessage(ctx, &sqs.ReceiveMessageInput{
		QueueUrl:            aws.String(c.queueURL),
		MaxNumberOfMessages: 1, // Process one batch at a time
		WaitTimeSeconds:     20,
		VisibilityTimeout:   300, // 5 minutes per batch
	})
	if err != nil {
		if ctx.Err() != nil {
			return
		}
		log.Printf("Error receiving report SQS messages: %v", err)
		time.Sleep(5 * time.Second)
		return
	}

	for _, msg := range result.Messages {
		if err := c.processReportBatch(ctx, msg); err != nil {
			log.Printf("Error processing report batch %s: %v", deref(msg.MessageId), err)
			continue
		}

		// Delete successfully processed message
		c.deleteMessage(ctx, msg)
	}
}

// processReportBatch processes a batch of accounts for report generation
func (c *ReportEventConsumer) processReportBatch(ctx context.Context, msg sqsTypes.Message) error {
	if msg.Body == nil {
		log.Println("Skipping empty report message")
		return nil
	}

	// Unwrap SNS envelope
	var snsMsg SNSMessage
	var batch ReportBatchMessage

	if err := json.Unmarshal([]byte(*msg.Body), &snsMsg); err == nil && snsMsg.Message != "" {
		if err := json.Unmarshal([]byte(snsMsg.Message), &batch); err != nil {
			return fmt.Errorf("failed to parse report batch from SNS: %w", err)
		}
	} else {
		if err := json.Unmarshal([]byte(*msg.Body), &batch); err != nil {
			return fmt.Errorf("failed to parse report batch: %w", err)
		}
	}

	log.Printf("Processing report batch: %d accounts for period %s", len(batch.Accounts), batch.Period)

	// Calculate date range for the period
	fromDate, toDate, err := periodToDateRange(batch.Period)
	if err != nil {
		return fmt.Errorf("invalid period %s: %w", batch.Period, err)
	}

	// Process each account in the batch
	for _, account := range batch.Accounts {
		err := c.processAccountReport(ctx, account, batch.Period, fromDate, toDate)
		if err != nil {
			log.Printf("ERROR processing report for user=%s account=%s: %v",
				account.UserID, account.ID, err)
			// Continue with other accounts — don't fail the entire batch
			continue
		}
	}

	return nil
}

// processAccountReport queries transactions and publishes consolidated data for one account
func (c *ReportEventConsumer) processAccountReport(ctx context.Context, account AccountInfo, period, fromDate, toDate string) error {
	// Query DynamoDB for user's transactions in the date range
	transactions, err := c.repo.GetByUserIDAndDateRange(ctx, account.UserID, fromDate, toDate)
	if err != nil {
		return fmt.Errorf("failed to query transactions: %w", err)
	}

	log.Printf("Found %d transactions for user=%s period=%s", len(transactions), account.UserID, period)

	// Build the payload (even if no transactions — pdf-maker will generate a "no movements" cert)
	payload := ReportPayload{
		UserID:        account.UserID,
		AccountID:     account.ID,
		AccountNumber: account.AccountNumber,
		Period:        period,
		Transactions:  transactions,
	}

	// Publish to SNS report-txns topic → SQS → pdf-maker Lambda
	msgBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal report payload: %w", err)
	}

	_, err = c.snsClient.Publish(ctx, &sns.PublishInput{
		TopicArn: aws.String(c.topicARN),
		Message:  aws.String(string(msgBytes)),
		MessageAttributes: map[string]snstypes.MessageAttributeValue{
			"eventType": {
				DataType:    aws.String("String"),
				StringValue: aws.String("report.txns.consolidated"),
			},
		},
	})
	if err != nil {
		return fmt.Errorf("failed to publish to SNS: %w", err)
	}

	log.Printf("Published consolidated report for user=%s period=%s (%d txns)",
		account.UserID, period, len(transactions))

	return nil
}

// deleteMessage removes a processed message from SQS
func (c *ReportEventConsumer) deleteMessage(ctx context.Context, msg sqsTypes.Message) {
	_, err := c.sqsClient.DeleteMessage(ctx, &sqs.DeleteMessageInput{
		QueueUrl:      aws.String(c.queueURL),
		ReceiptHandle: msg.ReceiptHandle,
	})
	if err != nil {
		log.Printf("Error deleting report SQS message %s: %v", deref(msg.MessageId), err)
	}
}

// periodToDateRange converts "2026-02" to start/end RFC3339 timestamps
func periodToDateRange(period string) (string, string, error) {
	parts := strings.Split(period, "-")
	if len(parts) != 2 {
		return "", "", fmt.Errorf("invalid period format: %s", period)
	}

	startDate, err := time.Parse("2006-01", period)
	if err != nil {
		return "", "", fmt.Errorf("failed to parse period: %w", err)
	}

	// End of month: first day of next month
	endDate := startDate.AddDate(0, 1, 0)

	return startDate.Format(time.RFC3339), endDate.Format(time.RFC3339), nil
}
