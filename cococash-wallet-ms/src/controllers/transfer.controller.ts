/**
 * Transfer Controller - CocoCash Wallet MS
 * RF-07: Initiate transfer
 */

import { Router, Request, Response, NextFunction } from 'express';
import { TransferService } from '../services/transfer.service';
import { TransferRequest } from '../models/transfer.model';

export class TransferController {
    public router: Router;

    constructor(private transferService: TransferService) {
        this.router = Router();
        this.initializeRoutes();
    }

    private initializeRoutes(): void {
        /**
         * POST /transfers
         * RF-07: Initiate transfer (sync validation, async processing)
         */
        this.router.post('/', this.initiateTransfer.bind(this));

        /**
         * GET /transfers/:transferId
         * Get transfer status
         */
        this.router.get('/:transferId', this.getTransferStatus.bind(this));

        /**
         * GET /transfers/account/:accountId
         * Get transfer history for account
         */
        this.router.get('/account/:accountId', this.getTransferHistory.bind(this));
    }

    private async initiateTransfer(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { sourceAccountNumber, destinationAccountNumber, amount, description } = req.body;

            // Validation
            if (!sourceAccountNumber || !destinationAccountNumber || !amount) {
                res.status(400).json({
                    error: 'sourceAccountNumber, destinationAccountNumber, and amount are required'
                });
                return;
            }

            const result = await this.transferService.initiateTransfer({
                sourceAccountNumber,
                destinationAccountNumber,
                amount: parseFloat(amount),
                description
            });

            res.status(202).json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    private async getTransferStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { transferId } = req.params;

            const transfer = await this.transferService.getTransferStatus(transferId);

            if (!transfer) {
                res.status(404).json({ error: 'Transfer not found' });
                return;
            }

            res.status(200).json({
                success: true,
                data: transfer
            });
        } catch (error) {
            next(error);
        }
    }

    private async getTransferHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { accountId } = req.params;

            const transfers = await this.transferService.getTransferHistory(accountId);

            res.status(200).json({
                success: true,
                data: transfers
            });
        } catch (error) {
            next(error);
        }
    }
}
