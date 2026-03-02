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
import { randomUUID } from 'crypto';
import sanitize from 'sanitize-html';

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
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: true,
    },
});

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
export const prisma = new PrismaClient({ adapter });

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors(corsOptions));
app.options('/{*path}', cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// ── Routes ────────────────────────────────────────────────────────────────────
import authRouter from './routes/auth';
import livekitRouter from './routes/livekit';
import { verifyToken } from './services/auth';
import { isTokenBlacklisted } from './services/auth';
import { initRedis } from './services/redis';

import adminRouter from './routes/admin';

app.use('/api/auth', authRouter);
app.use('/api/livekit', livekitRouter);
app.use('/api/admin', adminRouter);
app.get('/health', async (_req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({ status: 'ok', db: 'connected', message: 'Voxely API is running' });
    } catch {
        res.status(503).json({ status: 'error', db: 'disconnected' });
    }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Sanitise user input: strip ALL HTML to prevent XSS. */
const stripHtml = (text: string): string =>
    sanitize(text, { allowedTags: [], allowedAttributes: {} }).trim();

/** Rooms are public but we validate format to prevent abuse. */
const ROOM_ID_RE = /^[a-zA-Z0-9_-]{1,100}$/;

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
    socket.data.email = payload.email;
    next();
});

// ── Socket.IO connection handler ──────────────────────────────────────────────
io.on('connection', (socket) => {
    console.log(`[WS] connected  ${socket.id}  uid=${socket.data.userId as string}`);

    // ── chat:join — client joins a room channel ────────────────────────────────
    socket.on('chat:join', async ({ roomId, name }: { roomId: string; name?: string }) => {
        if (typeof roomId !== 'string' || !ROOM_ID_RE.test(roomId)) return;
        const displayName = typeof name === 'string'
            ? stripHtml(name).slice(0, 64) || 'Anonymous'
            : 'Anonymous';
        socket.data.name = displayName;
        socket.data.roomId = roomId;
        socket.join(roomId);
        console.log(`[WS] ${displayName} joined room ${roomId}`);

        // Load last 50 messages from DB and send to this socket
        try {
            const history = await prisma.chatMessage.findMany({
                where: { roomId },
                orderBy: { createdAt: 'asc' },
                take: 50,
            });

            const formatted = history.map(m => ({
                id: m.id,
                userId: m.userId,
                name: m.userName,
                text: m.text,
                timestamp: m.createdAt.toISOString(),
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
            },
        }).catch(err => console.error('[WS] Failed to persist message:', err));

        // Broadcast to everyone in the room (including sender)
        io.to(roomId).emit('chat:message', message);
    });

    // ── Helper: clean up chat messages when a room becomes empty ────────────────
    const cleanupRoomIfEmpty = async (roomId: string) => {
        // Socket.IO keeps the room set until the next tick after leave/disconnect,
        // so we use setImmediate to check after cleanup completes.
        setImmediate(async () => {
            const room = io.sockets.adapter.rooms.get(roomId);
            if (!room || room.size === 0) {
                try {
                    const result = await prisma.chatMessage.deleteMany({ where: { roomId } });
                    if (result.count > 0) {
                        console.log(`[CLEANUP] Deleted ${result.count} messages from empty room ${roomId}`);
                    }
                } catch (err) {
                    console.error(`[CLEANUP] Failed to clean room ${roomId}:`, err);
                }
            }
        });
    };

    // ── chat:leave — client explicitly leaves ─────────────────────────────────
    socket.on('chat:leave', ({ roomId }: { roomId: string }) => {
        if (typeof roomId === 'string') {
            socket.leave(roomId);
            cleanupRoomIfEmpty(roomId);
        }
    });

    socket.on('disconnect', () => {
        console.log(`[WS] disconnected ${socket.id}`);
        // Clean up any room this socket was in
        const roomId = socket.data.roomId as string | undefined;
        if (roomId) {
            cleanupRoomIfEmpty(roomId);
        }
    });
});

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 4000;
const HOST = '0.0.0.0';

(async () => {
    // Connect to Redis (non-fatal if unavailable)
    await initRedis();

    server.listen(PORT, HOST, () => {
        console.log(`✅  Server running on http://${HOST}:${PORT}`);
        console.log(`🔒  Allowed origins: ${allowedOrigins.join(', ')}`);
    });
})();
