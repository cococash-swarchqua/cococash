"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../config/db");
const appState_1 = require("../config/appState");
const router = (0, express_1.Router)();
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
    if ((0, appState_1.getShuttingDown)()) {
        return res.status(503).json({
            status: "shutting_down",
        });
    }
    try {
        await db_1.pool.query("SELECT 1");
        return res.status(200).json({
            status: "ready",
        });
    }
    catch {
        return res.status(503).json({
            status: "db_unavailable",
        });
    }
});
exports.default = router;
