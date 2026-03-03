import { Request, Response, NextFunction } from "express";
import * as accountService from "../services/account.service";

export const createAccount = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId, initialBalance } = req.body;

    const account = await accountService.createAccount(
      userId,
      initialBalance
    );

    res.status(201).json(account);
  } catch (error) {
    next(error);
  }
};

export const getBalance = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    const balance = await accountService.getBalance(id);

    res.json(balance);
  } catch (error) {
    next(error);
  }
};