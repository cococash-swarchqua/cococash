import { pool } from "../config/db";
import { v4 as uuidv4 } from "uuid";
import { AppError } from "../errors/AppError";
import * as accountRepository from "../repositories/account.repository";
import * as transferRepository from "../repositories/transfer.repository";

export const processTransfer = async (
  sourceId: string,
  destinationId: string,
  amount: number
) => {
  if (amount <= 0) {
    throw new AppError("Transfer amount must be greater than zero", 400);
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Lock source account
    const source = await accountRepository.findAccountForUpdate(
      client,
      sourceId
    );

    if (!source) {
      throw new AppError("Source account not found", 404);
    }

    if (Number(source.balance) < amount) {
      throw new AppError("Insufficient funds", 422);
    }

    // Lock destination account
    const destination = await accountRepository.findAccountForUpdate(
      client,
      destinationId
    );

    if (!destination) {
      throw new AppError("Destination account not found", 404);
    }

    // Update balances
    const newSourceBalance = Number(source.balance) - amount;
    const newDestinationBalance = Number(destination.balance) + amount;

    await accountRepository.updateBalanceTx(
      client,
      sourceId,
      newSourceBalance
    );

    await accountRepository.updateBalanceTx(
      client,
      destinationId,
      newDestinationBalance
    );

    const transferId = uuidv4();

    await transferRepository.insertTransfer(
      client,
      transferId,
      sourceId,
      destinationId,
      amount,
      "COMPLETED"
    );

    await client.query("COMMIT");

    return { transferId, status: "COMPLETED" };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};