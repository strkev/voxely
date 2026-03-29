import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { generateToken } from '../livekit';
import * as livekitService from '../../services/livekit';
import { e2eeKeys } from '../../index';

// Mock the e2eeKeys map from index to avoid side effects
vi.mock('../../index', () => ({
    e2eeKeys: new Map<string, string>(),
}));

// Mock the LiveKit service
vi.mock('../../services/livekit', () => ({
    createLiveKitToken: vi.fn(),
}));

describe('LiveKit Controller', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;

    beforeEach(() => {
        vi.clearAllMocks();
        e2eeKeys.clear();
        
        mockReq = {
            body: {
                roomName: 'test-room',
                participantName: 'TestUser',
                participantId: 'user-123'
            },
            user: {
                userId: 'user-123'
            } as any
        };

        mockRes = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn()
        };
    });

    it('should require roomName, participantName, and participantId', async () => {
        mockReq.body = {};
        await generateToken(mockReq as Request, mockRes as Response);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
    });

    it('should reject if participantId does not match authenticated user', async () => {
        mockReq.body.participantId = 'hacker-456';
        await generateToken(mockReq as Request, mockRes as Response);

        expect(mockRes.status).toHaveBeenCalledWith(403);
        expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('must match your own user ID') }));
    });

    it('should generate a valid LiveKit token and a new e2eeKey for a room', async () => {
        vi.mocked(livekitService.createLiveKitToken).mockResolvedValueOnce('mock-lk-token');

        await generateToken(mockReq as Request, mockRes as Response);

        expect(livekitService.createLiveKitToken).toHaveBeenCalledWith('test-room', 'TestUser', 'user-123');
        expect(mockRes.json).toHaveBeenCalledWith({
            token: 'mock-lk-token',
            e2eeKey: expect.any(String)
        });

        // Verify the key is stored in the map and is exactly 32 bytes base64 encoded
        const storedKey = e2eeKeys.get('test-room');
        expect(storedKey).toBeTruthy();
        expect(Buffer.from(storedKey as string, 'base64').length).toBe(32);
    });

    it('should return the same e2eeKey for subsequent players joining the same room', async () => {
        vi.mocked(livekitService.createLiveKitToken).mockResolvedValue('mock-lk-token');

        // Player 1 joins
        await generateToken(mockReq as Request, mockRes as Response);
        const player1Response = vi.mocked(mockRes.json).mock.calls[0][0];
        const sharedKey = player1Response.e2eeKey;

        // Reset response mock
        vi.clearAllMocks();

        // Player 2 joins same room
        mockReq.body.participantId = 'user-456';
        mockReq.user = { userId: 'user-456' } as any;
        await generateToken(mockReq as Request, mockRes as Response);

        const player2Response = vi.mocked(mockRes.json).mock.calls[0][0];

        expect(player2Response.e2eeKey).toBe(sharedKey);
        expect(e2eeKeys.get('test-room')).toBe(sharedKey);
    });
});
