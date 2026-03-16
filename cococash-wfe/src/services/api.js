/**
 * API Service — CocoCash Frontend
 *
 * Centralized HTTP client that:
 * - Points to the API Gateway URL (injected at build time)
 * - Automatically attaches the Cognito ID token to every request
 */

import { getIdToken } from './cognito';

const API_BASE = import.meta.env.VITE_API_URL;

/**
 * Generic fetch wrapper with auth.
 */
async function request(path, options = {}) {
  const token = await getIdToken();

  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = new Error(body.error || `HTTP ${res.status}`);
    error.status = res.status;
    throw error;
  }

  return res.json();
}

// -----------------------------------------------
// Accounts
// -----------------------------------------------

/** POST /v1/accounts — create wallet (idempotent) */
export function createAccount() {
  return request('/v1/accounts', { method: 'POST' });
}

/** GET /v1/accounts/me — get my account (JITP) */
export function getMyAccount() {
  return request('/v1/accounts/me');
}

/** GET /v1/accounts/:accountId/balance */
export function getAccountBalance(accountId) {
  return request(`/v1/accounts/${accountId}/balance`);
}

// -----------------------------------------------
// Transfers
// -----------------------------------------------

/** POST /v1/transfers — initiate a transfer */
export function initiateTransfer(sourceAccountNumber, destinationAccountNumber, amount) {
  return request('/v1/transfers', {
    method: 'POST',
    body: JSON.stringify({ sourceAccountNumber, destinationAccountNumber, amount }),
  });
}

/** GET /v1/transfers/:transferId — get transfer status */
export function getTransferStatus(transferId) {
  return request(`/v1/transfers/${transferId}`);
}

/** GET /v1/transfers/account/:accountId — get transfer history */
export function getTransferHistory(accountId) {
  return request(`/v1/transfers/account/${accountId}`);
}

/**
 * GET /v1/reports/:accountId/download?period=YYYY-MM
 * Requests a presigned URL for downloading the monthly bank statement PDF.
 */
export function getReportDownloadUrl(accountId, period) {
  return request(`/v1/reports/${accountId}/download?period=${period}`);
}

// -----------------------------------------------
// Deposits
// -----------------------------------------------

/** POST /v1/accounts/me/deposit — add funds to the authenticated user's wallet */
export function depositFunds(amount, description = '') {
  return request('/v1/accounts/me/deposit', {
    method: 'POST',
    body: JSON.stringify({ amount, description }),
  });
}

