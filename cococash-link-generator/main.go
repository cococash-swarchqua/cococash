// CocoCash Link Generator Lambda
// Invoked by API Gateway when a user requests a bank statement download.
// Validates that the PDF exists in S3 and returns a presigned URL.
// The JWT is already validated by the API Gateway Cognito authorizer.

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

var (
	s3Client     *s3.Client
	presignClient *s3.PresignClient
	bucketName   string
)

func init() {
	bucketName = os.Getenv("S3_BUCKET_NAME")
	if bucketName == "" {
		log.Fatal("S3_BUCKET_NAME environment variable is required")
	}

	cfg, err := config.LoadDefaultConfig(context.Background(),
		config.WithRegion(getEnv("AWS_REGION", "us-east-1")),
	)
	if err != nil {
		log.Fatalf("Failed to load AWS config: %v", err)
	}

	s3Client = s3.NewFromConfig(cfg)
	presignClient = s3.NewPresignClient(s3Client)
}

// APIGatewayResponse is a convenience type for API Gateway v2 responses
type APIGatewayResponse struct {
	StatusCode int               `json:"statusCode"`
	Headers    map[string]string `json:"headers"`
	Body       string            `json:"body"`
}

func handler(ctx context.Context, request events.APIGatewayV2HTTPRequest) (APIGatewayResponse, error) {
	// Extract userId from JWT claims (set by API Gateway Cognito authorizer)
	userID := ""
	if claims, ok := request.RequestContext.Authorizer.JWT.Claims["sub"]; ok {
		userID = claims
	}
	if userID == "" {
		return errorResponse(http.StatusUnauthorized, "No se pudo identificar al usuario"), nil
	}

	// Extract path parameters
	accountID := request.PathParameters["accountId"]
	if accountID == "" {
		return errorResponse(http.StatusBadRequest, "accountId es requerido"), nil
	}

	// Extract period from query string
	period := request.QueryStringParameters["period"]
	if period == "" {
		return errorResponse(http.StatusBadRequest, "El parametro period es requerido (formato: YYYY-MM)"), nil
	}

	// Validate period format
	if !isValidPeriod(period) {
		return errorResponse(http.StatusBadRequest, "Formato de periodo invalido. Use YYYY-MM"), nil
	}

	// Build the S3 key
	parts := strings.Split(period, "-")
	year, month := parts[0], parts[1]
	s3Key := fmt.Sprintf("reportes/%s/%s/%s/extracto.pdf", userID, year, month)

	log.Printf("Checking for report: bucket=%s key=%s user=%s", bucketName, s3Key, userID)

	// Check if the object exists (HeadObject)
	_, err := s3Client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(bucketName),
		Key:    aws.String(s3Key),
	})
	if err != nil {
		log.Printf("HeadObject failed for %s: %v", s3Key, err)
		return errorResponse(http.StatusNotFound, "No hay extracto disponible para este periodo"), nil
	}

	// Generate presigned URL (15 minutes expiry)
	presignedReq, err := presignClient.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucketName),
		Key:    aws.String(s3Key),
	}, func(opts *s3.PresignOptions) {
		opts.Expires = 15 * time.Minute
	})
	if err != nil {
		log.Printf("Failed to generate presigned URL: %v", err)
		return errorResponse(http.StatusInternalServerError, "Error al generar el enlace de descarga"), nil
	}

	log.Printf("Generated presigned URL for user=%s period=%s", userID, period)

	// Return the presigned URL
	responseBody := map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"url":       presignedReq.URL,
			"expiresIn": 900, // 15 minutes in seconds
			"period":    period,
		},
	}

	bodyJSON, _ := json.Marshal(responseBody)

	return APIGatewayResponse{
		StatusCode: http.StatusOK,
		Headers: map[string]string{
			"Content-Type":                "application/json",
			"Access-Control-Allow-Origin": "*",
		},
		Body: string(bodyJSON),
	}, nil
}

func errorResponse(statusCode int, message string) APIGatewayResponse {
	body := map[string]interface{}{
		"success": false,
		"error": map[string]string{
			"message": message,
		},
	}
	bodyJSON, _ := json.Marshal(body)

	return APIGatewayResponse{
		StatusCode: statusCode,
		Headers: map[string]string{
			"Content-Type":                "application/json",
			"Access-Control-Allow-Origin": "*",
		},
		Body: string(bodyJSON),
	}
}

// isValidPeriod checks if the period matches YYYY-MM format
func isValidPeriod(period string) bool {
	parts := strings.Split(period, "-")
	if len(parts) != 2 {
		return false
	}
	if len(parts[0]) != 4 || len(parts[1]) != 2 {
		return false
	}
	// Validate it parses as a date
	_, err := time.Parse("2006-01", period)
	return err == nil
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
