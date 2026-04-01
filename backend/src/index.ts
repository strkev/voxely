import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { Server } from 'socket.io';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { fieldEncryptionExtension } from 'prisma-field-encryption';
import { randomUUID } from 'crypto';
import { rateLimit } from 'express-rate-limit';
import { stripHtml, ROOM_ID_RE, UUID_RE } from './lib/sanitization';

dotenv.config();

// ── Startup validation: crash fast if required secrets are missing ─────────────
const REQUIRED_ENV: Record<string, string | undefined> = {
    JWT_SECRET: process.env.JWT_SECRET,
    LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET,
};

const INSECURE_DEFAULTS = new Set([
    'super-secret-jwt-key-change-me-in-production',
    'devkey',
    'secret',
]);

const missingOrInsecure = Object.entries(REQUIRED_ENV).filter(
    ([, val]) => !val || INSECURE_DEFAULTS.has(val)
);

if (missingOrInsecure.length > 0) {
    console.error(
        '🔴  Missing or insecure environment variables:\n' +
        missingOrInsecure.map(([k]) => `   • ${k}`).join('\n') +
        '\n   Set these in your .env file before starting the server.'
    );
    process.exit(1);
}

// ── CORS origin whitelist ──────────────────────────────────────────────────────
const rawOrigins = process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000';
const allowedOrigins = rawOrigins.split(',').map(o => o.trim()).filter(Boolean);

const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`CORS: origin '${origin}' is not allowed`));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-secret'],
    credentials: true,
};

const app = express();
// Trust first proxy (Nginx) — required for express-rate-limit behind a reverse proxy
app.set('trust proxy', 1);
export const server = http.createServer(app);

export const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: true,
    },
});

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
export const prisma = new PrismaClient({ adapter }).$extends(fieldEncryptionExtension());

// ── Middleware ─────────────────────────────────────────────────────────────────
// Define helmet policies. We must specify a very permissive CSP because LiveKit needs WS connections, 
// inline scripts, and media from various origins, plus we must allow crossOrigin requests.
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Next.js and some libraries need this
            connectSrc: ["'self'", ...allowedOrigins, "ws:", "wss:"], // Allow WS for Socket.io and LiveKit
            imgSrc: ["'self'", "data:", "blob:"],
            mediaSrc: ["'self'", "blob:", "data:", "https://*"], // Allow media from anywhere for WebRTC
            styleSrc: ["'self'", "'unsafe-inline'"],
            fontSrc: ["'self'", "data:"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
        },
    },
    crossOriginEmbedderPolicy: false, // Required for WebRTC/LiveKit
    crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(cors(corsOptions));
app.options('/{*path}', cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// Global rate limiting to prevent DDoS
const globalLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 200, // 200 requests per minute per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', globalLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
import authRouter from './routes/auth';
import livekitRouter from './routes/livekit';
import { verifyToken } from './services/auth';
import { isTokenBlacklisted } from './services/auth';
import { initRedis } from './services/redis';

import adminRouter from './routes/admin';
import friendsRouter from './routes/friends';

app.use('/api/auth', authRouter);
app.use('/api/livekit', livekitRouter);
app.use('/api/admin', adminRouter);
app.use('/api/friends', friendsRouter);

// ── Online presence tracking (userId → Set<socketId>) ─────────────────────────
// Supports multiple tabs/windows per user
export const onlineUsers = new Map<string, Set<string>>();

// ── User status tracking ──────────────────────────────────────────────────────
// Tracks manually-set status per user. Defaults to 'online' on connect.
export type UserStatus = 'online' | 'away' | 'invisible';
export const VALID_STATUSES: UserStatus[] = ['online', 'away', 'invisible'];
export const userStatuses = new Map<string, UserStatus>();

export const getOnlineFriendSockets = (friendIds: string[]): string[] => {
    const sockets: string[] = [];
    for (const fid of friendIds) {
        const set = onlineUsers.get(fid);
        if (set) {
            for (const sid of set) sockets.push(sid);
        }
    }
    return sockets;
};

export const getFriendIds = async (userId: string): Promise<string[]> => {
    const friendships = await prisma.friendship.findMany({
        where: { userId },
        select: { friendId: true },
    });
    return friendships.map((f: any) => f.friendId);
};

// ── Open Rooms tracking ───────────────────────────────────────────────────────
// Map: userId -> roomId
export const userRooms = new Map<string, string>();
// Map: roomId -> { roomName, isOpen }
export const openRooms = new Map<string, { roomName: string; isOpen: boolean }>();
// Map: roomId -> e2eeKey (32-byte base64)
export const e2eeKeys = new Map<string, string>();
// Map: roomId -> Set<userId> (Tracks users invited to a room to allow them access)
export const invitedUsers = new Map<string, Set<string>>();

export const getOpenRoomsForUser = async (userId: string) => {
    const friendIds = await getFriendIds(userId);
    const visibleOpenRoomsMap = new Map<string, { roomId: string; roomName: string; participants: string[]; totalParticipantCount: number }>();

    for (const friendId of friendIds) {
        const roomId = userRooms.get(friendId);
        if (roomId) {
            const roomConfig = openRooms.get(roomId);
            if (roomConfig && roomConfig.isOpen) {
                if (!visibleOpenRoomsMap.has(roomId)) {
                    // Try to get total participant count from socket.io room
                    const socketRoom = io.sockets.adapter.rooms.get(roomId);
                    const totalParticipantCount = socketRoom ? socketRoom.size : 1;

                    visibleOpenRoomsMap.set(roomId, {
                        roomId,
                        roomName: roomConfig.roomName,
                        participants: [],
                        totalParticipantCount
                    });
                }
                visibleOpenRoomsMap.get(roomId)!.participants.push(friendId);
            }
        }
    }
    return Array.from(visibleOpenRoomsMap.values());
};

export const broadcastOpenRoomsToFriends = async (userIds: string[]) => {
    const usersToNotify = new Set<string>();

    for (const userId of userIds) {
        usersToNotify.add(userId);
        try {
            const friendIds = await getFriendIds(userId);
            for (const fid of friendIds) {
                usersToNotify.add(fid);
            }
        } catch (err) {
            console.error('[WS] Error getting friends for broadcast:', err);
        }
    }

    for (const notifyUserId of usersToNotify) {
        const sockets = onlineUsers.get(notifyUserId);
        if (sockets && sockets.size > 0) {
            try {
                const roomList = await getOpenRoomsForUser(notifyUserId);
                for (const sid of sockets) {
                    io.to(sid).emit('friend:open-rooms-list', roomList);
                }
            } catch (err) {
                console.error('[WS] Error updating open rooms list for user:', notifyUserId, err);
            }
        }
    }
};

app.get('/health', async (_req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({ status: 'ok', db: 'connected', message: 'Voxely API is running' });
    } catch {
        res.status(503).json({ status: 'error', db: 'disconnected' });
    }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

// (Helpers moved to lib/sanitization.ts)

/**
 * Verifies if a user has at least one socket connected to a specific room.
 * This prevents stale entries in userRooms from causing incorrect behavior.
 */
const isUserActuallyInRoom = (userId: string, roomId: string): boolean => {
    const room = io.sockets.adapter.rooms.get(roomId);
    if (!room) return false;

    for (const socketId of room) {
        if (io.sockets.sockets.get(socketId)?.data.userId === userId) {
            return true;
        }
    }
    return false;
};

// ── Server-side chat rate limiting (per userId, in memory) ────────────────────
// Allows max 5 messages per 5 seconds per user
const CHAT_RATE_WINDOW_MS = 5_000;
const CHAT_RATE_MAX = 5;
const chatRateMap = new Map<string, { count: number; resetAt: number }>();

const checkChatRateLimit = (userId: string): boolean => {
    const now = Date.now();
    const entry = chatRateMap.get(userId);

    if (!entry || now >= entry.resetAt) {
        chatRateMap.set(userId, { count: 1, resetAt: now + CHAT_RATE_WINDOW_MS });
        return true;
    }

    if (entry.count >= CHAT_RATE_MAX) return false;
    entry.count++;
    return true;
};

// Clean up stale rate-limit entries every minute
setInterval(() => {
    const now = Date.now();
    for (const [userId, entry] of chatRateMap.entries()) {
        if (now >= entry.resetAt) chatRateMap.delete(userId);
    }
}, 60_000);

// ── Socket.IO middleware: verify JWT on every connection ──────────────────────
io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
        return next(new Error('auth_error: no token'));
    }
    const payload = verifyToken(token);
    if (!payload) {
        return next(new Error('auth_error: invalid or expired token'));
    }

    // Check blacklist (Redis) – reject if token was revoked
    const blacklisted = await isTokenBlacklisted(payload.jti);
    if (blacklisted) {
        return next(new Error('auth_error: token revoked'));
    }

    socket.data.userId = payload.userId;
    next();
});

// ── Socket.IO connection handler ──────────────────────────────────────────────
io.on('connection', async (socket) => {
    const uid = socket.data.userId as string;
    console.log(`[WS] connected  ${socket.id}  uid=${uid}`);

    // ── Online presence: track this socket ─────────────────────────────────
    const isFirstSocket = !onlineUsers.has(uid) || onlineUsers.get(uid)!.size === 0;
    if (!onlineUsers.has(uid)) onlineUsers.set(uid, new Set());
    onlineUsers.get(uid)!.add(socket.id);

    // Default status to 'online' on first connect
    if (isFirstSocket && !userStatuses.has(uid)) {
        userStatuses.set(uid, 'online');
    }
    const myStatus = userStatuses.get(uid) ?? 'online';

    /** Build the online friends list with status info, filtering invisible users */
    const buildOnlineFriendsList = (friendIds: string[]) => {
        return friendIds
            .filter(fid => {
                if (!onlineUsers.has(fid) || onlineUsers.get(fid)!.size === 0) return false;
                const status = userStatuses.get(fid) ?? 'online';
                return status !== 'invisible'; // hide invisible users
            })
            .map(fid => ({ id: fid, status: userStatuses.get(fid) ?? 'online' }));
    };

    // MOVE ASYNC NOTIFICATION LOGIC TO A SEPARATE NON-BLOCKING STEP
    const initializeSocket = async () => {
        // Always send the current online list and open rooms to this socket,
        // regardless of whether it's the first socket or a reconnect.
        // This ensures presence data is fresh after server restarts.
        try {
            const friendIds = await getFriendIds(uid);
            const onlineFriends = buildOnlineFriendsList(friendIds);
            socket.emit('friend:online-list', { users: onlineFriends });

            // Also send own status back so UI stays in sync
            socket.emit('friend:status-changed', { userId: uid, status: myStatus });

            const openRoomsList = await getOpenRoomsForUser(uid);
            socket.emit('friend:open-rooms-list', openRoomsList);
        } catch (err) {
            console.error('[WS] Failed to send initial presence data:', err);
        }

        // Only notify friends when the user's first socket connects
        // (avoids spamming friends on every new tab)
        if (isFirstSocket && myStatus !== 'invisible') {
            try {
                const friendIds = await getFriendIds(uid);
                const friendSockets = getOnlineFriendSockets(friendIds);
                for (const sid of friendSockets) {
                    io.to(sid).emit('friend:online', { userId: uid, status: myStatus });
                }
            } catch (err) {
                console.error('[WS] Failed to notify friends of online status:', err);
            }
        }
    };
    initializeSocket();

    // ── On-demand presence resync ──────────────────────────────────────────
    // Clients can request a fresh online list at any time (e.g. after reconnect)
    socket.on('presence:request-sync', async () => {
        try {
            const friendIds = await getFriendIds(uid);
            const onlineFriends = buildOnlineFriendsList(friendIds);
            socket.emit('friend:online-list', { users: onlineFriends });

            // Resend own status
            socket.emit('friend:status-changed', { userId: uid, status: userStatuses.get(uid) ?? 'online' });

            const openRoomsList = await getOpenRoomsForUser(uid);
            socket.emit('friend:open-rooms-list', openRoomsList);
        } catch (err) {
            console.error('[WS] Failed to handle presence sync request:', err);
        }
    });

    // ── User status change ────────────────────────────────────────────────
    socket.on('presence:set-status', async ({ status }: { status: string }) => {
        if (!VALID_STATUSES.includes(status as UserStatus)) return;
        const newStatus = status as UserStatus;
        const oldStatus = userStatuses.get(uid) ?? 'online';
        userStatuses.set(uid, newStatus);

        try {
            const friendIds = await getFriendIds(uid);
            const friendSockets = getOnlineFriendSockets(friendIds);

            if (newStatus === 'invisible' && oldStatus !== 'invisible') {
                // Switching TO invisible: tell friends we went offline
                for (const sid of friendSockets) {
                    io.to(sid).emit('friend:offline', { userId: uid });
                }
            } else if (newStatus !== 'invisible' && oldStatus === 'invisible') {
                // Switching FROM invisible: tell friends we came online
                for (const sid of friendSockets) {
                    io.to(sid).emit('friend:online', { userId: uid, status: newStatus });
                }
            } else if (newStatus !== 'invisible') {
                // Status changed between online/away: broadcast update
                for (const sid of friendSockets) {
                    io.to(sid).emit('friend:status-changed', { userId: uid, status: newStatus });
                }
            }

            // Confirm status to all of the user's own sockets
            const ownSockets = onlineUsers.get(uid);
            if (ownSockets) {
                for (const sid of ownSockets) {
                    io.to(sid).emit('friend:status-changed', { userId: uid, status: newStatus });
                }
            }
        } catch (err) {
            console.error('[WS] Failed to broadcast status change:', err);
        }
    });

    // ── Room invitation: forward to friend's sockets ───────────────────────
    socket.on('friend:invite', async ({ friendId, roomId, roomName }: { friendId: string; roomId: string; roomName: string }) => {
        if (typeof friendId !== 'string' || !UUID_RE.test(friendId)) return;
        if (typeof roomId !== 'string' || !ROOM_ID_RE.test(roomId)) return;
        const cleanRoomName = stripHtml(typeof roomName === 'string' ? roomName : '').slice(0, 100) || roomId;

        const friendship = await prisma.friendship.findUnique({
            where: { userId_friendId: { userId: uid, friendId } },
        });
        if (!friendship) return;

        const sender = await prisma.user.findUnique({
            where: { id: uid },
            select: { name: true },
        });

        const socketRoom = io.sockets.adapter.rooms.get(roomId);
        const participantCount = socketRoom ? socketRoom.size : 1;

        if (!invitedUsers.has(roomId)) {
            invitedUsers.set(roomId, new Set());
        }
        invitedUsers.get(roomId)!.add(friendId);

        const friendSocketIds = onlineUsers.get(friendId);
        if (friendSocketIds) {
            for (const sid of friendSocketIds) {
                io.to(sid).emit('friend:invite-received', {
                    fromUserId: uid,
                    fromUserName: sender?.name ?? 'Unknown',
                    roomId,
                    roomName: cleanRoomName,
                    participantCount,
                });
            }
        }
    });

    // ── Direct Call: initiate, response, terminate ─────────────────────────
    socket.on('call:initiate', async ({ friendId }: { friendId: string }) => {
        if (typeof friendId !== 'string' || !UUID_RE.test(friendId)) return;

        const friendship = await prisma.friendship.findUnique({
            where: { userId_friendId: { userId: uid, friendId } },
        });
        if (!friendship) return;

        const caller = await prisma.user.findUnique({
            where: { id: uid },
            select: { id: true, name: true, avatarColor: true },
        });
        if (!caller) return;
        const callerWithColor = { ...caller, avatarColor: caller.avatarColor || '#FF5A5F' };

        let callerRoomId = userRooms.get(uid);

        // CRITICAL: Verify the caller is ACTUALLY in the room they claim to be in.
        // If they left but the state is stale, we treat them as being in NO room.
        if (callerRoomId && !isUserActuallyInRoom(uid, callerRoomId)) {
            console.log(`[WS] Stale room entry detected for user ${uid} (room ${callerRoomId}). Clearing.`);
            userRooms.delete(uid);
            callerRoomId = undefined;
        }

        let participants: { id: string; name: string; avatarColor: string }[] = [];
        let roomName = '';

        if (callerRoomId) {
            roomName = openRooms.get(callerRoomId)?.roomName || callerRoomId;
            const socketRoom = io.sockets.adapter.rooms.get(callerRoomId);
            if (socketRoom) {
                const participantIds = new Set<string>();
                for (const sid of socketRoom) {
                    const pId = io.sockets.sockets.get(sid)?.data.userId;
                    if (pId && pId !== uid) {
                        participantIds.add(pId);
                    }
                }

                if (participantIds.size > 0) {
                    const rawParticipants = await prisma.user.findMany({
                        where: { id: { in: Array.from(participantIds) } },
                        select: { id: true, name: true, avatarColor: true },
                    });
                    participants = rawParticipants.map(p => ({
                        ...p,
                        avatarColor: p.avatarColor || '#FF5A5F'
                    }));
                }
            }
        }

        const friendSockets = onlineUsers.get(friendId);
        if (friendSockets) {
            for (const sid of friendSockets) {
                io.to(sid).emit('call:incoming', {
                    caller: callerWithColor,
                    roomId: callerRoomId,
                    roomName,
                    participants
                });
            }
        }
    });

    socket.on('call:response', async ({ callerId, accepted }: { callerId: string; accepted: boolean }) => {
        if (typeof callerId !== 'string' || !UUID_RE.test(callerId)) return;

        const friendship = await prisma.friendship.findUnique({
            where: { userId_friendId: { userId: uid, friendId: callerId } },
        });
        if (!friendship) return;

        const callerSockets = onlineUsers.get(callerId);
        if (!callerSockets) return;

        if (accepted) {
            let roomId = userRooms.get(callerId);

            // Verify caller is still in the room (or it's a valid persistent room)
            if (roomId && !isUserActuallyInRoom(callerId, roomId)) {
                console.log(`[WS] Caller ${callerId} is no longer in room ${roomId}. Falling back to private call.`);
                userRooms.delete(callerId);
                roomId = undefined;
            }

            if (!roomId) {
                roomId = `call-${uid.slice(0, 8)}-${callerId.slice(0, 8)}`;
            }

            for (const sid of callerSockets) {
                io.to(sid).emit('call:accepted', { roomId });
            }
            socket.emit('call:accepted', { roomId });
        } else {
            for (const sid of callerSockets) {
                io.to(sid).emit('call:rejected', { fromUserId: uid });
            }
        }
    });

    socket.on('call:terminate', async ({ friendId }: { friendId: string }) => {
        if (typeof friendId !== 'string' || !UUID_RE.test(friendId)) return;

        const friendship = await prisma.friendship.findUnique({
            where: { userId_friendId: { userId: uid, friendId } },
        });
        if (!friendship) return;

        const friendSockets = onlineUsers.get(friendId);
        if (friendSockets) {
            for (const sid of friendSockets) {
                io.to(sid).emit('call:terminated', { fromUserId: uid });
            }
        }
    });

    // ── chat:join — client joins a room channel ────────────────────────────────
    socket.on('chat:join', async ({ roomId, name }: { roomId: string; name?: string }) => {
        if (typeof roomId !== 'string' || !ROOM_ID_RE.test(roomId)) return;

        // Security Check: If it's a private call room, verify the user is an intended participant, invited, or the room is open
        if (roomId.startsWith('call-')) {
            const parts = roomId.split('-');
            if (parts.length >= 3) {
                const target1 = parts[1];
                const target2 = parts[2];
                const shortUid = uid.slice(0, 8);
                
                const isOpen = openRooms.get(roomId)?.isOpen === true;
                const isInvited = invitedUsers.get(roomId)?.has(uid) === true;
                
                if (target1 !== shortUid && target2 !== shortUid && !isOpen && !isInvited) {
                    socket.emit('chat:error', { message: 'Unauthorized: You cannot join this private call' });
                    return;
                }
            }
        }

        const displayName = typeof name === 'string'
            ? stripHtml(name).slice(0, 64) || 'Anonymous'
            : 'Anonymous';
        socket.data.name = displayName;
        socket.data.roomId = roomId;
        socket.join(roomId);

        const currentRoomId = userRooms.get(uid);
        if (currentRoomId !== roomId) {
            userRooms.set(uid, roomId);
            await broadcastOpenRoomsToFriends([uid]);
        }
        console.log(`[WS] ${socket.data.name} joined room ${roomId}`);

        const currentOpenStatus = openRooms.get(roomId)?.isOpen ?? false;
        socket.emit('room:open-status', { isOpen: currentOpenStatus });

        // Load last 50 messages from DB and send to this socket
        try {
            const history = await prisma.chatMessage.findMany({
                where: { roomId },
                orderBy: { createdAt: 'asc' },
                take: 50,
            });

            const formatted = history.map((m: any) => ({
                id: m.id,
                userId: m.userId,
                name: m.userName,
                text: m.text,
                timestamp: m.createdAt.toISOString(),
                reactions: m.reactions || {}
            }));

            socket.emit('chat:history', formatted);
        } catch (err) {
            console.error('[WS] Failed to load chat history:', err);
        }
    });

    // ── chat:message — client sends a message ─────────────────────────────────
    socket.on('chat:message', async ({ roomId, text }: { roomId: string; text: string }) => {
        if (typeof roomId !== 'string' || !ROOM_ID_RE.test(roomId)) return;
        if (typeof text !== 'string') return;

        // Ensure sender is actually subscribed to the room
        if (!io.sockets.adapter.rooms.get(roomId)?.has(socket.id)) return;

        // Server-side rate limit
        const userId = socket.data.userId as string;
        if (!checkChatRateLimit(userId)) {
            socket.emit('chat:error', { message: 'Zu viele Nachrichten – kurz warten.' });
            return;
        }

        const clean = stripHtml(text).slice(0, 500);
        if (!clean) return;

        const message = {
            id: randomUUID(),
            userId,
            name: (socket.data.name as string) || 'Anonymous',
            text: clean,
            timestamp: new Date().toISOString(),
        };

        // Persist to database (non-blocking)
        prisma.chatMessage.create({
            data: {
                id: message.id,
                roomId,
                userId,
                userName: message.name,
                text: clean,
                reactions: {}, // Initialize empty reactions
            },
        }).catch((err: any) => console.error('[WS] Failed to persist message:', err));

        // Broadcast to everyone in the room (including sender)
        io.to(roomId).emit('chat:message', message);
    });

    // ── chat:react — client adds/removes a reaction ───────────────────────────
    socket.on('chat:react', async ({ roomId, messageId, emoji }: { roomId: string; messageId: string; emoji: string }) => {
        if (typeof roomId !== 'string' || !ROOM_ID_RE.test(roomId)) return;
        if (typeof messageId !== 'string' || !UUID_RE.test(messageId)) return;

        const ALLOWED_EMOJIS = ['👍', '❤️', '😂', '😮', '😢'];
        if (!ALLOWED_EMOJIS.includes(emoji)) return;

        // Ensure sender is actually in the room
        if (!io.sockets.adapter.rooms.get(roomId)?.has(socket.id)) return;

        const userId = socket.data.userId as string;

        try {
            // Fetch current message to update its reactions JSON
            const msg = await prisma.chatMessage.findUnique({
                where: { id: messageId },
                select: { reactions: true, roomId: true }
            });

            if (!msg || msg.roomId !== roomId) return;

            const reactions = (msg.reactions as Record<string, string[]>) || {};

            // Initialize array for this emoji if it doesn't exist
            if (!reactions[emoji]) {
                reactions[emoji] = [];
            }

            const userIndex = reactions[emoji].indexOf(userId);

            // Toggle reaction: if user already reacted with this emoji, remove them; otherwise, add them
            if (userIndex > -1) {
                reactions[emoji].splice(userIndex, 1);
                // Clean up empty arrays
                if (reactions[emoji].length === 0) {
                    delete reactions[emoji];
                }
            } else {
                reactions[emoji].push(userId);
            }

            // Save back to database
            await prisma.chatMessage.update({
                where: { id: messageId },
                data: { reactions }
            });

            // Broadcast the updated reactions to everyone in the room
            io.to(roomId).emit('chat:react', { messageId, reactions });

        } catch (err) {
            console.error('[WS] Failed to process reaction:', err);
        }
    });

    // ── Helper: clean up chat messages when a room becomes empty ────────────────
    const cleanupRoomIfEmpty = async (roomId: string) => {
        // Socket.IO keeps the room set until the next tick after leave/disconnect,
        // Wait 60 seconds to allow for brief reconnects before deleting room state
        setTimeout(async () => {
            const room = io.sockets.adapter.rooms.get(roomId);
            if (!room || room.size === 0) {
                openRooms.delete(roomId);
                e2eeKeys.delete(roomId);
                invitedUsers.delete(roomId);
                try {
                    const result = await prisma.chatMessage.deleteMany({ where: { roomId } });
                    if (result.count > 0) {
                        console.log(`[CLEANUP] Deleted ${result.count} messages from empty room ${roomId}`);
                    }
                } catch (err) {
                    console.error(`[CLEANUP] Failed to clean room ${roomId}:`, err);
                }
            }
        }, 60_000);
    };

    // ── chat:typing — client is typing ────────────────────────────────────────
    socket.on('chat:typing', ({ roomId, isTyping }: { roomId: string; isTyping: boolean }) => {
        if (typeof roomId !== 'string' || !ROOM_ID_RE.test(roomId)) return;
        if (typeof isTyping !== 'boolean') return;

        // Ensure sender is actually in the room
        if (!io.sockets.adapter.rooms.get(roomId)?.has(socket.id)) return;

        const userId = socket.data.userId as string;
        const name = (socket.data.name as string) || 'Anonymous';

        // Broadcast to everyone in the room EXCEPT the sender
        socket.to(roomId).emit('chat:typing', {
            userId,
            name,
            isTyping
        });
    });

    // ── chat:leave — client explicitly leaves ─────────────────────────────────
    socket.on('chat:leave', async ({ roomId }: { roomId: string }) => {
        if (typeof roomId === 'string') {
            socket.leave(roomId);
            userRooms.delete(uid);
            await broadcastOpenRoomsToFriends([uid]);
            cleanupRoomIfEmpty(roomId);
        }
    });

    // ── room:set-open — toggle room visibility ────────────────────────────────
    socket.on('room:set-open', async ({ roomId, isOpen, roomName }: { roomId: string; isOpen: boolean; roomName: string }) => {
        if (typeof roomId !== 'string' || !ROOM_ID_RE.test(roomId)) return;

        // Security Check: Verify user is tracked as actively in this room
        const userId = socket.data.userId as string;
        if (userRooms.get(userId) !== roomId) {
            socket.emit('chat:error', { message: 'Unauthorized: You are not in this room.' });
            return;
        }

        const cleanRoomName = stripHtml(typeof roomName === 'string' ? roomName : '').slice(0, 100) || roomId;

        if (isOpen) {
            openRooms.set(roomId, { roomName: cleanRoomName, isOpen });
        } else {
            const currentConfig = openRooms.get(roomId);
            if (currentConfig) {
                openRooms.set(roomId, { ...currentConfig, isOpen: false });
            }
        }

        const room = io.sockets.adapter.rooms.get(roomId);
        if (room) {
            const participantUids = Array.from(room).map(sid => io.sockets.sockets.get(sid)?.data.userId as string).filter(Boolean);
            await broadcastOpenRoomsToFriends(participantUids);
        }

        io.to(roomId).emit('room:open-status', { isOpen });
    });

    socket.on('disconnect', async () => {
        console.log(`[WS] disconnected ${socket.id}`);
        // Clean up any room this socket was in
        const roomId = socket.data.roomId as string | undefined;
        const disconnectUid = socket.data.userId as string;

        if (disconnectUid) {
            const currentRoomId = userRooms.get(disconnectUid);
            if (currentRoomId && !isUserActuallyInRoom(disconnectUid, currentRoomId)) {
                console.log(`[WS] User ${disconnectUid} has no more sockets in room ${currentRoomId}. Clearing userRooms.`);
                userRooms.delete(disconnectUid);
                await broadcastOpenRoomsToFriends([disconnectUid]);
            }
        }

        if (roomId) {
            cleanupRoomIfEmpty(roomId);
        }

        const userSockets = onlineUsers.get(disconnectUid);

        // ── Online presence: remove this socket ──────────────────────────
        if (userSockets) {
            userSockets.delete(socket.id);
            if (userSockets.size === 0) {
                onlineUsers.delete(disconnectUid);
                const wasInvisible = userStatuses.get(disconnectUid) === 'invisible';
                userStatuses.delete(disconnectUid);
                // Notify friends that this user went offline (skip if was invisible)
                if (!wasInvisible) {
                    try {
                        const friendIds = await getFriendIds(disconnectUid);
                        const friendSockets = getOnlineFriendSockets(friendIds);
                        for (const sid of friendSockets) {
                            io.to(sid).emit('friend:offline', { userId: disconnectUid });
                        }
                    } catch (err) {
                        console.error('[WS] Failed to notify friends of offline status:', err);
                    }
                }
            }
        }
    });
});

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 4000;
const HOST = '0.0.0.0';

export const startServer = async (port?: number) => {
    // Connect to Redis (non-fatal if unavailable)
    await initRedis();

    const targetPort = port ?? PORT;
    return new Promise<void>((resolve) => {
        server.listen(targetPort, HOST, () => {
            console.log(`✅  Server running on http://${HOST}:${targetPort}`);
            console.log(`🔒  Allowed origins: ${allowedOrigins.join(', ')}`);
            resolve();
        });
    });
};

if (process.env.NODE_ENV !== 'test') {
    startServer();
}
