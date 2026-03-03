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
    AccountBalanceResponse
} from '../models/account.model';

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
        // Check if user already has an account
        const existingAccount = await this.accountRepository.findByUserId(userId);
        if (existingAccount) {
            throw new Error(`User ${userId} already has a wallet account`);
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
     * Get account by user ID
     */
    async getAccountByUserId(userId: string): Promise<Account | null> {
        return this.accountRepository.findByUserId(userId);
    }
}
