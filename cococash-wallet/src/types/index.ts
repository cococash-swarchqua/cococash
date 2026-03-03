export interface Account {
  id: string;
  userId: string;
  accountNumber: string;
  balance: number;
  currency: string;
  status: "ACTIVE" | "SUSPENDED" | "CLOSED";
}

export interface TransferRequest {
  sourceAccountId: string;
  destinationAccountId: string;
  amount: number;
}

export type TransferStatus = "PENDING" | "COMPLETED" | "FAILED";