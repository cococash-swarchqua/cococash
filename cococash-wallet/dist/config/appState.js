"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getShuttingDown = exports.setShuttingDown = void 0;
let isShuttingDown = false;
const setShuttingDown = () => {
    isShuttingDown = true;
};
exports.setShuttingDown = setShuttingDown;
const getShuttingDown = () => isShuttingDown;
exports.getShuttingDown = getShuttingDown;
