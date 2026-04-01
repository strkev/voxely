import { Request, Response } from 'express';
import sanitize from 'sanitize-html';
import { createLiveKitToken } from '../services/livekit';
import { e2eeKeys, openRooms, invitedUsers } from '../index';
import crypto from 'crypto';

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

        // Room Access Authorization: Prevent joining private calls anonymously
        if (safeRoomName.startsWith('call-')) {
            const parts = safeRoomName.split('-');
            if (parts.length >= 3) {
                const target1 = parts[1];
                const target2 = parts[2];
                const shortUid = participantId.slice(0, 8);
                
                const isOpen = openRooms.get(safeRoomName)?.isOpen === true;
                const isInvited = invitedUsers.get(safeRoomName)?.has(participantId) === true;
                
                if (target1 !== shortUid && target2 !== shortUid && !isOpen && !isInvited) {
                    res.status(403).json({ error: 'Unauthorized to join this private call' });
                    return;
                }
            }
        }

        let e2eeKey = e2eeKeys.get(safeRoomName);
        if (!e2eeKey) {
            e2eeKey = crypto.randomBytes(32).toString('base64');
            e2eeKeys.set(safeRoomName, e2eeKey);
        }

        const token = await createLiveKitToken(safeRoomName, safeName, participantId);
        res.json({ token, e2eeKey });
    } catch (error) {
        console.error('Error generating LiveKit token:', error);
        res.status(500).json({ error: 'Internal server error while generating token' });
    }
};

