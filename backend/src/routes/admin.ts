import { Router, Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';
import { prisma } from '../index';

const router = Router();

/** Constant-time string comparison to prevent timing attacks. */
const safeCompare = (a: string, b: string): boolean => {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
};

/** Middleware: validate x-admin-secret header. */
const requireAdminSecret = (req: Request, res: Response, next: () => void): void => {
    const secret = req.headers['x-admin-secret'];
    const expected = process.env.ADMIN_SECRET;

    if (!expected || typeof secret !== 'string' || !safeCompare(secret, expected)) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    next();
};

/**
 * GET /api/admin/users
 * Returns all registered users (id, name, email, createdAt).
 */
router.get('/users', requireAdminSecret, async (_req: Request, res: Response): Promise<void> => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        res.json({ count: users.length, users });
    } catch (error) {
        console.error('Admin users error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * DELETE /api/admin/users/:id
 * Deletes a user and all associated data (rooms, chat messages via cascade).
 * Used for DSGVO Art. 17 data deletion requests.
 */
router.delete('/users/:id', requireAdminSecret, async (req: Request, res: Response): Promise<void> => {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;

    if (!id || typeof id !== 'string') {
        res.status(400).json({ error: 'Invalid user ID' });
        return;
    }

    try {
        // Delete chat messages first (userId FK), then rooms, then user
        await prisma.chatMessage.deleteMany({ where: { userId: id } });
        await prisma.room.deleteMany({ where: { createdById: id } });
        await prisma.user.delete({ where: { id } });

        console.log(`[ADMIN] Deleted user ${id} and all associated data`);
        res.json({ message: 'User and all associated data deleted' });
    } catch (error: unknown) {
        if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'P2025') {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        console.error('Admin delete user error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/admin/users/:id/export
 * Returns all stored data for a user (DSGVO Art. 15 — Auskunftsrecht).
 * Response is a JSON download containing profile, rooms, and chat messages.
 */
router.get('/users/:id/export', requireAdminSecret, async (req: Request, res: Response): Promise<void> => {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;

    if (!id || typeof id !== 'string') {
        res.status(400).json({ error: 'Invalid user ID' });
        return;
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                email: true,
                name: true,
                avatarUrl: true,
                createdAt: true,
                updatedAt: true,
                roomsCreated: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        createdAt: true,
                    },
                },
                chatMessages: {
                    select: {
                        id: true,
                        roomId: true,
                        text: true,
                        createdAt: true,
                    },
                    orderBy: { createdAt: 'asc' },
                },
            },
        });

        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        const exportData = {
            exportedAt: new Date().toISOString(),
            note: 'Datenauskunft gemäß DSGVO Art. 15',
            profile: {
                id: user.id,
                email: user.email,
                name: user.name,
                avatarUrl: user.avatarUrl,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
            },
            roomsCreated: user.roomsCreated,
            chatMessages: user.chatMessages,
        };

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="dsgvo-export-${user.name.replace(/\s+/g, '_')}-${Date.now()}.json"`);
        res.json(exportData);
    } catch (error) {
        console.error('Admin export user error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;

