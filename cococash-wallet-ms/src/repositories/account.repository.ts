/**
 * Account Repository - CocoCash Wallet MS
 * RF-05: Balance management
 * RF-10: Row-level locking for concurrency
 * RF-15: Persist data in managed cloud databases
 */

import { Pool, PoolClient } from 'pg';
import { Account, CreateAccountRequest, AccountStatus } from '../models/account.model';
import { v4 as uuidv4 } from 'uuid';

export class AccountRepository {
    constructor(private pool: Pool) { }

    /**
     * Create a new wallet account
     * RF-04: Create digital wallet upon registration
     */
    /**
     * Generate a random 10-digit account number
     */
    private generateAccountNumber(): string {
        const min = 1000000000;
        const max = 9999999999;
        return String(Math.floor(Math.random() * (max - min + 1)) + min);
    }

    async create(request: CreateAccountRequest): Promise<Account> {
        const id = uuidv4();
        const accountNumber = this.generateAccountNumber();
        const now = new Date();

        const query = `
      INSERT INTO accounts (id, user_id, account_number, balance, currency, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

        const values = [
            id,
            request.userId,
            accountNumber,
            request.initialBalance || 0,
            'CCC', // CocoCash Currency
            AccountStatus.ACTIVE,
            now,
            now
        ];

        const result = await this.pool.query(query, values);
        return this.mapToAccount(result.rows[0]);
    }

    /**
     * Find account by ID
     */
    async findById(accountId: string): Promise<Account | null> {
        const query = 'SELECT * FROM accounts WHERE id = $1';
        const result = await this.pool.query(query, [accountId]);

        if (result.rows.length === 0) return null;
        return this.mapToAccount(result.rows[0]);
    }

    /**
     * Find account by user ID
     */
    async findByUserId(userId: string): Promise<Account | null> {
        const query = 'SELECT * FROM accounts WHERE user_id = $1';
        const result = await this.pool.query(query, [userId]);

        if (result.rows.length === 0) return null;
        return this.mapToAccount(result.rows[0]);
    }

    /**
     * Find account by public account number
     */
    async findByAccountNumber(accountNumber: string): Promise<Account | null> {
        const query = 'SELECT * FROM accounts WHERE account_number = $1';
        const result = await this.pool.query(query, [accountNumber]);

        if (result.rows.length === 0) return null;
        return this.mapToAccount(result.rows[0]);
    }

    /**
     * Get account with row-level lock for concurrent deposits
     * RF-10: Handle concurrent operations consistently
     */
    async findByUserIdForUpdate(client: PoolClient, userId: string): Promise<Account | null> {
        const query = 'SELECT * FROM accounts WHERE user_id = $1 FOR UPDATE';
        const result = await client.query(query, [userId]);

        if (result.rows.length === 0) return null;
        return this.mapToAccount(result.rows[0]);
    }

    /**
     * Get account with row-level lock for concurrent transfers
     * RF-10: Handle concurrent operations consistently
     */
    async findByIdForUpdate(client: PoolClient, accountId: string): Promise<Account | null> {
        const query = 'SELECT * FROM accounts WHERE id = $1 FOR UPDATE';
        const result = await client.query(query, [accountId]);

        if (result.rows.length === 0) return null;
        return this.mapToAccount(result.rows[0]);
    }

    /**
     * Update account balance within transaction
     * RF-11: Update balances upon successful transfer
     */
    async updateBalance(client: PoolClient, accountId: string, newBalance: number): Promise<void> {
        const query = `
      UPDATE accounts 
      SET balance = $1, updated_at = $2 
      WHERE id = $3
    `;
        await client.query(query, [newBalance, new Date(), accountId]);
    }

    private mapToAccount(row: any): Account {
        return {
            id: row.id,
            userId: row.user_id,
            accountNumber: row.account_number,
            balance: parseFloat(row.balance),
            currency: row.currency,
            status: row.status as AccountStatus,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }
}
