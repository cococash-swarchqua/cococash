import { Router } from "express";
import { pool } from "../config/db";
import { getShuttingDown } from "../config/appState";

const router = Router();

/**
 * Liveness probe
 * Only checks if process is running.
 */
router.get("/health", (_, res) => {
  res.status(200).json({ status: "alive" });
});

/**
 * Readiness probe
 * Checks DB connectivity and shutdown state.
 */
router.get("/ready", async (_, res) => {
  if (getShuttingDown()) {
    return res.status(503).json({
      status: "shutting_down",
    });
  }

  try {
    await pool.query("SELECT 1");
    return res.status(200).json({
      status: "ready",
    });
  } catch {
    return res.status(503).json({
      status: "db_unavailable",
    });
  }
});

export default router;