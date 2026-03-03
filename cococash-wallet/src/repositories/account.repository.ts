import { pool } from "../config/db";
import { Account } from "../types";
import { PoolClient } from "pg";

/**
 * =========================
 *  STANDARD OPERATIONS
 * =========================
 */

export const insertAccount = async (account: Account): Promise<void> => {
  const query = `
    INSERT INTO accounts (
      id,
      user_id,
      account_number,
      balance,
      currency,
      status,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, now(), now())
  `;

  const values = [
    account.id,
    account.userId,
    account.accountNumber,
    account.balance,
    account.currency,
    account.status,
  ];

  await pool.query(query, values);
};

export const findAccountById = async (
  accountId: string
): Promise<Account | null> => {
  const result = await pool.query(
    `SELECT id, user_id, account_number, balance, currency, status
     FROM accounts
     WHERE id = $1`,
    [accountId]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];

  return {
    id: row.id,
    userId: row.user_id,
    accountNumber: row.account_number,
    balance: Number(row.balance),
    currency: row.currency,
    status: row.status,
  };
};

export const updateBalance = async (
  accountId: string,
  newBalance: number
): Promise<void> => {
  await pool.query(
    `UPDATE accounts
     SET balance = $1,
         updated_at = now()
     WHERE id = $2`,
    [newBalance, accountId]
  );
};

/**
 * =========================
 *  TRANSACTIONAL OPERATIONS
 *  (Used inside BEGIN/COMMIT blocks)
 * =========================
 */

export const findAccountForUpdate = async (
  client: PoolClient,
  accountId: string
): Promise<{ id: string; balance: number } | null> => {
  const result = await client.query(
    `SELECT id, balance
     FROM accounts
     WHERE id = $1
     FOR UPDATE`,
    [accountId]
  );

  if (result.rows.length === 0) return null;

  return {
    id: result.rows[0].id,
    balance: Number(result.rows[0].balance),
  };
};

export const updateBalanceTx = async (
  client: PoolClient,
  accountId: string,
  newBalance: number
): Promise<void> => {
  await client.query(
    `UPDATE accounts
     SET balance = $1,
         updated_at = now()
     WHERE id = $2`,
    [newBalance, accountId]
  );
};