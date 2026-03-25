import { describe, it, expect } from 'vitest';
import { 
    sanitizeFileName, 
    isBlockedFileType, 
    hasDangerousMagicNumber,
    encodeUint32,
    decodeUint32,
    encodeFloat64,
    decodeFloat64,
    buildFileStartMessage,
    MSG_FILE_START,
    encryptData,
    decryptData,
    generateKey
} from '../file-utils';

describe('File Utils', () => {

    describe('FileName Sanitization', () => {
        it('should replace filesystem-unsafe characters', () => {
            expect(sanitizeFileName('file/name:with*chars.txt')).toBe('file_name_with_chars.txt');
        });

        it('should prevent path traversal', () => {
            expect(sanitizeFileName('../../etc/passwd')).toBe('____etc_passwd');
        });

        it('should handle hidden files', () => {
            expect(sanitizeFileName('.hidden')).toBe('_hidden');
        });

        it('should truncate long filenames', () => {
            const longName = 'a'.repeat(300) + '.txt';
            const sanitized = sanitizeFileName(longName);
            expect(sanitized.length).toBe(200);
        });

        it('should return fallback for empty names', () => {
            expect(sanitizeFileName('')).toBe('unnamed_file');
            expect(sanitizeFileName('   ')).toBe('unnamed_file');
        });
    });

    describe('Security Checks', () => {
        it('should block dangerous file extensions', () => {
            expect(isBlockedFileType('test.exe')).toBe(true);
            expect(isBlockedFileType('script.sh')).toBe(true);
            expect(isBlockedFileType('evil.bat')).toBe(true);
            expect(isBlockedFileType('safe.png')).toBe(false);
            expect(isBlockedFileType('document.pdf')).toBe(false);
        });

        it('should detect dangerous magic numbers', () => {
            // MZ (Windows EXE)
            const exeData = new Uint8Array([0x4D, 0x5A, 0x90, 0x00]);
            expect(hasDangerousMagicNumber(exeData)).toBe('Windows EXE/DLL (MZ)');

            // ELF
            const elfData = new Uint8Array([0x7F, 0x45, 0x4C, 0x46, 0x01]);
            expect(hasDangerousMagicNumber(elfData)).toBe('ELF executable');

            // Shebang
            const scriptData = new Uint8Array([0x23, 0x21, 0x2F, 0x62, 0x69, 0x6E, 0x2F, 0x73, 0x68]);
            expect(hasDangerousMagicNumber(scriptData)).toBe('Shell/Script (shebang)');

            // Safe data
            const safeData = new Uint8Array([0x89, 0x50, 0x4E, 0x47]); // PNG
            expect(hasDangerousMagicNumber(safeData)).toBeNull();
        });
    });

    describe('Binary Protocol Encoding', () => {
        it('should encode and decode Uint32 correctly', () => {
            const val = 12345678;
            const encoded = encodeUint32(val);
            expect(decodeUint32(encoded, 0)).toBe(val);
        });

        it('should encode and decode Float64 correctly', () => {
            const val = 9876543210.5;
            const encoded = encodeFloat64(val);
            expect(decodeFloat64(encoded, 0)).toBe(val);
        });

        it('should build a consistent MSG_FILE_START message', () => {
            const transferId = '550e8400-e29b-41d4-a716-446655440000';
            const totalChunks = 10;
            const fileSize = 1024;
            const iv = new Uint8Array(12).fill(1);
            const fileName = 'test.txt';
            const hash = new Uint8Array(32).fill(2);

            const msg = buildFileStartMessage(transferId, totalChunks, fileSize, iv, fileName, hash);

            expect(msg[0]).toBe(MSG_FILE_START);
            expect(decodeUint32(msg, 37)).toBe(totalChunks);
            expect(decodeFloat64(msg, 41)).toBe(fileSize);
        });
    });

    describe('Encryption Roundtrip', () => {
        it('should encrypt and decrypt file data correctly', async () => {
            const key = await generateKey();
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const plaintext = new TextEncoder().encode('This is some sensitive file content');

            const ciphertext = await encryptData(plaintext, key, iv);
            expect(ciphertext).not.toEqual(plaintext);

            const decrypted = await decryptData(ciphertext, key, iv);
            expect(new TextDecoder().decode(decrypted)).toBe('This is some sensitive file content');
        });
    });
});
