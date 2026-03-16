// Transaction Model - CocoCash Transaction MS
// Represents an immutable transaction audit record

package main

import "time"

// TransactionRecord represents an immutable audit log entry in DynamoDB
type TransactionRecord struct {
	UserID               string  `dynamodbav:"user_id" json:"userId"`
	Timestamp            string  `dynamodbav:"timestamp" json:"timestamp"`
	TransactionID        string  `dynamodbav:"transaction_id" json:"transactionId"`
	TransferID           string  `dynamodbav:"transfer_id" json:"transferId"`
	Type                 string  `dynamodbav:"type" json:"type"`
	Amount               float64 `dynamodbav:"amount" json:"amount"`
	Currency             string  `dynamodbav:"currency" json:"currency"`
	SourceAccountID      string  `dynamodbav:"source_account_id" json:"sourceAccountId"`
	DestinationAccountID string  `dynamodbav:"destination_account_id" json:"destinationAccountId"`
	Status               string  `dynamodbav:"status" json:"status"`
	Description          string  `dynamodbav:"description,omitempty" json:"description,omitempty"`
	EventSource          string  `dynamodbav:"event_source" json:"eventSource"`
	EventType            string  `dynamodbav:"event_type" json:"eventType"`
	RecordedAt           string  `dynamodbav:"recorded_at" json:"recordedAt"`
}

// TransferEvent represents an event consumed from SQS (published by wallet-ms)
type TransferEvent struct {
	EventType            string  `json:"eventType"`
	TransferID           string  `json:"transferId"`
	SourceAccountID      string  `json:"sourceAccountId"`
	DestinationAccountID string  `json:"destinationAccountId"`
	SourceUserID         string  `json:"sourceUserId"`
	DestinationUserID    string  `json:"destinationUserId"`
	Amount               float64 `json:"amount"`
	Timestamp            string  `json:"timestamp"`
	Reason               string  `json:"reason,omitempty"` // For transfer.failed events
	// Fields specific to deposit.completed events
	DepositID   string  `json:"depositId,omitempty"`
	AccountID   string  `json:"accountId,omitempty"`
	UserID      string  `json:"userId,omitempty"`
	NewBalance  float64 `json:"newBalance,omitempty"`
	Description string  `json:"description,omitempty"`
}

// SNSMessage wraps the actual event when delivered via SNS -> SQS
type SNSMessage struct {
	Type      string `json:"Type"`
	MessageID string `json:"MessageId"`
	Message   string `json:"Message"` // The actual TransferEvent JSON
	Timestamp string `json:"Timestamp"`
}

// UserTransactionsResponse matches TRANS-01 API response
type UserTransactionsResponse struct {
	UserID       string              `json:"userId"`
	Transactions []TransactionRecord `json:"transactions"`
	Count        int                 `json:"count"`
}

// TransactionDetailResponse matches TRANS-02 API response
type TransactionDetailResponse struct {
	TransactionID        string     `json:"transactionId"`
	TransferID           string     `json:"transferId"`
	SourceAccountID      string     `json:"sourceAccountId"`
	DestinationAccountID string     `json:"destinationAccountId"`
	Amount               float64    `json:"amount"`
	Currency             string     `json:"currency"`
	Status               string     `json:"status"`
	Description          string     `json:"description,omitempty"`
	CreatedAt            string     `json:"createdAt"`
	ProcessedAt          string     `json:"processedAt"`
	AuditTrail           AuditTrail `json:"auditTrail"`
}

// AuditTrail for TRANS-02
type AuditTrail struct {
	EventSource string `json:"eventSource"`
	EventType   string `json:"eventType"`
	RecordedAt  string `json:"recordedAt"`
}

// mapEventType maps wallet-ms event types to transaction record types
func mapEventType(eventType string) string {
	switch eventType {
	case "transfer.completed":
		return "TRANSFER_COMPLETED"
	case "transfer.failed":
		return "TRANSFER_FAILED"
	case "deposit.completed":
		return "DEPOSIT_COMPLETED"
	default:
		return "UNKNOWN"
	}
}

// nowUTC returns current UTC time formatted as RFC3339
func nowUTC() time.Time {
	return time.Now().UTC()
}
