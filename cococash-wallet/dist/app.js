"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const routes_1 = __importDefault(require("./routes"));
const error_middleware_1 = require("./middlewares/error.middleware");
const health_routes_1 = __importDefault(require("./routes/health.routes"));
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use("/v1", routes_1.default);
app.use(error_middleware_1.errorHandler);
app.use("/v1", health_routes_1.default);
exports.default = app;
