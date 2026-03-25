import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { timingSafeEqual } from 'crypto';
import sanitize from 'sanitize-html';
import { prisma, io, getFriendIds, getOnlineFriendSockets } from '../index';
import { generateToken, verifyToken, blacklistToken, hashPassword, comparePassword } from '../services/auth';

/** Constant-time string comparison (prevents timing-based leakage). */
const safeEquals = (a: string, b: string): boolean => {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
};

// Cookie settings – httpOnly prevents JS access (XSS protection)
const COOKIE_OPTS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    path: '/',
};

export const register = async (req: Request, res: Response): Promise<void> => {
    try {
        const { password, name, inviteCode } = req.body;

        // ── Invite-code gate ──────────────────────────────────────────────────
        const validCodes = (process.env.INVITE_CODES ?? '')
            .split(',')
            .map(c => c.trim())
            .filter(Boolean);

        if (validCodes.length > 0) {
            const codeMatch = typeof inviteCode === 'string'
                && validCodes.some(c => safeEquals(inviteCode, c));
            if (!codeMatch) {
                res.status(403).json({ error: 'Ungültiger Einladungscode' });
                return;
            }
        }

        if (!password || !name) {
            res.status(400).json({ error: 'Username and password are required' });
            return;
        }

        if (typeof password !== 'string' || password.length < 8) {
            res.status(400).json({ error: 'Password must be at least 8 characters' });
            return;
        }

        // Sanitise name: strip HTML, trim, limit to 50 characters
        const sanitizedName = sanitize(String(name), { allowedTags: [], allowedAttributes: {} }).trim().slice(0, 50);
        if (!sanitizedName) {
            res.status(400).json({ error: 'A valid username is required' });
            return;
        }

        const existingUser = await prisma.user.findUnique({ where: { name: sanitizedName } });
        if (existingUser) {
            res.status(409).json({ error: 'Username is already taken' });
            return;
        }

        const passwordHash = await hashPassword(password);

        const user = await prisma.user.create({
            data: { passwordHash, name: sanitizedName },
        });

        const token = generateToken(user);

        // Set httpOnly cookie + return token in body (needed by Socket.IO)
        res.cookie('auth_token', token, COOKIE_OPTS);
        res.status(201).json({ user: { id: user.id, name: user.name, avatarColor: user.avatarColor }, token });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const login = async (req: Request, res: Response): Promise<void> => {
    try {
        const { name, password } = req.body;

        if (!name || !password) {
            res.status(400).json({ error: 'Username and password are required' });
            return;
        }

        const user = await prisma.user.findUnique({ where: { name } });
        if (!user) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }

        const isMatch = await comparePassword(password, user.passwordHash);
        if (!isMatch) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }

        const token = generateToken(user);

        // Set httpOnly cookie + return token in body (needed by Socket.IO)
        res.cookie('auth_token', token, COOKIE_OPTS);
        res.status(200).json({ user: { id: user.id, name: user.name, avatarColor: user.avatarColor }, token });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
    try {
        // Blacklist the token (from header or cookie)
        const token =
            req.headers.authorization?.split(' ')[1] ??
            (req.cookies?.auth_token as string | undefined);

        if (token) {
            // Fire-and-forget – don't block response on Redis
            blacklistToken(token).catch(console.error);
        }

        res.clearCookie('auth_token', { path: '/' });
        res.status(200).json({ message: 'Logged out' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getMe = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, name: true, avatarColor: true },
        });

        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        // Return the token so the frontend can use it for Socket.IO
        const token =
            req.headers.authorization?.split(' ')[1] ??
            (req.cookies?.auth_token as string | undefined) ?? null;

        res.json({ user, token });
    } catch (error) {
        console.error('Get me error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const deleteAccount = async (req: Request, res: Response): Promise<void> => {
    try {
        // req.user is set by authenticate middleware
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        // Blacklist the current token
        const token =
            req.headers.authorization?.split(' ')[1] ??
            (req.cookies?.auth_token as string | undefined);

        if (token) {
            blacklistToken(token).catch(console.error);
        }

        await prisma.user.delete({ where: { id: userId } });

        res.clearCookie('auth_token', { path: '/' });
        res.status(200).json({ message: 'Account deleted successfully' });
    } catch (error) {
        console.error('Delete account error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
export const updateProfile = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const { name, currentPassword, newPassword, avatarColor } = req.body;

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        // If changing password, require current password verification
        if (newPassword) {
            if (!currentPassword || typeof currentPassword !== 'string') {
                res.status(400).json({ error: 'Current password is required to change password' });
                return;
            }
            const isMatch = await comparePassword(currentPassword, user.passwordHash);
            if (!isMatch) {
                res.status(401).json({ error: 'Current password is incorrect' });
                return;
            }
        }

        const updateData: { name?: string; passwordHash?: string; avatarColor?: string } = {};

        // Update name
        if (name && typeof name === 'string') {
            const sanitizedName = sanitize(name, { allowedTags: [], allowedAttributes: {} }).trim().slice(0, 50);
            if (!sanitizedName) {
                res.status(400).json({ error: 'A valid username is required' });
                return;
            }
            if (sanitizedName !== user.name) {
                const existing = await prisma.user.findUnique({ where: { name: sanitizedName } });
                if (existing) {
                    res.status(409).json({ error: 'Username is already taken' });
                    return;
                }
                updateData.name = sanitizedName;
            }
        }

        // Update password
        if (newPassword && typeof newPassword === 'string') {
            if (newPassword.length < 8) {
                res.status(400).json({ error: 'New password must be at least 8 characters' });
                return;
            }
            updateData.passwordHash = await hashPassword(newPassword);
        }
        if (avatarColor && typeof avatarColor === 'string') {
            if (/^#[0-9A-Fa-f]{6}$/i.test(avatarColor)) {
                updateData.avatarColor = avatarColor.toUpperCase();
            } else {
                res.status(400).json({ error: 'Ungültiges Farbformat' });
                return;
            }
        }

        if (Object.keys(updateData).length === 0) {
            res.status(400).json({ error: 'No valid fields to update' });
            return;
        }

        const updated = await prisma.user.update({
            where: { id: userId },
            data: updateData,
            select: { id: true, name: true, avatarColor: true },
        });

        // Broadcast profile update to online friends if name or color changed
        if (updateData.name || updateData.avatarColor) {
            try {
                const friendIds = await getFriendIds(userId);
                const friendSockets = getOnlineFriendSockets(friendIds);
                for (const sid of friendSockets) {
                    io.to(sid).emit('friend:profile-updated', {
                        userId: updated.id,
                        name: updated.name,
                        avatarColor: updated.avatarColor,
                    });
                }
            } catch (err) {
                console.error('Failed to notify friends of profile update:', err);
            }
        }

        res.json({ user: updated });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
