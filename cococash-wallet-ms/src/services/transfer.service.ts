/**
 * Transfer Service - CocoCash Wallet MS
 * RF-07: Initiate transfer
 * RF-08: Validate transfer (balance, destination)
 * RF-09: Async event-driven processing
 * RF-10: Concurrency & consistency (DB transactions, row-locking)
 * RF-11: Update balances upon completion
 */

import { Pool } from 'pg';
import { AccountRepository } from '../repositories/account.repository';
import { TransferRepository } from '../repositories/transfer.repository';
import { TransferPublisher } from '../events/publishers/transfer.publisher';
import {
    Transfer,
    TransferRequest,
    TransferResponse,
    TransferStatus
} from '../models/transfer.model';

export class TransferService {
    private accountRepository: AccountRepository;
    private transferRepository: TransferRepository;

    constructor(
        private pool: Pool,
        private eventPublisher: TransferPublisher
    ) {
        this.accountRepository = new AccountRepository(pool);
        this.transferRepository = new TransferRepository(pool);
    }

    /**
     * Execute a transfer synchronously (validation + processing in one step)
     * RF-07: Initiate transfer
     * RF-08: Validate request
     * RF-10: Concurrency & consistency (row-level locking)
     * RF-11: Update balances upon completion
     */
    async executeTransfer(request: TransferRequest): Promise<TransferResponse> {
        // Basic validation
        if (request.amount <= 0) {
            throw new Error('Transfer amount must be positive');
        }

        if (request.sourceAccountNumber === request.destinationAccountNumber) {
            throw new Error('Source and destination accounts must be different');
        }

        // Resolve account numbers to IDs
        const sourceAccount = await this.accountRepository.findByAccountNumber(request.sourceAccountNumber);
        if (!sourceAccount) {
            throw new Error(`Source account ${request.sourceAccountNumber} not found`);
        }

        const destAccount = await this.accountRepository.findByAccountNumber(request.destinationAccountNumber);
        if (!destAccount) {
            throw new Error(`Destination account ${request.destinationAccountNumber} not found`);
        }

        // Preliminary balance check (will be re-checked with lock)
        if (sourceAccount.balance < request.amount) {
            throw new Error('Insufficient balance');
        }

        const client = await this.pool.connect();
        let transfer: Transfer;

        try {
            await client.query('BEGIN');

            // Create transfer record
            transfer = await this.transferRepository.create(
                client,
                sourceAccount.id,
                destAccount.id,
                request.amount,
                request.description
            );

            // Lock source and destination accounts (ordered to prevent deadlocks)
            // RF-10: Row-level locking for consistency
            const [firstId, secondId] = [sourceAccount.id, destAccount.id].sort();

            const firstLocked = await this.accountRepository.findByIdForUpdate(client, firstId);
            const secondLocked = await this.accountRepository.findByIdForUpdate(client, secondId);

            const sourceLocked = firstId === sourceAccount.id ? firstLocked : secondLocked;
            const destLocked = firstId === destAccount.id ? firstLocked : secondLocked;

            if (!sourceLocked || !destLocked) {
                await this.transferRepository.updateStatus(client, transfer.id, TransferStatus.FAILED, 'Account not found');
                await client.query('COMMIT');

                await this.eventPublisher.publishTransferFailed({
                    eventType: 'transfer.failed',
                    transferId: transfer.id,
                    sourceAccountId: sourceAccount.id,
                    destinationAccountId: destAccount.id,
                    sourceUserId: sourceAccount.userId,
                    destinationUserId: destAccount.userId,
                    reason: 'Account not found',
                    amount: request.amount,
                    timestamp: new Date()
                });

                return {
                    transferId: transfer.id,
                    transferCode: transfer.transferCode,
                    status: TransferStatus.FAILED,
                    message: 'Transfer failed: account not found'
                };
            }

            // RF-08: Validate balance (with lock held)
            if (sourceLocked.balance < request.amount) {
                await this.transferRepository.updateStatus(client, transfer.id, TransferStatus.FAILED, 'Insufficient balance');
                await client.query('COMMIT');

                await this.eventPublisher.publishTransferFailed({
                    eventType: 'transfer.failed',
                    transferId: transfer.id,
                    sourceAccountId: sourceAccount.id,
                    destinationAccountId: destAccount.id,
                    sourceUserId: sourceAccount.userId,
                    destinationUserId: destAccount.userId,
                    reason: 'Insufficient balance',
                    amount: request.amount,
                    timestamp: new Date()
                });

                return {
                    transferId: transfer.id,
                    transferCode: transfer.transferCode,
                    status: TransferStatus.FAILED,
                    message: 'Transfer failed: insufficient balance'
                };
            }

            // RF-11: Update balances
            const newSourceBalance = sourceLocked.balance - request.amount;
            const newDestBalance = destLocked.balance + request.amount;

            await this.accountRepository.updateBalance(client, sourceAccount.id, newSourceBalance);
            await this.accountRepository.updateBalance(client, destAccount.id, newDestBalance);

            // Mark transfer as completed
            await this.transferRepository.updateStatus(client, transfer.id, TransferStatus.COMPLETED);

            await client.query('COMMIT');

            // Publish transfer.completed event (for transaction-ms)
            await this.eventPublisher.publishTransferCompleted({
                eventType: 'transfer.completed',
                transferId: transfer.id,
                sourceAccountId: sourceAccount.id,
                destinationAccountId: destAccount.id,
                sourceUserId: sourceAccount.userId,
                destinationUserId: destAccount.userId,
                amount: request.amount,
                timestamp: new Date()
            });

            return {
                transferId: transfer.id,
                transferCode: transfer.transferCode,
                status: TransferStatus.COMPLETED,
                message: 'Transfer completed successfully'
            };

        } catch (error) {
            await client.query('ROLLBACK');

            // Try to mark as FAILED
            const retryClient = await this.pool.connect();
            try {
                await this.transferRepository.updateStatus(
                    retryClient,
                    transfer!.id,
                    TransferStatus.FAILED,
                    error instanceof Error ? error.message : 'Unknown error'
                );
            } finally {
                retryClient.release();
            }

            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get transfer status
     */
    async getTransferStatus(transferId: string): Promise<Transfer | null> {
        return this.transferRepository.findById(transferId);
    }

    /**
     * Get transfer history for an account
     */
    async getTransferHistory(accountId: string): Promise<Transfer[]> {
        return this.transferRepository.findByAccountId(accountId);
    }

    /**
     * Get account by public account number.
     * Used for ownership check before initiating a transfer.
     */
    async getAccountByNumber(accountNumber: string) {
        return this.accountRepository.findByAccountNumber(accountNumber);
    }

    /**
     * Get account by ID.
     * Used for ownership check on transfer history queries.
     */
    async getAccountById(accountId: string) {
        return this.accountRepository.findById(accountId);
    }
}
