"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.processTransfer = void 0;
const db_1 = require("../config/db");
const uuid_1 = require("uuid");
const AppError_1 = require("../errors/AppError");
const accountRepository = __importStar(require("../repositories/account.repository"));
const transferRepository = __importStar(require("../repositories/transfer.repository"));
const processTransfer = async (sourceId, destinationId, amount) => {
    if (amount <= 0) {
        throw new AppError_1.AppError("Transfer amount must be greater than zero", 400);
    }
    const client = await db_1.pool.connect();
    try {
        await client.query("BEGIN");
        // Lock source account
        const source = await accountRepository.findAccountForUpdate(client, sourceId);
        if (!source) {
            throw new AppError_1.AppError("Source account not found", 404);
        }
        if (Number(source.balance) < amount) {
            throw new AppError_1.AppError("Insufficient funds", 422);
        }
        // Lock destination account
        const destination = await accountRepository.findAccountForUpdate(client, destinationId);
        if (!destination) {
            throw new AppError_1.AppError("Destination account not found", 404);
        }
        // Update balances
        const newSourceBalance = Number(source.balance) - amount;
        const newDestinationBalance = Number(destination.balance) + amount;
        await accountRepository.updateBalanceTx(client, sourceId, newSourceBalance);
        await accountRepository.updateBalanceTx(client, destinationId, newDestinationBalance);
        const transferId = (0, uuid_1.v4)();
        await transferRepository.insertTransfer(client, transferId, sourceId, destinationId, amount, "COMPLETED");
        await client.query("COMMIT");
        return { transferId, status: "COMPLETED" };
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
};
exports.processTransfer = processTransfer;
