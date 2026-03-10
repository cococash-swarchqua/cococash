// CocoCash Transaction MS - Audit Log Microservice
// Consumes transfer events from SQS, stores immutable records in DynamoDB
// Exposes read-only API for transaction history (TRANS-01, TRANS-02)

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
)

func main() {
	log.Println("Starting CocoCash Transaction MS...")

	// Load AWS config
	cfg, err := config.LoadDefaultConfig(context.Background(),
		config.WithRegion(getEnv("AWS_REGION", "us-east-1")),
	)
	if err != nil {
		log.Fatalf("Failed to load AWS config: %v", err)
	}

	// Initialize clients
	dynamoClient := dynamodb.NewFromConfig(cfg)
	sqsClient := sqs.NewFromConfig(cfg)

	tableName := getEnv("DYNAMODB_TABLE", "cococash-transaction-log")
	queueURL := getEnv("SQS_QUEUE_URL", "")
	port := getEnv("PORT", "8080")

	// Initialize repository and handler
	repo := NewTransactionRepository(dynamoClient, tableName)
	handler := NewTransactionHandler(repo)
	consumer := NewEventConsumer(sqsClient, queueURL, repo)

	// Setup HTTP routes
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", healthHandler)
	mux.HandleFunc("GET /v1/transactions/user/{userId}", handler.GetByUserID)
	mux.HandleFunc("GET /v1/transactions/{transactionId}", handler.GetByID)

	// HTTP server
	server := &http.Server{
		Addr:         ":" + port,
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	// Start SQS consumer in background
	ctx, cancel := context.WithCancel(context.Background())
	var wg sync.WaitGroup

	if queueURL != "" {
		wg.Add(1)
		go func() {
			defer wg.Done()
			consumer.Start(ctx)
		}()
		log.Printf("SQS consumer started, polling queue: %s", queueURL)
	} else {
		log.Println("WARNING: SQS_QUEUE_URL not set, consumer disabled")
	}

	// Start HTTP server in background
	go func() {
		log.Printf("HTTP server listening on :%s", port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("HTTP server error: %v", err)
		}
	}()

	// Graceful shutdown
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)
	<-sigCh

	log.Println("Shutting down...")
	cancel()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	server.Shutdown(shutdownCtx)

	wg.Wait()
	log.Println("Shutdown complete")
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "healthy",
		"service": "cococash-transaction-ms",
	})
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// JSON response helper
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

// Error response helper
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]interface{}{
		"success": false,
		"error": map[string]string{
			"message": message,
		},
	})
}

// Success response helper
func writeSuccess(w http.ResponseWriter, data interface{}) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    data,
	})
}

func formatLog(format string, args ...interface{}) {
	log.Printf(format, args...)
}

func ptr(s string) *string {
	return &s
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func derefInt(i *int32) int32 {
	if i == nil {
		return 0
	}
	return *i
}

func formatTime(t time.Time) string {
	return t.Format(time.RFC3339)
}

func nowISO() string {
	return time.Now().UTC().Format(time.RFC3339)
}

func parseTime(s string) (time.Time, error) {
	return time.Parse(time.RFC3339, s)
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func safeStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func mustGetEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		log.Fatalf("Required environment variable %s is not set", key)
	}
	return v
}

func logError(msg string, err error) {
	if err != nil {
		log.Printf("ERROR: %s: %v", msg, err)
	}
}

func logInfo(msg string, args ...interface{}) {
	log.Printf("INFO: "+msg, args...)
}

func panicOnError(msg string, err error) {
	if err != nil {
		log.Fatalf("FATAL: %s: %v", msg, err)
	}
}

// Response types matching API spec
type SuccessResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data"`
}

type ErrorResponse struct {
	Success bool `json:"success"`
	Error   struct {
		Message string `json:"message"`
	} `json:"error"`
}

// toFloat64 safely converts a string to float64
func toFloat64(s string) float64 {
	var f float64
	fmt.Sscanf(s, "%f", &f)
	return f
}
