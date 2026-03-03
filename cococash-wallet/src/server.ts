import app from "./app";
import { logger } from "./config/logger";
import { pool } from "./config/db";
import { setShuttingDown } from "./config/appState";

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  logger.info(`Wallet MS running on port ${PORT}`);
});

// Graceful shutdown
const shutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  setShuttingDown();

  server.close(async () => {
    logger.info("HTTP server closed.");

    try {
      await pool.end();
      logger.info("Database connections closed.");
      process.exit(0);
    } catch (err) {
      if (err instanceof Error) {
        logger.error(`Error closing database connections: ${err.stack ?? err.message}`);
      }
      process.exit(1);
    }
  });

  setTimeout(() => {
    logger.error("Forcing shutdown after timeout.");
    process.exit(1);
  }, Number(process.env.SHUTDOWN_TIMEOUT_MS) || 10000);
};


process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));