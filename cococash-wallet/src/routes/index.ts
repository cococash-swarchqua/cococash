import { Router } from "express";
import { createAccount, getBalance } from "../controllers/account.controller";
import { createTransfer } from "../controllers/transfer.controller";

const router = Router();

router.get("/health", (_, res) => {
  res.status(200).json({ status: "healthy" });
});

router.post("/accounts", createAccount);
router.get("/accounts/:id/balance", getBalance);
router.post("/transfers", createTransfer);

export default router;