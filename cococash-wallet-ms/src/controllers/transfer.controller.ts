/**
 * Transfer Controller - CocoCash Wallet MS
 * RF-07: Initiate transfer
 */

import { Router, Request, Response, NextFunction } from 'express';
import { TransferService } from '../services/transfer.service';
import { cognitoAuthMiddleware, AuthenticatedRequest } from '../middleware/cognito.middleware';

export class TransferController {
    public router: Router;

    constructor(private transferService: TransferService) {
        this.router = Router();
        this.initializeRoutes();
    }

    private initializeRoutes(): void {
        // All transfer routes require a valid Cognito JWT
        this.router.use(cognitoAuthMiddleware);

        /**
         * POST /transfers
         * RF-07: Initiate transfer (sync validation, async processing).
         * Ownership check: sourceAccountNumber must belong to the caller.
         */
        this.router.post('/', this.initiateTransfer.bind(this));

        /**
         * GET /transfers/:transferId
         * Get transfer status by ID.
         */
        this.router.get('/:transferId', this.getTransferStatus.bind(this));

        /**
         * GET /transfers/account/:accountId
         * Get transfer history for an account.
         * Ownership check: accountId must belong to the caller.
         */
        this.router.get('/account/:accountId', this.getTransferHistory.bind(this));
    }

    /**
     * POST /transfers — initiate a transfer.
     * Ownership check: verifies the source account belongs to the authenticated user
     * so a user cannot initiate transfers from another person's account
     * even if they know the account number.
     */
    private async initiateTransfer(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { sourceAccountNumber, destinationAccountNumber, amount, description } = req.body;
            const userId = (req as AuthenticatedRequest).cognitoUserId;

            if (!sourceAccountNumber || !destinationAccountNumber || !amount) {
                res.status(400).json({
                    error: 'sourceAccountNumber, destinationAccountNumber, and amount are required'
                });
                return;
            }

            // Ownership check: source account must belong to the authenticated user
            const sourceAccount = await this.transferService.getAccountByNumber(sourceAccountNumber);
            if (!sourceAccount || sourceAccount.userId !== userId) {
                res.status(403).json({
                    error: 'Forbidden: source account does not belong to you'
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

    /**
     * GET /transfers/:transferId — get transfer status.
     * No ownership check here: transfer codes are semi-public (like a payment receipt).
     * If stricter privacy is needed this can be added later.
     */
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

    /**
     * GET /transfers/account/:accountId — get transfer history.
     * Ownership check: callers can only query history for their own accounts.
     */
    private async getTransferHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { accountId } = req.params;
            const userId = (req as AuthenticatedRequest).cognitoUserId;

            // Ownership check
            const account = await this.transferService.getAccountById(accountId);
            if (!account) {
                res.status(404).json({ error: 'Account not found' });
                return;
            }
            if (account.userId !== userId) {
                res.status(403).json({ error: 'Forbidden' });
                return;
            }

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
