import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { fieldEncryptionExtension } from 'prisma-field-encryption';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env
dotenv.config({ path: path.join(__dirname, '../../../.env') });

describe('Prisma Field Encryption', () => {
    let prisma: any;
    let testUser: any;
    let testRoom: any;

    beforeAll(async () => {
        // Initialize Prisma with the encryption extension
        prisma = new PrismaClient().$extends(fieldEncryptionExtension());

        // Cleanup before tests
        await prisma.chatMessage.deleteMany({});
        await prisma.room.deleteMany({});
        await prisma.user.deleteMany({ where: { name: 'Test Encryptor' } });

        // Setup test data
        testUser = await prisma.user.create({
            data: {
                name: 'Test Encryptor',
                passwordHash: 'fake-hash',
                avatarColor: '#123456'
            }
        });

        testRoom = await prisma.room.create({
            data: {
                name: 'Test Encrypted Room',
                slug: `test-room-${Date.now()}`,
                createdById: testUser.id
            }
        });
    });

    afterAll(async () => {
        // Optional Cleanup
    });

    it('should transparently encrypt and decrypt ChatMessage.text', async () => {
        const secretMessage = 'This is a top secret message 🤫';

        // 1. Create a message
        const createdMessage = await prisma.chatMessage.create({
            data: {
                roomId: testRoom.slug,
                userId: testUser.id,
                userName: testUser.name,
                text: secretMessage
            }
        });

        // 2. Read it back via Prisma
        const fetchedMessage = await prisma.chatMessage.findUnique({
            where: { id: createdMessage.id }
        });

        // Prisma should automatically decrypt it
        expect(fetchedMessage.text).toBe(secretMessage);

        // 3. Verify database state via Raw Query ( bypasses extensions )
        const rawResults = await prisma.$queryRawUnsafe(
            `SELECT text FROM "ChatMessage" WHERE id = $1`,
            createdMessage.id
        );

        const rawText = rawResults[0].text;
        
        // The raw text in the DB should be encrypted
        expect(rawText).not.toBe(secretMessage);
        expect(rawText).toMatch(/^v1\.aesgcm256\./);
        console.log('✅ Verified raw encrypted text in DB:', rawText);
    });

    it('should not allow reading encrypted data if key is wrong (verification of active encryption)', async () => {
        // Create a message with standard prisma
        const msgText = 'Another secret';
        const msg = await prisma.chatMessage.create({
            data: {
                roomId: testRoom.slug,
                userId: testUser.id,
                userName: testUser.name,
                text: msgText
            }
        });

        // Create a fake prisma WITHOUT extension
        const normalPrisma = new PrismaClient();
        const rawMsg = await normalPrisma.chatMessage.findUnique({
            where: { id: msg.id }
        });

        // Without the extension, we see the raw encrypted string
        expect(rawMsg?.text).toMatch(/^v1\.aesgcm256\./);
        expect(rawMsg?.text).not.toBe(msgText);
        
        await normalPrisma.$disconnect();
    });
});
