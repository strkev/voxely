import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import { User } from '@prisma/client';
import { getRedis } from './redis';

dotenv.config();

// JWT_SECRET is validated at startup (index.ts) – safe to assert non-null here
const JWT_SECRET = process.env.JWT_SECRET as string;

export interface JwtPayload {
    userId: string;
    email: string;
    jti: string;   // JWT ID – unique per token, used for blacklisting
}

export const generateToken = (user: User): string => {
    const payload: JwtPayload = {
        userId: user.id,
        email: user.email,
        jti: randomUUID(),
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
};

export const verifyToken = (token: string): JwtPayload | null => {
    try {
        return jwt.verify(token, JWT_SECRET) as JwtPayload;
    } catch {
        return null;
    }
};

/** Add a token's JTI to the Redis blacklist with TTL matching its remaining lifetime. */
export const blacklistToken = async (token: string): Promise<void> => {
    const redis = getRedis();
    if (!redis) return;   // Redis unavailable – graceful degradation

    const payload = verifyToken(token);
    if (!payload) return;

    const exp = (jwt.decode(token) as { exp?: number })?.exp;
    const ttl = exp ? exp - Math.floor(Date.now() / 1000) : 7 * 24 * 3600;
    if (ttl <= 0) return;

    await redis.set(`blacklist:${payload.jti}`, '1', { EX: ttl });
};

// Rate-limit the Redis-down warning so it doesn't flood logs
let lastRedisWarning = 0;
const REDIS_WARN_INTERVAL_MS = 60_000; // at most once per minute

/** Returns true if the given JTI is in the blacklist. */
export const isTokenBlacklisted = async (jti: string): Promise<boolean> => {
    const redis = getRedis();
    if (!redis) {
        const now = Date.now();
        if (now - lastRedisWarning > REDIS_WARN_INTERVAL_MS) {
            lastRedisWarning = now;
            console.warn('⚠️  [Security] Redis unavailable – token blacklisting is disabled. Revoked tokens are being accepted.');
        }
        return false;
    }
    const result = await redis.get(`blacklist:${jti}`);
    return result !== null;
};
