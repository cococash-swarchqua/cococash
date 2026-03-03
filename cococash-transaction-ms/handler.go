// Transaction Handler - HTTP endpoint handlers
// TRANS-01: GET /v1/transactions/user/:userId
// TRANS-02: GET /v1/transactions/:transactionId

package main

import (
	"net/http"
	"strconv"
)

// TransactionHandler handles HTTP requests for transaction queries
type TransactionHandler struct {
	repo *TransactionRepository
}

// NewTransactionHandler creates a new handler instance
func NewTransactionHandler(repo *TransactionRepository) *TransactionHandler {
	return &TransactionHandler{repo: repo}
}

// GetByUserID handles TRANS-01: GET /v1/transactions/user/:userId
func (h *TransactionHandler) GetByUserID(w http.ResponseWriter, r *http.Request) {
	userID := r.PathValue("userId")
	if userID == "" {
		writeError(w, http.StatusBadRequest, "userId is required")
		return
	}

	// Parse limit parameter (default: 20, max: 100)
	limitStr := r.URL.Query().Get("limit")
	limit := int32(20)
	if limitStr != "" {
		parsed, err := strconv.Atoi(limitStr)
		if err == nil && parsed > 0 {
			limit = int32(parsed)
			if limit > 100 {
				limit = 100
			}
		}
	}

	records, err := h.repo.GetByUserID(r.Context(), userID, limit)
	if err != nil {
		logError("Failed to get transactions by user", err)
		writeError(w, http.StatusInternalServerError, "Failed to retrieve transactions")
		return
	}

	if records == nil {
		records = []TransactionRecord{}
	}

	writeSuccess(w, UserTransactionsResponse{
		UserID:       userID,
		Transactions: records,
		Count:        len(records),
	})
}

// GetByID handles TRANS-02: GET /v1/transactions/:transactionId
func (h *TransactionHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	transactionID := r.PathValue("transactionId")
	if transactionID == "" {
		writeError(w, http.StatusBadRequest, "transactionId is required")
		return
	}

	record, err := h.repo.GetByTransactionID(r.Context(), transactionID)
	if err != nil {
		logError("Failed to get transaction by ID", err)
		writeError(w, http.StatusInternalServerError, "Failed to retrieve transaction")
		return
	}

	if record == nil {
		writeError(w, http.StatusNotFound, "Transaction not found")
		return
	}

	// Build TRANS-02 response with audit trail
	response := TransactionDetailResponse{
		TransactionID:        record.TransactionID,
		TransferID:           record.TransferID,
		SourceAccountID:      record.SourceAccountID,
		DestinationAccountID: record.DestinationAccountID,
		Amount:               record.Amount,
		Currency:             record.Currency,
		Status:               record.Status,
		Description:          record.Description,
		CreatedAt:            record.Timestamp,
		ProcessedAt:          record.RecordedAt,
		AuditTrail: AuditTrail{
			EventSource: record.EventSource,
			EventType:   record.EventType,
			RecordedAt:  record.RecordedAt,
		},
	}

	writeSuccess(w, response)
}
