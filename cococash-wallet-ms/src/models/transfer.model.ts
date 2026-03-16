/**
 * Transfer Model - CocoCash Wallet MS
 * RF-07: Initiate transfer
 * RF-09: Asynchronous processing
 */

export interface Transfer {
    id: string;
    transferCode: string;
    sourceAccountId: string;
    destinationAccountId: string;
    amount: number;
    currency: string;
    status: TransferStatus;
    description?: string;
    createdAt: Date;
    processedAt?: Date;
    failureReason?: string;
}

export enum TransferStatus {
    PENDING = 'PENDING',
    PROCESSING = 'PROCESSING',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED'
}

export interface TransferRequest {
    sourceAccountNumber: string;
    destinationAccountNumber: string;
    amount: number;
    description?: string;
}

export interface TransferResponse {
    transferId: string;
    transferCode: string;
    status: TransferStatus;
    message: string;
}

// Domain Events
export interface TransferCompletedEvent {
    eventType: 'transfer.completed';
    transferId: string;
    sourceAccountId: string;
    destinationAccountId: string;
    sourceUserId: string;
    destinationUserId: string;
    amount: number;
    timestamp: Date;
}

export interface TransferFailedEvent {
    eventType: 'transfer.failed';
    transferId: string;
    sourceAccountId: string;
    destinationAccountId: string;
    sourceUserId: string;
    destinationUserId: string;
    reason: string;
    amount: number;
    timestamp: Date;
}
