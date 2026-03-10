/**
 * Cognito Middleware - CocoCash Wallet MS
 *
 * Extracts the Cognito user identity (sub) from the JWT passed by
 * API Gateway in the Authorization header.
 *
 * NOTE: The JWT signature is NOT verified here because API Gateway's
 * Cognito Authorizer already validated it before forwarding the request.
 * We only decode the payload to extract the `sub` claim.
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Extends Express Request with the authenticated user's Cognito sub.
 */
export interface AuthenticatedRequest extends Request {
    cognitoUserId: string;
}

/**
 * Middleware: extract `sub` from the JWT and attach it to `req.cognitoUserId`.
 * Returns 401 if the header is missing or the token is malformed.
 */
export function cognitoAuthMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing or invalid Authorization header' });
        return;
    }

    try {
        const token = authHeader.split(' ')[1];

        // A JWT is three base64url-encoded segments: header.payload.signature
        const parts = token.split('.');
        if (parts.length !== 3) {
            res.status(401).json({ error: 'Malformed JWT token' });
            return;
        }

        // Decode the payload (middle segment). Buffer handles base64url natively in Node >= 16.
        const payload = JSON.parse(
            Buffer.from(parts[1], 'base64url').toString('utf8')
        );

        if (!payload?.sub) {
            res.status(401).json({ error: 'Invalid token: missing sub claim' });
            return;
        }

        (req as AuthenticatedRequest).cognitoUserId = payload.sub as string;
        next();
    } catch {
        res.status(401).json({ error: 'Failed to parse authorization token' });
    }
}
