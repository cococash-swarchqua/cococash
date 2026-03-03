"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const logger_1 = require("./config/logger");
const db_1 = require("./config/db");
const appState_1 = require("./config/appState");
const PORT = process.env.PORT || 3000;
const server = app_1.default.listen(PORT, () => {
    logger_1.logger.info(`Wallet MS running on port ${PORT}`);
});
// Graceful shutdown
const shutdown = async (signal) => {
    logger_1.logger.info(`Received ${signal}. Starting graceful shutdown...`);
    (0, appState_1.setShuttingDown)();
    server.close(async () => {
        logger_1.logger.info("HTTP server closed.");
        try {
            await db_1.pool.end();
            logger_1.logger.info("Database connections closed.");
            process.exit(0);
        }
        catch (err) {
            if (err instanceof Error) {
                logger_1.logger.error(`Error closing database connections: ${err.stack ?? err.message}`);
            }
            process.exit(1);
        }
    });
    setTimeout(() => {
        logger_1.logger.error("Forcing shutdown after timeout.");
        process.exit(1);
    }, Number(process.env.SHUTDOWN_TIMEOUT_MS) || 10000);
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
