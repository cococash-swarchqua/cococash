"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const account_controller_1 = require("../controllers/account.controller");
const transfer_controller_1 = require("../controllers/transfer.controller");
const router = (0, express_1.Router)();
router.get("/health", (_, res) => {
    res.status(200).json({ status: "healthy" });
});
router.post("/accounts", account_controller_1.createAccount);
router.get("/accounts/:id/balance", account_controller_1.getBalance);
router.post("/transfers", transfer_controller_1.createTransfer);
exports.default = router;
