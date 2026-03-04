import { Request, Response, NextFunction } from 'express';
import { verifyToken, isTokenBlacklisted } from '../services/auth';

/**
 * Express middleware: validates JWT from Authorization header or auth_token cookie.
 * Rejects blacklisted tokens (post-logout).
 */
export const authenticate = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    let token: string | undefined;

    // 1. Prefer Authorization header (Bearer token – used by Socket.IO and API clients)
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    }

    // 2. Fall back to httpOnly cookie (set by login/register)
    if (!token && req.cookies?.auth_token) {
        token = req.cookies.auth_token as string;
    }

    if (!token) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const payload = verifyToken(token);
    if (!payload) {
        res.status(401).json({ error: 'Invalid or expired token' });
        return;
    }

    // 3. Check JWT blacklist (Redis-backed)
    const blacklisted = await isTokenBlacklisted(payload.jti);
    if (blacklisted) {
        res.status(401).json({ error: 'Token revoked' });
        return;
    }

    req.user = { userId: payload.userId };
    next();
};
