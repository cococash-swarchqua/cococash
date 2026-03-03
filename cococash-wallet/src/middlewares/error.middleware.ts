import { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/AppError";
import { logger } from "../config/logger";

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {

logger.error(err);

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
    });
  }

  // PostgreSQL unique violation
  if (err.code === "23505") {
    return res.status(409).json({
      error: "Resource already exists",
      detail: err.detail,
    });
  }

  return res.status(500).json({
    error: "Internal server error",
  });
};