import { Request, Response } from 'express';
import sanitize from 'sanitize-html';
import { createLiveKitToken } from '../services/livekit';

/** Strip all HTML and limit length. */
const cleanInput = (val: unknown, maxLen: number): string =>
    sanitize(String(val ?? ''), { allowedTags: [], allowedAttributes: {} }).trim().slice(0, maxLen);

export const generateToken = async (req: Request, res: Response): Promise<void> => {
    try {
        const { roomName, participantName, participantId } = req.body;

        if (!roomName || !participantName || !participantId) {
            res.status(400).json({ error: 'roomName, participantName, and participantId are required' });
            return;
        }

        // Ensure the requested participantId matches the authenticated user
        // This prevents a logged-in user from generating tokens for other identities
        if (participantId !== req.user?.userId) {
            res.status(403).json({ error: 'participantId must match your own user ID' });
            return;
        }

        // Sanitise inputs before passing to LiveKit
        const safeRoomName = cleanInput(roomName, 100);
        const safeName = cleanInput(participantName, 50);
        if (!safeRoomName || !safeName) {
            res.status(400).json({ error: 'Invalid roomName or participantName' });
            return;
        }

        const token = await createLiveKitToken(safeRoomName, safeName, participantId);
        res.json({ token });
    } catch (error) {
        console.error('Error generating LiveKit token:', error);
        res.status(500).json({ error: 'Internal server error while generating token' });
    }
};
