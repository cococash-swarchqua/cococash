/**
 * Account Service - CocoCash Wallet MS
 * RF-04: Create wallet upon registration
 * RF-05: Maintain balance
 * RF-06: Query balance
 */

import { Pool } from 'pg';
import { AccountRepository } from '../repositories/account.repository';
import { TransferPublisher } from '../events/publishers/transfer.publisher';
import {
    Account,
    CreateAccountRequest,
    AccountBalanceResponse,
    DepositResponse
} from '../models/account.model';
import { v4 as uuidv4 } from 'uuid';

export class AccountService {
    private accountRepository: AccountRepository;

    constructor(
        private pool: Pool,
        private eventPublisher: TransferPublisher
    ) {
        this.accountRepository = new AccountRepository(pool);
    }

    /**
     * Create wallet account for user
     * RF-04: Create digital wallet upon successful registration
     */
    async createAccount(userId: string, initialBalance: number = 0): Promise<Account> {
        // Idempotent: if JITP already provisioned the wallet, just return it
        const existingAccount = await this.accountRepository.findByUserId(userId);
        if (existingAccount) {
            return existingAccount;
        }

        const request: CreateAccountRequest = {
            userId,
            initialBalance
        };

        const account = await this.accountRepository.create(request);

        // Publish account.created event
        await this.eventPublisher.publishAccountCreated({
            eventType: 'account.created',
            accountId: account.id,
            userId: account.userId,
            timestamp: new Date()
        });

        return account;
    }

    /**
     * Get account by ID
     * Used for ownership checks in controllers
     */
    async getAccountById(accountId: string): Promise<Account | null> {
        return this.accountRepository.findById(accountId);
    }

    /**
     * Get account balance
     * RF-06: Query current account balance
     */
    async getBalance(accountId: string): Promise<AccountBalanceResponse> {
        const account = await this.accountRepository.findById(accountId);

        if (!account) {
            throw new Error(`Account ${accountId} not found`);
        }

        return {
            accountId: account.id,
            balance: account.balance,
            currency: account.currency,
            lastUpdated: account.updatedAt
        };
    }

    /**
     * Deposit funds into the authenticated user's account.
     * RF-05: Maintain balance
     * Uses a DB transaction with row-level locking to prevent race conditions.
     * Publishes deposit.completed to SNS after successful commit.
     */
    async deposit(userId: string, amount: number, description?: string): Promise<DepositResponse> {
        if (amount <= 0) {
            throw new Error('Deposit amount must be a positive number');
        }

        const depositId = uuidv4();
        const client = await this.pool.connect();

        let account: Account | null = null;
        let previousBalance = 0;

        try {
            await client.query('BEGIN');

            // Lock the account row to prevent concurrent deposit race conditions
            account = await this.accountRepository.findByUserIdForUpdate(client, userId);
            if (!account) {
                throw new Error(`No wallet found for user ${userId}`);
            }

            previousBalance = account.balance;
            const newBalance = previousBalance + amount;

            await this.accountRepository.updateBalance(client, account.id, newBalance);
            await client.query('COMMIT');

            // Reload with fresh balance after commit
            account.balance = newBalance;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

        // Publish AFTER DB commit — a SNS failure must not revert a committed deposit
        await this.eventPublisher.publishDepositCompleted({
            eventType: 'deposit.completed',
            depositId,
            accountId: account.id,
            userId,
            amount,
            newBalance: account.balance,
            description,
            timestamp: new Date()
        });

        return {
            accountId: account.id,
            accountNumber: account.accountNumber,
            previousBalance,
            depositAmount: amount,
            newBalance: account.balance,
            currency: account.currency,
            depositId
        };
    }

    /**
     * Get account by user ID.
     * JITP (Just-In-Time Provisioning): if the wallet doesn't exist
     * (edge case — e.g. frontend skipped POST /accounts), create it now.
     */
    async getAccountByUserId(userId: string): Promise<Account> {
        let account = await this.accountRepository.findByUserId(userId);

        if (!account) {
            console.warn(`[JITP] Wallet not found for user ${userId}, provisioning...`);
            account = await this.accountRepository.create({ userId, initialBalance: 0 });
            await this.eventPublisher.publishAccountCreated({
                eventType: 'account.created',
                accountId: account.id,
                userId: account.userId,
                timestamp: new Date()
            });
        }

        return account;
    }
}
