/**
 * Account Controller - CocoCash Wallet MS
 * RF-04: Create wallet
 * RF-06: Query balance
 */

import { Router, Request, Response, NextFunction } from 'express';
import { AccountService } from '../services/account.service';

export class AccountController {
    public router: Router;

    constructor(private accountService: AccountService) {
        this.router = Router();
        this.initializeRoutes();
    }

    private initializeRoutes(): void {
        /**
         * POST /accounts
         * RF-04: Create wallet upon registration
         * Protected by JWT at API Gateway level
         */
        this.router.post('/', this.createAccount.bind(this));

        /**
         * POST /accounts/internal
         * Called by Register Lambda to create wallet on signup
         * Protected at network level (only API Gateway → ALB)
         */
        this.router.post('/internal', this.createAccount.bind(this));

        /**
         * GET /accounts/:accountId/balance
         * RF-06: Query current balance
         */
        this.router.get('/:accountId/balance', this.getBalance.bind(this));

        /**
         * GET /accounts/user/:userId
         * Get account by user ID
         */
        this.router.get('/user/:userId', this.getAccountByUserId.bind(this));
    }

    private async createAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { userId, initialBalance } = req.body;

            if (!userId) {
                res.status(400).json({ error: 'userId is required' });
                return;
            }

            const account = await this.accountService.createAccount(userId, initialBalance);

            res.status(201).json({
                success: true,
                data: account
            });
        } catch (error) {
            next(error);
        }
    }

    private async getBalance(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { accountId } = req.params;

            const balance = await this.accountService.getBalance(accountId);

            res.status(200).json({
                success: true,
                data: balance
            });
        } catch (error) {
            next(error);
        }
    }

    private async getAccountByUserId(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { userId } = req.params;

            const account = await this.accountService.getAccountByUserId(userId);

            if (!account) {
                res.status(404).json({ error: 'Account not found' });
                return;
            }

            res.status(200).json({
                success: true,
                data: account
            });
        } catch (error) {
            next(error);
        }
    }
}
