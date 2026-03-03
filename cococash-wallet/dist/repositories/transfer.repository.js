"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.insertTransfer = void 0;
const insertTransfer = async (client, transferId, sourceId, destinationId, amount, status) => {
    await client.query(`INSERT INTO transfers (
        id,
        source_account_id,
        destination_account_id,
        amount,
        status,
        created_at
     )
     VALUES ($1, $2, $3, $4, $5, now())`, [transferId, sourceId, destinationId, amount, status]);
};
exports.insertTransfer = insertTransfer;
