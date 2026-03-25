import { vi, describe, it, expect, beforeEach } from 'vitest';
import { generateToken, verifyToken, blacklistToken, isTokenBlacklisted, hashPassword, comparePassword } from '../auth';
import * as redisService from '../redis';
import jwt from 'jsonwebtoken';
import { User } from '@prisma/client';

// Mock Redis Service
vi.mock('../redis', () => ({
    getRedis: vi.fn(),
}));

describe('Auth Service', () => {
    const mockUser: User = {
        id: 'user-123',
        name: 'TestUser',
        passwordHash: 'hashed-pw',
        avatarColor: '#FFFFFF',
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    describe('JWT Logic', () => {
        it('should generate a valid JWT token', () => {
            const token = generateToken(mockUser);
            expect(token).toBeDefined();
            expect(typeof token).toBe('string');
            
            const decoded = jwt.decode(token) as any;
            expect(decoded.userId).toBe(mockUser.id);
            expect(decoded.name).toBe(mockUser.name);
            expect(decoded.jti).toBeDefined();
        });

        it('should verify a valid token', () => {
            const token = generateToken(mockUser);
            const payload = verifyToken(token);
            expect(payload).not.toBeNull();
            expect(payload?.userId).toBe(mockUser.id);
        });

        it('should return null for an invalid token', () => {
            const payload = verifyToken('invalid-token');
            expect(payload).toBeNull();
        });
    });

    describe('Password Logic', () => {
        it('should hash a password and be able to compare it', async () => {
            const password = 'my-secret-password';
            const hash = await hashPassword(password);
            expect(hash).not.toBe(password);
            
            const isMatch = await comparePassword(password, hash);
            expect(isMatch).toBe(true);
            
            const isWrongMatch = await comparePassword('wrong-password', hash);
            expect(isWrongMatch).toBe(false);
        });
    });

    describe('Blacklist Logic', () => {
        let mockRedis: any;

        beforeEach(() => {
            vi.clearAllMocks();
            mockRedis = {
                set: vi.fn().mockResolvedValue('OK'),
                get: vi.fn().mockResolvedValue(null),
            };
        });

        it('should blacklist a valid token', async () => {
            (redisService.getRedis as any).mockReturnValue(mockRedis);
            const token = generateToken(mockUser);
            const decoded = jwt.decode(token) as any;

            await blacklistToken(token);

            expect(mockRedis.set).toHaveBeenCalledWith(
                `blacklist:${decoded.jti}`,
                '1',
                expect.objectContaining({ EX: expect.any(Number) })
            );
        });

        it('should check if a token is blacklisted', async () => {
            (redisService.getRedis as any).mockReturnValue(mockRedis);
            
            mockRedis.get.mockResolvedValue('1');
            const isBlacklisted = await isTokenBlacklisted('some-jti');
            expect(isBlacklisted).toBe(true);

            mockRedis.get.mockResolvedValue(null);
            const isNotBlacklisted = await isTokenBlacklisted('other-jti');
            expect(isNotBlacklisted).toBe(false);
        });

        it('should handle missing Redis gracefully (Degradation)', async () => {
            (redisService.getRedis as any).mockReturnValue(null);
            
            // Should not throw
            await blacklistToken('some-token');
            const isBlacklisted = await isTokenBlacklisted('some-jti');
            
            expect(isBlacklisted).toBe(false);
        });
    });
});
