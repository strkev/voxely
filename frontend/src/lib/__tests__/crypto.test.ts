import { describe, it, expect } from 'vitest';
import { 
    generateECDHKeyPair, 
    exportPublicKey, 
    importPublicKey, 
    deriveSharedKey, 
    generateGroupKey, 
    exportAESKey, 
    importAESKey, 
    aesEncrypt, 
    aesDecrypt,
    buildKeyAnnounce,
    KEY_ANNOUNCE
} from '../crypto';

if (typeof global.crypto === 'undefined') {
    // Rely on setup.ts or Node's native webcrypto in modern versions
}

describe('Crypto Utility', () => {

    describe('ECDH Key Exchange', () => {
        it('should generate a valid ECDH key pair', async () => {
            const keyPair = await generateECDHKeyPair();
            expect(keyPair.publicKey.type).toBe('public');
            expect(keyPair.privateKey.type).toBe('private');
        });

        it('should export and import a public key', async () => {
            const keyPair = await generateECDHKeyPair();
            const exported = await exportPublicKey(keyPair.publicKey);
            expect(exported).toBeInstanceOf(Uint8Array);
            expect(exported.length).toBe(65); // P-256 raw uncompressed

            const imported = await importPublicKey(exported);
            expect(imported.type).toBe('public');
            expect(imported.algorithm.name).toBe('ECDH');
        });

        it('should derive the same shared key for both parties', async () => {
            // Party A
            const aliceKP = await generateECDHKeyPair();
            const alicePub = await exportPublicKey(aliceKP.publicKey);
            const aliceSalt = crypto.getRandomValues(new Uint8Array(32));

            // Party B
            const bobKP = await generateECDHKeyPair();
            const bobPub = await exportPublicKey(bobKP.publicKey);
            const bobSalt = crypto.getRandomValues(new Uint8Array(32));

            // Shared salt (XOR logic used in useE2EEKeyManager)
            const combinedSalt = new Uint8Array(32);
            for (let i = 0; i < 32; i++) {
                combinedSalt[i] = aliceSalt[i] ^ bobSalt[i];
            }

            // Alice derives key using Bob's public key
            const aliceShared = await deriveSharedKey(
                aliceKP.privateKey,
                await importPublicKey(bobPub),
                combinedSalt
            );

            // Bob derives key using Alice's public key
            const bobShared = await deriveSharedKey(
                bobKP.privateKey,
                await importPublicKey(alicePub),
                combinedSalt
            );

            // Verify they are the same by encrypting with one and decrypting with the other
            const plaintext = new TextEncoder().encode('Secret Message');
            const { ciphertext, iv } = await aesEncrypt(plaintext, aliceShared);
            const decrypted = await aesDecrypt(ciphertext, bobShared, iv);

            expect(new TextDecoder().decode(decrypted)).toBe('Secret Message');
        });
    });

    describe('AES-GCM Group Encryption', () => {
        it('should generate, export, and import a group key', async () => {
            const groupKey = await generateGroupKey();
            const exported = await exportAESKey(groupKey);
            const imported = await importAESKey(exported);
            
            expect(imported.type).toBe('secret');
            expect(imported.algorithm.name).toBe('AES-GCM');
        });

        it('should allow exporting an imported group key (required for sharing)', async () => {
            const key = await generateGroupKey();
            const raw = await exportAESKey(key);
            const imported = await importAESKey(raw);
            
            // This should NOT throw InvalidAccessError anymore
            const reExported = await exportAESKey(imported);
            expect(reExported).toEqual(raw);
        });

        it('should encrypt and decrypt a message successfully', async () => {
            const key = await generateGroupKey();
            const plaintext = new TextEncoder().encode('Hello World');
            
            const { ciphertext, iv } = await aesEncrypt(plaintext, key);
            expect(ciphertext).not.toEqual(plaintext);
            expect(iv.length).toBe(12);

            const decrypted = await aesDecrypt(ciphertext, key, iv);
            expect(new TextDecoder().decode(decrypted)).toBe('Hello World');
        });

        it('should fail to decrypt with the wrong key', async () => {
            const key1 = await generateGroupKey();
            const key2 = await generateGroupKey();
            const plaintext = new TextEncoder().encode('Sensitive Data');
            
            const { ciphertext, iv } = await aesEncrypt(plaintext, key1);
            
            await expect(aesDecrypt(ciphertext, key2, iv)).rejects.toThrow();
        });
    });

    describe('Protocol Message Building', () => {
        it('should build a valid KEY_ANNOUNCE message', async () => {
            const senderId = 'user-123';
            const pubKey = new Uint8Array(65).fill(1);
            const salt = new Uint8Array(32).fill(2);

            const msg = buildKeyAnnounce(senderId, pubKey, salt);

            expect(msg[0]).toBe(KEY_ANNOUNCE);
            // senderIdLen (2 bytes) + senderId ('user-123' is 8 bytes) = 10
            // Total length: 1 + 2 + 8 + 65 + 32 = 108
            expect(msg.length).toBe(108);
        });
    });
});
