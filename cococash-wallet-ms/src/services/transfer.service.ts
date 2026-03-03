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
     * Initiate a transfer request (synchronous validation, async processing)
     * RF-07: Initiate transfer
     * RF-08: Validate request
     */
    async initiateTransfer(request: TransferRequest): Promise<TransferResponse> {
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

        // Check balance (preliminary - will be re-checked with lock during processing)
        if (sourceAccount.balance < request.amount) {
            throw new Error('Insufficient balance');
        }

        // Create transfer record with PENDING status
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            const transfer = await this.transferRepository.create(
                client,
                sourceAccount.id,
                destAccount.id,
                request.amount,
                request.description
            );

            await client.query('COMMIT');

            // Publish transfer.initiated event for async processing
            // RF-09: Event-driven mechanism
            await this.eventPublisher.publishTransferInitiated({
                eventType: 'transfer.initiated',
                transferId: transfer.id,
                sourceAccountId: transfer.sourceAccountId,
                destinationAccountId: transfer.destinationAccountId,
                amount: transfer.amount,
                timestamp: new Date()
            });

            return {
                transferId: transfer.id,
                transferCode: transfer.transferCode,
                status: TransferStatus.PENDING,
                message: 'Transfer initiated successfully. Processing asynchronously.'
            };

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Process transfer with row-level locking
     * RF-10: Handle concurrent operations consistently
     * RF-11: Update balances upon completion
     * 
     * Called by SQS consumer
     */
    async processTransfer(transferId: string): Promise<void> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Get transfer record
            const transfer = await this.transferRepository.findById(transferId);
            if (!transfer) {
                throw new Error(`Transfer ${transferId} not found`);
            }

            if (transfer.status !== TransferStatus.PENDING) {
                // Already processed (idempotency)
                return;
            }

            // Lock source and destination accounts (ordered to prevent deadlocks)
            // RF-10: Row-level locking for consistency
            const [firstId, secondId] = [transfer.sourceAccountId, transfer.destinationAccountId].sort();

            const firstAccount = await this.accountRepository.findByIdForUpdate(client, firstId);
            const secondAccount = await this.accountRepository.findByIdForUpdate(client, secondId);

            const sourceAccount = firstId === transfer.sourceAccountId ? firstAccount : secondAccount;
            const destAccount = firstId === transfer.destinationAccountId ? firstAccount : secondAccount;

            if (!sourceAccount || !destAccount) {
                await this.transferRepository.updateStatus(client, transferId, TransferStatus.FAILED, 'Account not found');
                await client.query('COMMIT');
                return;
            }

            // RF-08: Validate balance (with lock held)
            if (sourceAccount.balance < transfer.amount) {
                await this.transferRepository.updateStatus(client, transferId, TransferStatus.FAILED, 'Insufficient balance');
                await client.query('COMMIT');

                await this.eventPublisher.publishTransferFailed({
                    eventType: 'transfer.failed',
                    transferId,
                    reason: 'Insufficient balance',
                    timestamp: new Date()
                });
                return;
            }

            // RF-11: Update balances
            const newSourceBalance = sourceAccount.balance - transfer.amount;
            const newDestBalance = destAccount.balance + transfer.amount;

            await this.accountRepository.updateBalance(client, sourceAccount.id, newSourceBalance);
            await this.accountRepository.updateBalance(client, destAccount.id, newDestBalance);

            // Mark transfer as completed
            await this.transferRepository.updateStatus(client, transferId, TransferStatus.COMPLETED);

            await client.query('COMMIT');

            // Publish transfer.completed event
            await this.eventPublisher.publishTransferCompleted({
                eventType: 'transfer.completed',
                transferId,
                sourceAccountId: transfer.sourceAccountId,
                destinationAccountId: transfer.destinationAccountId,
                amount: transfer.amount,
                timestamp: new Date()
            });

        } catch (error) {
            await client.query('ROLLBACK');

            // Update status to FAILED
            const retryClient = await this.pool.connect();
            try {
                await this.transferRepository.updateStatus(
                    retryClient,
                    transferId,
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
}
