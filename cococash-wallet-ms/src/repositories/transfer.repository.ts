/**
 * Transfer Repository - CocoCash Wallet MS
 * RF-07: Store transfer records
 * RF-15: Persist transactional data
 */

import { Pool, PoolClient } from 'pg';
import { Transfer, TransferStatus, TransferRequest } from '../models/transfer.model';
import { v4 as uuidv4 } from 'uuid';

export class TransferRepository {
    constructor(private pool: Pool) { }

    /**
     * Create transfer record with PENDING status
     * RF-07: Initiate transfer
     */
    /**
     * Generate a unique transfer code (format: TRX-XXXXXX)
     */
    private generateTransferCode(): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = 'TRX-';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    async create(
        client: PoolClient,
        sourceAccountId: string,
        destinationAccountId: string,
        amount: number,
        description?: string
    ): Promise<Transfer> {
        const id = uuidv4();
        const transferCode = this.generateTransferCode();
        const now = new Date();

        const query = `
      INSERT INTO transfers (id, transfer_code, source_account_id, destination_account_id, amount, currency, status, description, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

        const values = [
            id,
            transferCode,
            sourceAccountId,
            destinationAccountId,
            amount,
            'CCC',
            TransferStatus.PENDING,
            description || null,
            now
        ];

        const result = await client.query(query, values);
        return this.mapToTransfer(result.rows[0]);
    }

    /**
     * Find transfer by ID
     */
    async findById(transferId: string): Promise<Transfer | null> {
        const query = 'SELECT * FROM transfers WHERE id = $1';
        const result = await this.pool.query(query, [transferId]);

        if (result.rows.length === 0) return null;
        return this.mapToTransfer(result.rows[0]);
    }

    /**
     * Update transfer status
     * RF-09: Track async processing state
     */
    async updateStatus(
        client: PoolClient,
        transferId: string,
        status: TransferStatus,
        failureReason?: string
    ): Promise<void> {
        const query = `
      UPDATE transfers 
      SET status = $1, 
          processed_at = $2,
          failure_reason = $3
      WHERE id = $4
    `;
        await client.query(query, [status, new Date(), failureReason || null, transferId]);
    }

    /**
     * Get transfer history for an account
     */
    async findByAccountId(accountId: string, limit: number = 50): Promise<Transfer[]> {
        const query = `
      SELECT * FROM transfers 
      WHERE source_account_id = $1 OR destination_account_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;
        const result = await this.pool.query(query, [accountId, limit]);
        return result.rows.map(row => this.mapToTransfer(row));
    }

    private mapToTransfer(row: any): Transfer {
        return {
            id: row.id,
            transferCode: row.transfer_code,
            sourceAccountId: row.source_account_id,
            destinationAccountId: row.destination_account_id,
            amount: parseFloat(row.amount),
            currency: row.currency,
            status: row.status as TransferStatus,
            description: row.description,
            createdAt: row.created_at,
            processedAt: row.processed_at,
            failureReason: row.failure_reason
        };
    }
}
