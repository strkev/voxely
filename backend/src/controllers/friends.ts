import { Request, Response } from 'express';
import sanitize from 'sanitize-html';
import { prisma } from '../index';
import { io, onlineUsers } from '../index';

// ── Input sanitisation helper ─────────────────────────────────────────────────
const sanitizeName = (raw: unknown): string | null => {
    if (typeof raw !== 'string') return null;
    const clean = sanitize(raw, { allowedTags: [], allowedAttributes: {} })
        .trim()
        .slice(0, 50);
    return clean || null;
};

// ── Validate UUID format to prevent injection ─────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (id: unknown): boolean =>
    typeof id === 'string' && UUID_RE.test(id);

// ── Rate limiting for friend requests (per userId, in memory) ─────────────────
// Max 5 friend requests per 60 seconds per user
const FRIEND_RATE_WINDOW_MS = 60_000;
const FRIEND_RATE_MAX = 5;
const friendRateMap = new Map<string, { count: number; resetAt: number }>();

const checkFriendRateLimit = (userId: string): boolean => {
    const now = Date.now();
    const entry = friendRateMap.get(userId);

    if (!entry || now >= entry.resetAt) {
        friendRateMap.set(userId, { count: 1, resetAt: now + FRIEND_RATE_WINDOW_MS });
        return true;
    }

    if (entry.count >= FRIEND_RATE_MAX) return false;
    entry.count++;
    return true;
};

// Clean up stale entries every 2 minutes
setInterval(() => {
    const now = Date.now();
    for (const [userId, entry] of friendRateMap.entries()) {
        if (now >= entry.resetAt) friendRateMap.delete(userId);
    }
}, 120_000);

// ── Send friend request (by username) ─────────────────────────────────────────
export const sendRequest = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

        // Rate limit: max 5 requests per minute
        if (!checkFriendRateLimit(userId)) {
            res.status(429).json({ error: 'Too many friend requests. Please wait a moment.' });
            return;
        }

        const name = sanitizeName(req.body.name);
        if (!name) {
            res.status(400).json({ error: 'A valid username is required' });
            return;
        }

        // Look up target user
        const target = await prisma.user.findUnique({ where: { name }, select: { id: true, name: true } });
        if (!target) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        // Cannot friend yourself
        if (target.id === userId) {
            res.status(400).json({ error: 'You cannot send a friend request to yourself' });
            return;
        }

        // Check if already friends
        const existing = await prisma.friendship.findUnique({
            where: { userId_friendId: { userId, friendId: target.id } },
        });
        if (existing) {
            res.status(409).json({ error: 'You are already friends with this user' });
            return;
        }

        // Check for existing request in either direction
        const existingRequest = await prisma.friendRequest.findFirst({
            where: {
                OR: [
                    { senderId: userId, receiverId: target.id },
                    { senderId: target.id, receiverId: userId },
                ],
            },
        });
        if (existingRequest) {
            res.status(409).json({ error: 'A friend request already exists between you and this user' });
            return;
        }

        const request = await prisma.friendRequest.create({
            data: { senderId: userId, receiverId: target.id },
            include: {
                sender: { select: { id: true, name: true } },
                receiver: { select: { id: true, name: true } },
            },
        });

        // Real-time: notify the receiver about the new request
        const receiverSockets = onlineUsers.get(target.id);
        if (receiverSockets) {
            for (const sid of receiverSockets) {
                io.to(sid).emit('friend:request-received', {
                    id: request.id,
                    senderId: userId,
                    sender: request.sender,
                    createdAt: request.createdAt.toISOString(),
                });
            }
        }

        res.status(201).json({ request });
    } catch (error) {
        console.error('Send friend request error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// ── Get pending requests (incoming & outgoing) ───────────────────────────────
export const getRequests = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

        const [incoming, outgoing] = await Promise.all([
            prisma.friendRequest.findMany({
                where: { receiverId: userId },
                include: { sender: { select: { id: true, name: true } } },
                orderBy: { createdAt: 'desc' },
            }),
            prisma.friendRequest.findMany({
                where: { senderId: userId },
                include: { receiver: { select: { id: true, name: true } } },
                orderBy: { createdAt: 'desc' },
            }),
        ]);

        res.json({ incoming, outgoing });
    } catch (error) {
        console.error('Get friend requests error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// ── Accept friend request ─────────────────────────────────────────────────────
export const acceptRequest = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

        const id = req.params.id as string;
        if (!isValidUUID(id)) {
            res.status(400).json({ error: 'Invalid request ID' });
            return;
        }

        const request = await prisma.friendRequest.findUnique({ where: { id } });
        if (!request) {
            res.status(404).json({ error: 'Friend request not found' });
            return;
        }

        // Only the receiver can accept
        if (request.receiverId !== userId) {
            res.status(403).json({ error: 'You can only accept requests sent to you' });
            return;
        }

        // Create bidirectional friendship + delete request in a transaction
        await prisma.$transaction([
            prisma.friendship.create({
                data: { userId: request.senderId, friendId: request.receiverId },
            }),
            prisma.friendship.create({
                data: { userId: request.receiverId, friendId: request.senderId },
            }),
            prisma.friendRequest.delete({ where: { id } }),
        ]);

        // Return the new friend info
        const friend = await prisma.user.findUnique({
            where: { id: request.senderId },
            select: { id: true, name: true },
        });

        // Real-time: notify the original sender that their request was accepted
        const senderSockets = onlineUsers.get(request.senderId);
        if (senderSockets) {
            const acceptedByUser = await prisma.user.findUnique({
                where: { id: userId },
                select: { id: true, name: true },
            });
            for (const sid of senderSockets) {
                io.to(sid).emit('friend:request-accepted', {
                    requestId: id,
                    friend: acceptedByUser,
                });
            }
        }

        // Notify both sides of online presence now that they're friends
        const acceptorSockets = onlineUsers.get(userId);
        if (senderSockets && senderSockets.size > 0 && acceptorSockets && acceptorSockets.size > 0) {
            for (const sid of senderSockets) {
                io.to(sid).emit('friend:online', { userId });
            }
            for (const sid of acceptorSockets) {
                io.to(sid).emit('friend:online', { userId: request.senderId });
            }
        }

        res.json({ friend });
    } catch (error) {
        console.error('Accept friend request error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// ── Decline / cancel friend request ───────────────────────────────────────────
export const declineRequest = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

        const id = req.params.id as string;
        if (!isValidUUID(id)) {
            res.status(400).json({ error: 'Invalid request ID' });
            return;
        }

        const request = await prisma.friendRequest.findUnique({ where: { id } });
        if (!request) {
            res.status(404).json({ error: 'Friend request not found' });
            return;
        }

        // Sender or receiver may cancel/decline
        if (request.senderId !== userId && request.receiverId !== userId) {
            res.status(403).json({ error: 'You are not part of this friend request' });
            return;
        }

        await prisma.friendRequest.delete({ where: { id } });

        // Real-time: notify the other party
        const otherUserId = request.senderId === userId ? request.receiverId : request.senderId;
        const otherSockets = onlineUsers.get(otherUserId);
        if (otherSockets) {
            for (const sid of otherSockets) {
                io.to(sid).emit('friend:request-declined', { requestId: id });
            }
        }

        res.json({ message: 'Friend request removed' });
    } catch (error) {
        console.error('Decline friend request error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// ── Get all friends ───────────────────────────────────────────────────────────
export const getFriends = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

        const friendships = await prisma.friendship.findMany({
            where: { userId },
            include: { friend: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'desc' },
        });

        const friends = friendships.map(f => f.friend);
        res.json({ friends });
    } catch (error) {
        console.error('Get friends error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// ── Remove friend ─────────────────────────────────────────────────────────────
export const removeFriend = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

        const friendId = req.params.friendId as string;
        if (!isValidUUID(friendId)) {
            res.status(400).json({ error: 'Invalid friend ID' });
            return;
        }

        // Delete both directions in a transaction
        const result = await prisma.$transaction([
            prisma.friendship.deleteMany({
                where: { userId, friendId },
            }),
            prisma.friendship.deleteMany({
                where: { userId: friendId, friendId: userId },
            }),
        ]);

        if (result[0].count === 0 && result[1].count === 0) {
            res.status(404).json({ error: 'Friendship not found' });
            return;
        }

        // Real-time: notify the other user
        const friendSockets = onlineUsers.get(friendId);
        if (friendSockets) {
            for (const sid of friendSockets) {
                io.to(sid).emit('friend:removed', { userId });
            }
        }

        res.json({ message: 'Friend removed' });
    } catch (error) {
        console.error('Remove friend error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
