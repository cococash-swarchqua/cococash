import { PoolClient } from "pg";

export const insertTransfer = async (
  client: PoolClient,
  transferId: string,
  sourceId: string,
  destinationId: string,
  amount: number,
  status: string
) => {
  await client.query(
    `INSERT INTO transfers (
        id,
        source_account_id,
        destination_account_id,
        amount,
        status,
        created_at
     )
     VALUES ($1, $2, $3, $4, $5, now())`,
    [transferId, sourceId, destinationId, amount, status]
  );
};