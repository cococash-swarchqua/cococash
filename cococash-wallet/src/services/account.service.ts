import { v4 as uuidv4 } from "uuid";
import * as accountRepository from "../repositories/account.repository";
import { AppError } from "../errors/AppError";
import { Account } from "../types";

export const createAccount = async (
  userId: string,
  initialBalance: number
): Promise<Account> => {
  if (initialBalance < 0) {
    throw new AppError("Initial balance cannot be negative", 400);
  }

  const account: Account = {
    id: uuidv4(),
    userId,
    accountNumber: generateAccountNumber(),
    balance: initialBalance,
    currency: "CCC",
    status: "ACTIVE",
  };

  await accountRepository.insertAccount(account);

  return account;
};

export const getBalance = async (accountId: string) => {
  const account = await accountRepository.findAccountById(accountId);

  if (!account) {
    throw new AppError("Account not found", 404);
  }

  return {
    balance: account.balance,
    currency: account.currency,
  };
};

/**
 * Utility function to generate a pseudo-random account number.
 * In production, this should be deterministic and collision-safe.
 */
const generateAccountNumber = (): string => {
  const random = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `ACC-${random}`;
};