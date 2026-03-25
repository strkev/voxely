/**
 * Utility functions for file transfer logic.
 * Includes security checks, crypto helpers, and binary protocol building.
 */

// ── Constants ────────────────────────────────────────────────────────────────
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
export const CHUNK_SIZE = 60 * 1024; // 60 KB per chunk (safe for WebRTC)
export const MAX_INCOMING_TRANSFERS = 4; // total concurrent incoming transfers
export const MAX_INCOMING_PER_SENDER = 2; // concurrent incoming transfers per sender
export const TRANSFER_TIMEOUT_MS = 60_000; // 60 seconds timeout for stale transfers

// ── Types ────────────────────────────────────────────────────────────────────
export type FileTransferStatus = 'sending' | 'receiving' | 'complete' | 'error';

export interface FileTransferInfo {
    transferId: string;
    fileName: string;
    fileSize: number;
    blobUrl?: string;
    progress: number; // 0-100
    status: FileTransferStatus;
    senderId: string;
    senderName: string;
    timestamp: string;
    error?: string;
}

export interface IncomingTransfer {
    fileName: string;
    fileSize: number;
    totalChunks: number;
    receivedChunks: Map<number, Uint8Array>;
    receivedBytes: number; // cumulative byte tracking for DoS protection
    iv: Uint8Array;
    key: CryptoKey | null; // null until we receive MSG_FILE_KEY
    senderId: string;
    senderName: string;
    timestamp: string;
    lastActivity: number; // for timeout detection
    fileHash: Uint8Array; // SHA-256 hash for integrity verification
    pendingChunks: Array<{ chunkIndex: number; chunkData: Uint8Array }>; // buffer chunks before key arrives
}

// ── Blocked file extensions ──────────────────────────────────────────────────
export const BLOCKED_EXTENSIONS = new Set([
    'exe', 'bat', 'cmd', 'com', 'msi', 'scr', 'pif',
    'vbs', 'vbe', 'js', 'jse', 'ws', 'wsf', 'wsc', 'wsh',
    'ps1', 'ps1xml', 'ps2', 'ps2xml', 'psc1', 'psc2',
    'msp', 'mst', 'cpl', 'hta', 'inf', 'ins', 'isp',
    'reg', 'rgs', 'sct', 'shb', 'shs', 'lnk',
    'app', 'action', 'command', 'workflow',
    'sh', 'csh', 'ksh', 'out', 'run',
    'html', 'htm', 'xhtml', 'svg', 'xml',
    'swf', 'jar', 'class',
    'dll', 'sys', 'drv', 'ocx',
]);

// ── Magic Number signatures ──────────────────────────────────────────────────
export const DANGEROUS_MAGIC_NUMBERS: Array<{ name: string; bytes: number[] }> = [
    { name: 'Windows EXE/DLL (MZ)',       bytes: [0x4D, 0x5A] },
    { name: 'ELF executable',             bytes: [0x7F, 0x45, 0x4C, 0x46] },
    { name: 'Mach-O 32-bit',              bytes: [0xFE, 0xED, 0xFA, 0xCE] },
    { name: 'Mach-O 64-bit',              bytes: [0xFE, 0xED, 0xFA, 0xCF] },
    { name: 'Mach-O 32-bit (reverse)',     bytes: [0xCE, 0xFA, 0xED, 0xFE] },
    { name: 'Mach-O 64-bit (reverse)',     bytes: [0xCF, 0xFA, 0xED, 0xFE] },
    { name: 'Mach-O Universal Binary',    bytes: [0xCA, 0xFE, 0xBA, 0xBE] },
    { name: 'Java Class file',            bytes: [0xCA, 0xFE, 0xBA, 0xBE] },
    { name: 'Windows COM executable',     bytes: [0xE9] },
    { name: 'MS-DOS MZ (alt)',            bytes: [0x5A, 0x4D] },
    { name: 'Shell/Script (shebang)',     bytes: [0x23, 0x21] },
];

/** Check if the decrypted file bytes match any dangerous magic number signature */
export function hasDangerousMagicNumber(data: Uint8Array): string | null {
    if (data.length < 2) return null; // shortest signature is 1 byte but most are 2+
    for (const sig of DANGEROUS_MAGIC_NUMBERS) {
        if (sig.bytes.length > data.length) continue;
        let match = true;
        for (let i = 0; i < sig.bytes.length; i++) {
            if (data[i] !== sig.bytes[i]) { match = false; break; }
        }
        if (match) return sig.name;
    }
    return null;
}

// ── Binary protocol message types ────────────────────────────────────────────
export const MSG_FILE_START    = 0x01;
export const MSG_FILE_CHUNK    = 0x02;
export const MSG_FILE_COMPLETE = 0x03;
export const MSG_FILE_KEY      = 0x04;

// ── Security helpers ─────────────────────────────────────────────────────────

/** Sanitize filename to prevent path traversal, XSS, and filesystem issues */
export function sanitizeFileName(name: string): string {
    return name
        .replace(/[\/\\:*?"<>|]/g, '_')
        .replace(/\.\./g, '_')
        .replace(/^\.+/, '_')
        .replace(/[\x00-\x1f\x7f]/g, '')
        .trim()
        .slice(0, 200)
        || 'unnamed_file';
}

/** Extract file extension (lowercase) from filename */
export function getFileExtension(name: string): string {
    const dotIndex = name.lastIndexOf('.');
    if (dotIndex < 0 || dotIndex === name.length - 1) return '';
    return name.slice(dotIndex + 1).toLowerCase();
}

/** Check if file extension is blocked */
export function isBlockedFileType(name: string): boolean {
    const ext = getFileExtension(name);
    if (!ext) return false;
    return BLOCKED_EXTENSIONS.has(ext);
}

// ── Hashing helper ───────────────────────────────────────────────────────────

export async function computeHash(data: Uint8Array): Promise<Uint8Array> {
    const hash = await crypto.subtle.digest('SHA-256', data.buffer as ArrayBuffer);
    return new Uint8Array(hash);
}

// ── UUID helper ──────────────────────────────────────────────────────────────
export function generateTransferId(): string {
    return crypto.randomUUID();
}

// ── Crypto helpers ───────────────────────────────────────────────────────────

export async function generateKey(): Promise<CryptoKey> {
    return crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt'],
    );
}

export async function exportKey(key: CryptoKey): Promise<Uint8Array> {
    const raw = await crypto.subtle.exportKey('raw', key);
    return new Uint8Array(raw as ArrayBuffer);
}

export async function importKey(raw: Uint8Array): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        'raw',
        raw.buffer as ArrayBuffer,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt'],
    );
}

export async function encryptData(
    data: Uint8Array,
    key: CryptoKey,
    iv: Uint8Array,
): Promise<Uint8Array> {
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
        key,
        data.buffer as ArrayBuffer,
    );
    return new Uint8Array(encrypted as ArrayBuffer);
}

export async function decryptData(
    data: Uint8Array,
    key: CryptoKey,
    iv: Uint8Array,
): Promise<Uint8Array> {
    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
        key,
        data.buffer as ArrayBuffer,
    );
    return new Uint8Array(decrypted as ArrayBuffer);
}

// ── Encoding helpers ─────────────────────────────────────────────────────────

export function encodeUint32(value: number): Uint8Array {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setUint32(0, value, false);
    return new Uint8Array(buf);
}

export function decodeUint32(data: Uint8Array, offset: number): number {
    return new DataView(data.buffer, data.byteOffset + offset, 4).getUint32(0, false);
}

export function encodeFloat64(value: number): Uint8Array {
    const buf = new ArrayBuffer(8);
    new DataView(buf).setFloat64(0, value, false);
    return new Uint8Array(buf);
}

export function decodeFloat64(data: Uint8Array, offset: number): number {
    return new DataView(data.buffer, data.byteOffset + offset, 8).getFloat64(0, false);
}

// ── Build protocol messages ──────────────────────────────────────────────────

export function buildFileStartMessage(
    transferId: string,
    totalChunks: number,
    fileSize: number,
    iv: Uint8Array,
    fileName: string,
    fileHash: Uint8Array,
): Uint8Array {
    const encoder = new TextEncoder();
    const idBytes = encoder.encode(transferId);
    const nameBytes = encoder.encode(fileName);
    const msg = new Uint8Array(1 + 36 + 4 + 8 + 12 + 32 + nameBytes.length);
    let offset = 0;
    msg[offset++] = MSG_FILE_START;
    msg.set(idBytes, offset); offset += 36;
    msg.set(encodeUint32(totalChunks), offset); offset += 4;
    msg.set(encodeFloat64(fileSize), offset); offset += 8;
    msg.set(iv, offset); offset += 12;
    msg.set(fileHash, offset); offset += 32;
    msg.set(nameBytes, offset);
    return msg;
}

export function buildFileKeyMessage(
    transferId: string,
    keyIv: Uint8Array,
    encryptedKey: Uint8Array,
): Uint8Array {
    const encoder = new TextEncoder();
    const idBytes = encoder.encode(transferId);
    const msg = new Uint8Array(1 + 36 + 12 + encryptedKey.length);
    let offset = 0;
    msg[offset++] = MSG_FILE_KEY;
    msg.set(idBytes, offset); offset += 36;
    msg.set(keyIv, offset); offset += 12;
    msg.set(encryptedKey, offset);
    return msg;
}

export function buildFileChunkMessage(
    transferId: string,
    chunkIndex: number,
    encryptedChunk: Uint8Array,
): Uint8Array {
    const encoder = new TextEncoder();
    const idBytes = encoder.encode(transferId);
    const msg = new Uint8Array(1 + 36 + 4 + encryptedChunk.length);
    let offset = 0;
    msg[offset++] = MSG_FILE_CHUNK;
    msg.set(idBytes, offset); offset += 36;
    msg.set(encodeUint32(chunkIndex), offset); offset += 4;
    msg.set(encryptedChunk, offset);
    return msg;
}

export function buildFileCompleteMessage(transferId: string): Uint8Array {
    const encoder = new TextEncoder();
    const idBytes = encoder.encode(transferId);
    const msg = new Uint8Array(1 + 36);
    msg[0] = MSG_FILE_COMPLETE;
    msg.set(idBytes, 1);
    return msg;
}
