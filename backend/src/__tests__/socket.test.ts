import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io as Client, Socket } from 'socket.io-client';
import { server, startServer, prisma } from '../index';
import { generateToken } from '../services/auth';
import { AddressInfo } from 'net';

describe('Socket.IO Integration', () => {
    let ioServer: any;
    let port: number;
    let userA: any, userB: any;
    let tokenA: string, tokenB: string;
    let socketA: Socket, socketB: Socket;

    beforeAll(async () => {
        // 1. Create test users
        userA = await prisma.user.create({
            data: {
                id: 'user-a-' + Date.now(),
                name: 'User A ' + Date.now(),
                passwordHash: 'hash',
            },
        });
        userB = await prisma.user.create({
            data: {
                id: 'user-b-' + Date.now(),
                name: 'User B ' + Date.now(),
                passwordHash: 'hash',
            },
        });

        tokenA = generateToken(userA);
        tokenB = generateToken(userB);

        // 2. Start server on random port
        await startServer(0);
        port = (server.address() as AddressInfo).port;
    });

    afterAll(async () => {
        if (socketA) socketA.disconnect();
        if (socketB) socketB.disconnect();
        server.close();
        
        const idsToDelete = [];
        if (userA?.id) idsToDelete.push(userA.id);
        if (userB?.id) idsToDelete.push(userB.id);

        if (idsToDelete.length > 0) {
            await prisma.user.deleteMany({
                where: { id: { in: idsToDelete } }
            });
        }
    });

    const connectSocket = (token: string): Promise<Socket> => {
        return new Promise((resolve, reject) => {
            const socket = Client(`http://localhost:${port}`, {
                auth: { token },
                transports: ['websocket'], // force websocket to avoid polling delays
            });
            socket.on('connect', () => resolve(socket));
            socket.on('connect_error', (err) => reject(err));
        });
    };

    it('should broadcast messages to all users in a room', async () => {
        console.error('[Test] Connecting socketA...');
        socketA = await connectSocket(tokenA);
        console.error('[Test] socketA connected');
        
        console.error('[Test] Connecting socketB...');
        socketB = await connectSocket(tokenB);
        console.error('[Test] socketB connected');

        // Add error listeners
        socketA.on('chat:error', (err) => console.error('[SocketA Error]', err));
        socketB.on('chat:error', (err) => console.error('[SocketB Error]', err));

        const roomId = 'test-room-' + Date.now();

        // Join helpers to wait for confirmation
        const joinRoom = (socket: Socket, id: string, name: string) => {
            return new Promise<void>((resolve, reject) => {
                const t = setTimeout(() => reject(new Error('Join timeout for ' + name)), 10000);
                socket.on('room:open-status', () => {
                    clearTimeout(t);
                    resolve();
                });
                socket.emit('chat:join', { roomId: id, name });
            });
        };

        console.error('[Test] Joining room...');
        // Both join the room
        await Promise.all([
            joinRoom(socketA, roomId, 'User A'),
            joinRoom(socketB, roomId, 'User B')
        ]);
        console.error('[Test] Both joined');

        const testMessage = 'Hello World';
        
        const messageReceived = new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Message not received')), 5000);
            socketB.on('chat:message', (msg) => {
                if (msg.text === testMessage) {
                    clearTimeout(timeout);
                    expect(msg.userId).toBe(userA.id);
                    expect(msg.name).toBe('User A');
                    resolve();
                }
            });
        });

        console.error('[Test] Sending message...');
        socketA.emit('chat:message', { roomId, text: testMessage });

        await messageReceived;
        console.error('[Test] Message received');
    }, 30000);

    it('should NOT broadcast messages to users NOT in the room', async () => {
        const roomA = 'room-a-' + Date.now();
        const roomB = 'room-b-' + Date.now();

        await socketA.emit('chat:join', { roomId: roomA, name: 'User A' });
        await socketB.emit('chat:join', { roomId: roomB, name: 'User B' });

        await new Promise(r => setTimeout(r, 100));

        let received = false;
        socketB.on('chat:message', () => {
            received = true;
        });

        socketA.emit('chat:message', { roomId: roomA, text: 'Secret message' });

        await new Promise(r => setTimeout(r, 200));
        expect(received).toBe(false);
    });

    it('should block users from sending messages to rooms they have not joined', async () => {
        const roomA = 'room-a-2-' + Date.now();
        const roomSecret = 'room-secret-' + Date.now();

        // User A joins Room A
        socketA.emit('chat:join', { roomId: roomA, name: 'User A' });
        await new Promise(r => setTimeout(r, 100));

        let received = false;
        socketA.on('chat:message', () => {
            received = true;
        });

        // User B is NOT in roomSecret, tries to send message there
        // Note: The backend logic has a check: if (!io.sockets.adapter.rooms.get(roomId)?.has(socket.id)) return;
        socketB.emit('chat:message', { roomId: roomA, text: 'I am a hacker' });

        await new Promise(r => setTimeout(r, 200));
        expect(received).toBe(false);
    });

    it('should broadcast room:open-status when a user opens or closes a room', async () => {
        const roomOpen = 'room-open-' + Date.now();
        
        socketA.emit('chat:join', { roomId: roomOpen, name: 'User A' });
        socketB.emit('chat:join', { roomId: roomOpen, name: 'User B' });

        await new Promise(r => setTimeout(r, 100));

        let bStatus: boolean | null = null;
        socketB.on('room:open-status', ({ isOpen }: { isOpen: boolean }) => {
            bStatus = isOpen;
        });

        // User A toggles room open
        socketA.emit('room:set-open', { roomId: roomOpen, isOpen: true, roomName: 'Test Room' });

        await new Promise(r => setTimeout(r, 200));
        
        expect(bStatus).toBe(true);

        // User A toggles room closed
        socketA.emit('room:set-open', { roomId: roomOpen, isOpen: false, roomName: 'Test Room' });

        await new Promise(r => setTimeout(r, 200));

        expect(bStatus).toBe(false);
    });
});
