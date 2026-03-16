// CocoCash PDF Maker Lambda
// Consumes consolidated transaction events from SQS
// Generates monthly bank statement PDFs and uploads to S3
// If no transactions exist for the period, generates a "no movements" certificate

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/jung-kurt/gofpdf"
)

// TransactionRecord mirrors the DynamoDB record from transaction-ms
type TransactionRecord struct {
	UserID               string  `json:"userId"`
	Timestamp            string  `json:"timestamp"`
	TransactionID        string  `json:"transactionId"`
	TransferID           string  `json:"transferId"`
	Type                 string  `json:"type"`
	Amount               float64 `json:"amount"`
	Currency             string  `json:"currency"`
	SourceAccountID      string  `json:"sourceAccountId"`
	DestinationAccountID string  `json:"destinationAccountId"`
	Status               string  `json:"status"`
	Description          string  `json:"description"`
}

var (
	s3Client   *s3.Client
	bucketName string
)

func main() {
	lambda.Start(handler)
}

// ReportPayload is the message received from SNS→SQS (published by transaction-ms)
type ReportPayload struct {
	UserID        string              `json:"userId"`
	AccountID     string              `json:"accountId"`
	AccountNumber string              `json:"accountNumber"`
	Period        string              `json:"period"` // "2026-02"
	Transactions  []TransactionRecord `json:"transactions"`
}

// SNSMessage wraps the payload when coming from SNS → SQS
type SNSMessage struct {
	Type      string `json:"Type"`
	MessageID string `json:"MessageId"`
	Message   string `json:"Message"`
}

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
}

func handler(ctx context.Context, sqsEvent events.SQSEvent) error {
	for _, record := range sqsEvent.Records {
		if err := processMessage(ctx, record.Body); err != nil {
			log.Printf("ERROR processing message %s: %v", record.MessageId, err)
			return err
		}
	}
	return nil
}

func processMessage(ctx context.Context, body string) error {
	// Unwrap SNS envelope
	var snsMsg SNSMessage
	if err := json.Unmarshal([]byte(body), &snsMsg); err != nil {
		return fmt.Errorf("failed to unmarshal SNS message: %w", err)
	}

	// Parse the actual payload
	var payload ReportPayload
	if err := json.Unmarshal([]byte(snsMsg.Message), &payload); err != nil {
		return fmt.Errorf("failed to unmarshal report payload: %w", err)
	}

	log.Printf("Generating PDF for user=%s account=%s period=%s transactions=%d",
		payload.UserID, payload.AccountID, payload.Period, len(payload.Transactions))

	// Generate the PDF
	pdfBytes, err := generatePDF(ctx, payload)
	if err != nil {
		return fmt.Errorf("failed to generate PDF: %w", err)
	}

	// Build S3 key: reportes/{userId}/{YYYY}/{MM}/extracto.pdf
	parts := strings.Split(payload.Period, "-")
	if len(parts) != 2 {
		return fmt.Errorf("invalid period format: %s", payload.Period)
	}
	year, month := parts[0], parts[1]
	s3Key := fmt.Sprintf("reportes/%s/%s/%s/extracto.pdf", payload.UserID, year, month)

	// Upload to S3
	_, err = s3Client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(bucketName),
		Key:         aws.String(s3Key),
		Body:        bytes.NewReader(pdfBytes),
		ContentType: aws.String("application/pdf"),
	})
	if err != nil {
		return fmt.Errorf("failed to upload PDF to S3: %w", err)
	}

	log.Printf("Uploaded PDF to s3://%s/%s", bucketName, s3Key)
	return nil
}

// formatPeriodLabel converts "2026-02" to "Febrero 2026"
func formatPeriodLabel(period string) string {
	months := map[string]string{
		"01": "Enero", "02": "Febrero", "03": "Marzo", "04": "Abril",
		"05": "Mayo", "06": "Junio", "07": "Julio", "08": "Agosto",
		"09": "Septiembre", "10": "Octubre", "11": "Noviembre", "12": "Diciembre",
	}
	parts := strings.Split(period, "-")
	if len(parts) != 2 {
		return period
	}
	monthName, ok := months[parts[1]]
	if !ok {
		return period
	}
	return fmt.Sprintf("%s %s", monthName, parts[0])
}

// formatTimestamp converts RFC3339 to a short date
func formatTimestamp(ts string) string {
	t, err := time.Parse(time.RFC3339, ts)
	if err != nil {
		return ts[:10] // fallback: first 10 chars
	}
	return t.Format("02/01/2006")
}

// formatTransactionType returns a human-readable transaction type
func formatTransactionType(txType string) string {
	switch txType {
	case "TRANSFER_COMPLETED":
		return "Transferencia"
	case "TRANSFER_FAILED":
		return "Transf. Fallida"
	case "DEPOSIT_COMPLETED":
		return "Deposito"
	case "TRANSFER_SENT":
		return "Envio"
	case "TRANSFER_RECEIVED":
		return "Recepcion"
	default:
		return txType
	}
}

// truncateString shortens a string to maxLen characters
func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-2] + ".."
}

// generatePDF builds the document layout and returns the bytes
func generatePDF(ctx context.Context, payload ReportPayload) ([]byte, error) {
	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(15, 15, 15)
	pdf.AddPage()

	// --- Header ---
	pdf.SetFont("Arial", "B", 20)
	pdf.SetTextColor(30, 80, 50) // Dark green (CocoCash brand)
	pdf.CellFormat(0, 12, "CocoCash", "", 1, "C", false, 0, "")

	pdf.SetFont("Arial", "", 10)
	pdf.SetTextColor(100, 100, 100)
	pdf.CellFormat(0, 6, "Billetera Digital", "", 1, "C", false, 0, "")
	pdf.Ln(4)

	// --- Title ---
	pdf.SetFont("Arial", "B", 14)
	pdf.SetTextColor(40, 40, 40)

	periodLabel := formatPeriodLabel(payload.Period)
	pdf.CellFormat(0, 10, fmt.Sprintf("Extracto Bancario - %s", periodLabel), "", 1, "C", false, 0, "")
	pdf.Ln(4)

	// --- Account Info ---
	pdf.SetFont("Arial", "", 10)
	pdf.SetTextColor(60, 60, 60)
	pdf.CellFormat(0, 6, fmt.Sprintf("Cuenta: %s", payload.AccountNumber), "", 1, "L", false, 0, "")
	pdf.CellFormat(0, 6, fmt.Sprintf("ID de Usuario: %s", payload.UserID), "", 1, "L", false, 0, "")
	pdf.CellFormat(0, 6, fmt.Sprintf("Fecha de generacion: %s", time.Now().UTC().Format("2006-01-02 15:04 UTC")), "", 1, "L", false, 0, "")
	pdf.Ln(6)

	// --- Separator line ---
	pdf.SetDrawColor(30, 80, 50)
	pdf.SetLineWidth(0.5)
	pdf.Line(15, pdf.GetY(), 195, pdf.GetY())
	pdf.Ln(6)

	if len(payload.Transactions) == 0 {
		// --- No movements certificate ---
		pdf.SetFont("Arial", "I", 12)
		pdf.SetTextColor(100, 100, 100)
		pdf.Ln(10)
		pdf.CellFormat(0, 8, "No se registraron movimientos durante este periodo.", "", 1, "C", false, 0, "")
		pdf.Ln(6)
		pdf.SetFont("Arial", "", 10)
		pdf.CellFormat(0, 6, "Este documento certifica que la cuenta estuvo activa", "", 1, "C", false, 0, "")
		pdf.CellFormat(0, 6, "durante el periodo indicado sin registrar transacciones.", "", 1, "C", false, 0, "")
	} else {
		// --- Transaction table ---
		// Table header
		pdf.SetFont("Arial", "B", 8)
		pdf.SetFillColor(30, 80, 50)
		pdf.SetTextColor(255, 255, 255)

		colWidths := []float64{16, 20, 22, 22, 50, 50}
		headers := []string{"Fecha", "Tipo", "Monto", "Estado", "Origen", "Destino"}

		for i, header := range headers {
			pdf.CellFormat(colWidths[i], 8, header, "1", 0, "C", true, 0, "")
		}
		pdf.Ln(-1)

		// Table rows
		pdf.SetFont("Arial", "", 7)
		pdf.SetTextColor(40, 40, 40)

		totalInflows := 0.0
		totalOutflows := 0.0

		for idx, txn := range payload.Transactions {
			// Alternate row colors
			if idx%2 == 0 {
				pdf.SetFillColor(245, 248, 245)
			} else {
				pdf.SetFillColor(255, 255, 255)
			}

			dateStr := formatTimestamp(txn.Timestamp)
			typeStr := formatTransactionType(txn.Type)
			amountStr := fmt.Sprintf("%.2f %s", txn.Amount, txn.Currency)
			sourceStr := txn.SourceAccountID
			destStr := txn.DestinationAccountID

			pdf.CellFormat(colWidths[0], 7, dateStr, "1", 0, "C", true, 0, "")
			pdf.CellFormat(colWidths[1], 7, typeStr, "1", 0, "C", true, 0, "")
			pdf.CellFormat(colWidths[2], 7, amountStr, "1", 0, "R", true, 0, "")
			pdf.CellFormat(colWidths[3], 7, txn.Status, "1", 0, "C", true, 0, "")
			pdf.CellFormat(colWidths[4], 7, sourceStr, "1", 0, "C", true, 0, "")
			pdf.CellFormat(colWidths[5], 7, destStr, "1", 0, "C", true, 0, "")
			
			pdf.Ln(-1)

			// Calculate totals for successful transactions
			if txn.Status == "COMPLETED" || txn.Status == "SUCCESS" {
				if txn.SourceAccountID == payload.AccountID {
					totalOutflows += txn.Amount
				}
				if txn.DestinationAccountID == payload.AccountID {
					totalInflows += txn.Amount
				}
				// Deposits
				if txn.Type == "DEPOSIT_COMPLETED" {
					totalInflows += txn.Amount
				}
			}

			// Page break if getting close to bottom
			if pdf.GetY() > 260 {
				pdf.AddPage()
				// Re-draw header
				pdf.SetFont("Arial", "B", 8)
				pdf.SetFillColor(30, 80, 50)
				pdf.SetTextColor(255, 255, 255)
				for i, header := range headers {
					pdf.CellFormat(colWidths[i], 8, header, "1", 0, "C", true, 0, "")
				}
				pdf.Ln(-1)
				pdf.SetFont("Arial", "", 7)
				pdf.SetTextColor(40, 40, 40)
			}
		}

		// --- Summary ---
		pdf.Ln(8)
		pdf.SetDrawColor(30, 80, 50)
		pdf.Line(15, pdf.GetY(), 195, pdf.GetY())
		pdf.Ln(4)

		pdf.SetFont("Arial", "B", 10)
		pdf.SetTextColor(40, 40, 40)
		pdf.CellFormat(0, 7, "Resumen del Periodo", "", 1, "L", false, 0, "")

		pdf.SetFont("Arial", "", 10)
		pdf.CellFormat(0, 6, fmt.Sprintf("Total transacciones: %d", len(payload.Transactions)), "", 1, "L", false, 0, "")
		pdf.CellFormat(0, 6, fmt.Sprintf("Total ingresos: %.2f CCC", totalInflows), "", 1, "L", false, 0, "")
		pdf.CellFormat(0, 6, fmt.Sprintf("Total egresos: %.2f CCC", totalOutflows), "", 1, "L", false, 0, "")
		pdf.CellFormat(0, 6, fmt.Sprintf("Neto del periodo: %.2f CCC", totalInflows-totalOutflows), "", 1, "L", false, 0, "")
	}

	// --- Footer ---
	pdf.Ln(15)
	pdf.SetFont("Arial", "I", 8)
	pdf.SetTextColor(150, 150, 150)
	pdf.CellFormat(0, 5, "Documento generado automaticamente por CocoCash. Este extracto es un comprobante informativo.", "", 1, "C", false, 0, "")

	// Output to bytes
	var buf bytes.Buffer
	err := pdf.Output(&buf)
	if err != nil {
		return nil, fmt.Errorf("failed to write PDF to buffer: %w", err)
	}

	return buf.Bytes(), nil
}

// getEnv reads an environment variable with a fallback
func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
