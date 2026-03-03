"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateBalanceTx = exports.findAccountForUpdate = exports.updateBalance = exports.findAccountById = exports.insertAccount = void 0;
const db_1 = require("../config/db");
/**
 * =========================
 *  STANDARD OPERATIONS
 * =========================
 */
const insertAccount = async (account) => {
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
    await db_1.pool.query(query, values);
};
exports.insertAccount = insertAccount;
const findAccountById = async (accountId) => {
    const result = await db_1.pool.query(`SELECT id, user_id, account_number, balance, currency, status
     FROM accounts
     WHERE id = $1`, [accountId]);
    if (result.rows.length === 0)
        return null;
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
exports.findAccountById = findAccountById;
const updateBalance = async (accountId, newBalance) => {
    await db_1.pool.query(`UPDATE accounts
     SET balance = $1,
         updated_at = now()
     WHERE id = $2`, [newBalance, accountId]);
};
exports.updateBalance = updateBalance;
/**
 * =========================
 *  TRANSACTIONAL OPERATIONS
 *  (Used inside BEGIN/COMMIT blocks)
 * =========================
 */
const findAccountForUpdate = async (client, accountId) => {
    const result = await client.query(`SELECT id, balance
     FROM accounts
     WHERE id = $1
     FOR UPDATE`, [accountId]);
    if (result.rows.length === 0)
        return null;
    return {
        id: result.rows[0].id,
        balance: Number(result.rows[0].balance),
    };
};
exports.findAccountForUpdate = findAccountForUpdate;
const updateBalanceTx = async (client, accountId, newBalance) => {
    await client.query(`UPDATE accounts
     SET balance = $1,
         updated_at = now()
     WHERE id = $2`, [newBalance, accountId]);
};
exports.updateBalanceTx = updateBalanceTx;
