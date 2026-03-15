// CocoCash Get Accounts Lambda
// Triggered by EventBridge on the 1st of each month.
// Fetches all active accounts from wallet-ms via API Gateway
// and publishes batches to SNS for report generation pipeline.

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sns"
	snstypes "github.com/aws/aws-sdk-go-v2/service/sns/types"
)

// BatchSize defines how many accounts per SNS message
const BatchSize = 100

// AccountInfo represents a single account from wallet-ms API response
type AccountInfo struct {
	ID            string `json:"id"`
	UserID        string `json:"userId"`
	AccountNumber string `json:"accountNumber"`
}

// WalletAPIResponse represents the GET /v1/accounts/all response
type WalletAPIResponse struct {
	Success bool `json:"success"`
	Data    struct {
		Accounts []AccountInfo `json:"accounts"`
	} `json:"data"`
}

// ReportBatchMessage is the SNS message payload — a batch of accounts + period
type ReportBatchMessage struct {
	Period   string        `json:"period"`   // e.g. "2026-02"
	Accounts []AccountInfo `json:"accounts"` // batch of up to 100 accounts
}

// EventBridgeEvent represents the incoming EventBridge scheduled event
type EventBridgeEvent struct {
	Source     string `json:"source"`
	DetailType string `json:"detail-type"`
	Time       string `json:"time"`
}

var (
	apiGatewayURL string
	snsTopicARN   string
	snsClient     *sns.Client
	httpClient    *http.Client
)

func init() {
	apiGatewayURL = os.Getenv("API_GATEWAY_URL")
	snsTopicARN = os.Getenv("SNS_REPORT_USERS_TOPIC_ARN")

	if apiGatewayURL == "" {
		log.Fatal("API_GATEWAY_URL environment variable is required")
	}
	if snsTopicARN == "" {
		log.Fatal("SNS_REPORT_USERS_TOPIC_ARN environment variable is required")
	}

	cfg, err := config.LoadDefaultConfig(context.Background(),
		config.WithRegion(getEnv("AWS_REGION", "us-east-1")),
	)
	if err != nil {
		log.Fatalf("Failed to load AWS config: %v", err)
	}

	snsClient = sns.NewFromConfig(cfg)
	httpClient = &http.Client{Timeout: 30 * time.Second}
}

func handler(ctx context.Context, event EventBridgeEvent) error {
	// Determine the report period: previous month
	now := time.Now().UTC()
	previousMonth := now.AddDate(0, -1, 0)
	period := previousMonth.Format("2006-01")

	log.Printf("Starting report generation for period: %s", period)

	// Fetch all active accounts from wallet-ms via API Gateway
	accounts, err := fetchAllAccounts(ctx)
	if err != nil {
		return fmt.Errorf("failed to fetch accounts: %w", err)
	}

	log.Printf("Fetched %d active accounts", len(accounts))

	if len(accounts) == 0 {
		log.Println("No active accounts found, skipping report generation")
		return nil
	}

	// Publish batches of accounts to SNS
	batchCount := 0
	for i := 0; i < len(accounts); i += BatchSize {
		end := i + BatchSize
		if end > len(accounts) {
			end = len(accounts)
		}

		batch := accounts[i:end]
		batchMsg := ReportBatchMessage{
			Period:   period,
			Accounts: batch,
		}

		err := publishBatch(ctx, batchMsg)
		if err != nil {
			return fmt.Errorf("failed to publish batch %d: %w", batchCount, err)
		}

		batchCount++
		log.Printf("Published batch %d (%d accounts)", batchCount, len(batch))
	}

	log.Printf("Completed: published %d batches for %d accounts, period %s",
		batchCount, len(accounts), period)

	return nil
}

// fetchAllAccounts retrieves all active accounts from wallet-ms through API Gateway.
// This is an internal/service call — no user JWT needed since get-accounts Lambda
// has execute-api:Invoke permissions.
func fetchAllAccounts(ctx context.Context) ([]AccountInfo, error) {
	var allAccounts []AccountInfo
	page := 1
	limit := 100

	for {
		url := fmt.Sprintf("%s/v1/accounts/all?status=active&page=%d&limit=%d",
			apiGatewayURL, page, limit)

		req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
		if err != nil {
			return nil, fmt.Errorf("failed to create request: %w", err)
		}

		resp, err := httpClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("HTTP request failed: %w", err)
		}

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()

		if err != nil {
			return nil, fmt.Errorf("failed to read response body: %w", err)
		}

		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(body))
		}

		var apiResp WalletAPIResponse
		if err := json.Unmarshal(body, &apiResp); err != nil {
			return nil, fmt.Errorf("failed to parse response: %w", err)
		}

		accounts := apiResp.Data.Accounts
		if len(accounts) == 0 {
			break
		}

		allAccounts = append(allAccounts, accounts...)

		// If we got fewer results than the limit, we've reached the last page
		if len(accounts) < limit {
			break
		}

		page++
	}

	return allAccounts, nil
}

// publishBatch sends a batch of account IDs to the SNS report users topic
func publishBatch(ctx context.Context, batch ReportBatchMessage) error {
	msgBytes, err := json.Marshal(batch)
	if err != nil {
		return fmt.Errorf("failed to marshal batch message: %w", err)
	}

	_, err = snsClient.Publish(ctx, &sns.PublishInput{
		TopicArn: aws.String(snsTopicARN),
		Message:  aws.String(string(msgBytes)),
		MessageAttributes: map[string]snstypes.MessageAttributeValue{
			"eventType": {
				DataType:    aws.String("String"),
				StringValue: aws.String("report.generate.batch"),
			},
		},
	})
	if err != nil {
		return fmt.Errorf("failed to publish to SNS: %w", err)
	}

	return nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	lambda.Start(handler)
}
