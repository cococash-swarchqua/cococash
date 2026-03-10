/**
 * Account Controller - CocoCash Wallet MS
 * RF-04: Create wallet
 * RF-06: Query balance
 */

import { Router, Request, Response, NextFunction } from 'express';
import { AccountService } from '../services/account.service';
import { cognitoAuthMiddleware, AuthenticatedRequest } from '../middleware/cognito.middleware';

export class AccountController {
    public router: Router;

    constructor(private accountService: AccountService) {
        this.router = Router();
        this.initializeRoutes();
    }

    private initializeRoutes(): void {
        // All account routes require a valid Cognito JWT
        this.router.use(cognitoAuthMiddleware);

        /**
         * POST /accounts
         * RF-04: Happy path — create wallet right after Cognito gives the JWT.
         * userId is extracted from the token (NOT trusted from the body).
         * Idempotent: safe to call more than once.
         */
        this.router.post('/', this.createAccount.bind(this));

        /**
         * GET /accounts/me
         * Returns the wallet of the authenticated user.
         * JITP safety net: if the wallet is missing for any reason, it is
         * provisioned transparently before responding.
         */
        this.router.get('/me', this.getMyAccount.bind(this));

        /**
         * GET /accounts/:accountId/balance
         * RF-06: Query current balance.
         * Ownership check: 403 if the account does not belong to the caller.
         */
        this.router.get('/:accountId/balance', this.getBalance.bind(this));

        /**
         * GET /accounts/user/:userId
         * Get account by user ID.
         * Ownership check: callers can only query their own userId.
         */
        this.router.get('/user/:userId', this.getAccountByUserId.bind(this));
    }

    /**
     * POST /accounts — happy path wallet creation.
     * userId comes from the validated JWT, never from the request body.
     */
    private async createAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const userId = (req as AuthenticatedRequest).cognitoUserId;
            const { initialBalance } = req.body;

            const account = await this.accountService.createAccount(userId, initialBalance);

            res.status(201).json({
                success: true,
                data: account
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /accounts/me — returns the caller's wallet.
     * JITP: if the wallet doesn't exist yet, it is created transparently.
     */
    private async getMyAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const userId = (req as AuthenticatedRequest).cognitoUserId;

            // getAccountByUserId has JITP built in
            const account = await this.accountService.getAccountByUserId(userId);

            res.status(200).json({
                success: true,
                data: account
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /accounts/:accountId/balance — ownership-checked balance query.
     */
    private async getBalance(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { accountId } = req.params;
            const userId = (req as AuthenticatedRequest).cognitoUserId;

            // Ownership check
            const account = await this.accountService.getAccountById(accountId);
            if (!account) {
                res.status(404).json({ error: 'Account not found' });
                return;
            }
            // Return 403, not 404, to avoid revealing that the account exists
            if (account.userId !== userId) {
                res.status(403).json({ error: 'Forbidden' });
                return;
            }

            const balance = await this.accountService.getBalance(accountId);

            res.status(200).json({
                success: true,
                data: balance
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /accounts/user/:userId — ownership-checked user lookup.
     */
    private async getAccountByUserId(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { userId } = req.params;
            const cognitoUserId = (req as AuthenticatedRequest).cognitoUserId;

            // Callers can only look up their own account
            if (userId !== cognitoUserId) {
                res.status(403).json({ error: 'Forbidden' });
                return;
            }

            const account = await this.accountService.getAccountByUserId(userId);

            res.status(200).json({
                success: true,
                data: account
            });
        } catch (error) {
            next(error);
        }
    }
}
