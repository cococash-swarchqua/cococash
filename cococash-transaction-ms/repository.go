// Transaction Repository - DynamoDB operations
// Handles all read/write operations to the transactions DynamoDB table

package main

import (
	"context"
	"fmt"
	"log"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// TransactionRepository handles DynamoDB operations
type TransactionRepository struct {
	client    *dynamodb.Client
	tableName string
}

// NewTransactionRepository creates a new repository instance
func NewTransactionRepository(client *dynamodb.Client, tableName string) *TransactionRepository {
	return &TransactionRepository{
		client:    client,
		tableName: tableName,
	}
}

// PutTransaction writes an immutable transaction record to DynamoDB
func (r *TransactionRepository) PutTransaction(ctx context.Context, record TransactionRecord) error {
	item, err := attributevalue.MarshalMap(record)
	if err != nil {
		return fmt.Errorf("failed to marshal transaction record: %w", err)
	}

	_, err = r.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(r.tableName),
		Item:      item,
	})
	if err != nil {
		return fmt.Errorf("failed to put transaction to DynamoDB: %w", err)
	}

	log.Printf("Stored transaction %s for user %s", record.TransactionID, record.UserID)
	return nil
}

// GetByUserID queries transactions for a user (TRANS-01)
// Uses the table's partition key (user_id) with optional limit
func (r *TransactionRepository) GetByUserID(ctx context.Context, userID string, limit int32) ([]TransactionRecord, error) {
	input := &dynamodb.QueryInput{
		TableName:              aws.String(r.tableName),
		KeyConditionExpression: aws.String("user_id = :uid"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":uid": &types.AttributeValueMemberS{Value: userID},
		},
		ScanIndexForward: aws.Bool(false), // Newest first
		Limit:            aws.Int32(limit),
	}

	result, err := r.client.Query(ctx, input)
	if err != nil {
		return nil, fmt.Errorf("failed to query transactions for user %s: %w", userID, err)
	}

	var records []TransactionRecord
	err = attributevalue.UnmarshalListOfMaps(result.Items, &records)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal transaction records: %w", err)
	}

	return records, nil
}

// GetByTransactionID queries a single transaction by ID (TRANS-02)
// Uses the GSI on transaction_id
func (r *TransactionRepository) GetByTransactionID(ctx context.Context, transactionID string) (*TransactionRecord, error) {
	input := &dynamodb.QueryInput{
		TableName:              aws.String(r.tableName),
		IndexName:              aws.String("transaction_id-index"),
		KeyConditionExpression: aws.String("transaction_id = :tid"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":tid": &types.AttributeValueMemberS{Value: transactionID},
		},
		Limit: aws.Int32(1),
	}

	result, err := r.client.Query(ctx, input)
	if err != nil {
		return nil, fmt.Errorf("failed to query transaction %s: %w", transactionID, err)
	}

	if len(result.Items) == 0 {
		return nil, nil // Not found
	}

	var record TransactionRecord
	err = attributevalue.UnmarshalMap(result.Items[0], &record)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal transaction record: %w", err)
	}

	return &record, nil
}

