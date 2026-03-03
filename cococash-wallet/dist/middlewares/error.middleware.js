"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const AppError_1 = require("../errors/AppError");
const logger_1 = require("../config/logger");
const errorHandler = (err, req, res, next) => {
    logger_1.logger.error(err);
    if (err instanceof AppError_1.AppError) {
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
exports.errorHandler = errorHandler;
