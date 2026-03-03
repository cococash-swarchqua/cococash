import { Request, Response, NextFunction } from "express";
import * as transferService from "../services/transfer.service";

export const createTransfer = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { sourceAccountId, destinationAccountId, amount } = req.body;

    const transfer = await transferService.processTransfer(
      sourceAccountId,
      destinationAccountId,
      amount
    );

    res.status(202).json(transfer);
  } catch (error) {
    next(error);
  }
};