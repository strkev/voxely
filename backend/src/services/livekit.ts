import { AccessToken } from 'livekit-server-sdk';
import dotenv from 'dotenv';

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

    const at = new AccessToken(apiKey, apiSecret, {
        identity: participantId,
        name: participantName,
    });

    at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });

    return await at.toJwt();
};
