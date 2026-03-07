import { AccessToken } from 'livekit-server-sdk';
import dotenv from 'dotenv';
import { prisma } from '../index';

dotenv.config();

// Validated at startup (index.ts) – safe to assert non-null
const apiKey = process.env.LIVEKIT_API_KEY!;
const apiSecret = process.env.LIVEKIT_API_SECRET!;

/**
 * Generate a token for a user to join a specific LiveKit room
 */
export const createLiveKitToken = async (roomName: string, participantName: string, participantId: string) => {
    if (!apiKey || !apiSecret) {
        throw new Error('LiveKit API key and secret are required');
    }

    const user = await prisma.user.findUnique({
        where: { id: participantId },
        select: { avatarColor: true }
    });
    const userColor = user?.avatarColor || '#FF5A5F';

    const at = new AccessToken(apiKey, apiSecret, {
        identity: participantId,
        name: participantName,
        ttl: '24h',
        metadata: JSON.stringify({ avatarColor: userColor }),
    });

    at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });

    return await at.toJwt();
};
