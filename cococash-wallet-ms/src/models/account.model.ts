/**
 * Account Model - CocoCash Wallet MS
 * RF-04: Digital wallet account creation
 * RF-05: Simulated monetary balance
 */

export interface Account {
  id: string;
  userId: string;
  accountNumber: string;
  balance: number;
  currency: string;
  status: AccountStatus;
  createdAt: Date;
  updatedAt: Date;
}

export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  CLOSED = 'CLOSED'
}

export interface CreateAccountRequest {
  userId: string;
  initialBalance?: number;
}

export interface AccountBalanceResponse {
  accountId: string;
  balance: number;
  currency: string;
  lastUpdated: Date;
}
