"use client";

import { useCallback, useRef, useState, useEffect } from 'react';
import { useDataChannel } from '@livekit/components-react';
import type { ReceivedDataMessage } from '@livekit/components-core';

// ── Constants ────────────────────────────────────────────────────────────────
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const CHUNK_SIZE = 60 * 1024; // 60 KB per chunk (safe for WebRTC)
const MAX_INCOMING_TRANSFERS = 10; // total concurrent incoming transfers
const MAX_INCOMING_PER_SENDER = 3; // concurrent incoming transfers per sender
const TRANSFER_TIMEOUT_MS = 60_000; // 60 seconds timeout for stale transfers

// ── Blocked file extensions (dangerous executables / scripting) ──────────────
const BLOCKED_EXTENSIONS = new Set([
    'exe', 'bat', 'cmd', 'com', 'msi', 'scr', 'pif',     // Windows executables
    'vbs', 'vbe', 'js', 'jse', 'ws', 'wsf', 'wsc', 'wsh', // Scripts
    'ps1', 'ps1xml', 'ps2', 'ps2xml', 'psc1', 'psc2',     // PowerShell
    'msp', 'mst', 'cpl', 'hta', 'inf', 'ins', 'isp',      // Windows system
    'reg', 'rgs', 'sct', 'shb', 'shs', 'lnk',              // Shortcuts / registry
    'app', 'action', 'command', 'workflow',                  // macOS
    'sh', 'csh', 'ksh', 'out', 'run',                       // Unix
    'html', 'htm', 'xhtml', 'svg', 'xml',                   // Markup with scripting
    'swf', 'jar', 'class',                                   // Flash / Java
    'dll', 'sys', 'drv', 'ocx',                              // Libraries
]);

// ── Binary protocol message types ────────────────────────────────────────────
const MSG_FILE_START = 0x01;
const MSG_FILE_CHUNK = 0x02;
const MSG_FILE_COMPLETE = 0x03;

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

interface IncomingTransfer {
    fileName: string;
    fileSize: number;
    totalChunks: number;
    receivedChunks: Map<number, Uint8Array>;
    iv: Uint8Array;
    key: CryptoKey;
    senderId: string;
    senderName: string;
    timestamp: string;
    lastActivity: number; // for timeout detection
    fileHash: Uint8Array; // SHA-256 hash for integrity verification
}

// ── Security helpers ─────────────────────────────────────────────────────────

/** Sanitize filename to prevent path traversal, XSS, and filesystem issues */
function sanitizeFileName(name: string): string {
    return name
        .replace(/[\/\\:*?"<>|]/g, '_')  // filesystem-unsafe characters
        .replace(/\.\./g, '_')            // path traversal
        .replace(/^\.+/, '_')             // hidden files / dotfile escape
        .replace(/[\x00-\x1f\x7f]/g, '') // control characters
        .trim()
        .slice(0, 200)                    // length limit
        || 'unnamed_file';                // fallback if empty after sanitization
}

/** Extract file extension (lowercase) from filename */
function getFileExtension(name: string): string {
    const dotIndex = name.lastIndexOf('.');
    if (dotIndex < 0 || dotIndex === name.length - 1) return '';
    return name.slice(dotIndex + 1).toLowerCase();
}

/** Check if file extension is blocked (dangerous executable/script types) */
export function isBlockedFileType(name: string): boolean {
    const ext = getFileExtension(name);
    if (!ext) return false;
    return BLOCKED_EXTENSIONS.has(ext);
}

/** Get user-friendly list of allowed file info */
export function getBlockedExtensionsList(): string {
    return Array.from(BLOCKED_EXTENSIONS).sort().join(', ');
}

// ── Hashing helper ───────────────────────────────────────────────────────────

async function computeHash(data: Uint8Array): Promise<Uint8Array> {
    const hash = await crypto.subtle.digest('SHA-256', data.buffer as ArrayBuffer);
    return new Uint8Array(hash);
}

// ── Crypto helpers ───────────────────────────────────────────────────────────
async function generateKey(): Promise<CryptoKey> {
    return crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true, // extractable so we can share it
        ['encrypt', 'decrypt'],
    );
}

async function exportKey(key: CryptoKey): Promise<Uint8Array> {
    const raw = await crypto.subtle.exportKey('raw', key);
    return new Uint8Array(raw as ArrayBuffer);
}

async function importKey(raw: Uint8Array): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        'raw',
        raw.buffer as ArrayBuffer,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt'],
    );
}

async function encryptData(
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

async function decryptData(
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

// ── UUID helper ──────────────────────────────────────────────────────────────
function generateTransferId(): string {
    return crypto.randomUUID();
}

// ── Encoding helpers ─────────────────────────────────────────────────────────
function encodeUint32(value: number): Uint8Array {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setUint32(0, value, false);
    return new Uint8Array(buf);
}

function decodeUint32(data: Uint8Array, offset: number): number {
    return new DataView(data.buffer, data.byteOffset + offset, 4).getUint32(0, false);
}

function encodeFloat64(value: number): Uint8Array {
    const buf = new ArrayBuffer(8);
    new DataView(buf).setFloat64(0, value, false);
    return new Uint8Array(buf);
}

function decodeFloat64(data: Uint8Array, offset: number): number {
    return new DataView(data.buffer, data.byteOffset + offset, 8).getFloat64(0, false);
}

// ── Build protocol messages ──────────────────────────────────────────────────

function buildFileStartMessage(
    transferId: string,
    totalChunks: number,
    fileSize: number,
    iv: Uint8Array,
    rawKey: Uint8Array,
    fileName: string,
    fileHash: Uint8Array, // 32 bytes SHA-256
): Uint8Array {
    const encoder = new TextEncoder();
    const idBytes = encoder.encode(transferId); // 36 bytes UUID
    const nameBytes = encoder.encode(fileName);

    // Layout: type(1) + id(36) + chunks(4) + size(8) + iv(12) + key(32) + hash(32) + name(var)
    const msg = new Uint8Array(
        1 + 36 + 4 + 8 + 12 + 32 + 32 + nameBytes.length,
    );

    let offset = 0;
    msg[offset++] = MSG_FILE_START;
    msg.set(idBytes, offset); offset += 36;
    msg.set(encodeUint32(totalChunks), offset); offset += 4;
    msg.set(encodeFloat64(fileSize), offset); offset += 8;
    msg.set(iv, offset); offset += 12;
    msg.set(rawKey, offset); offset += 32;
    msg.set(fileHash, offset); offset += 32;
    msg.set(nameBytes, offset);

    return msg;
}

function buildFileChunkMessage(
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

function buildFileCompleteMessage(transferId: string): Uint8Array {
    const encoder = new TextEncoder();
    const idBytes = encoder.encode(transferId);

    const msg = new Uint8Array(1 + 36);
    msg[0] = MSG_FILE_COMPLETE;
    msg.set(idBytes, 1);
    return msg;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useFileTransfer() {
    const [transfers, setTransfers] = useState<Map<string, FileTransferInfo>>(new Map());
    const incomingRef = useRef<Map<string, IncomingTransfer>>(new Map());
    const timeoutTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    const updateTransfer = useCallback((id: string, update: Partial<FileTransferInfo>) => {
        setTransfers(prev => {
            const next = new Map(prev);
            const existing = next.get(id);
            if (existing) {
                next.set(id, { ...existing, ...update });
            }
            return next;
        });
    }, []);

    // ── Cleanup a stale transfer ─────────────────────────────────────────────
    const cleanupTransfer = useCallback((transferId: string, reason: string) => {
        incomingRef.current.delete(transferId);
        const timer = timeoutTimersRef.current.get(transferId);
        if (timer) {
            clearTimeout(timer);
            timeoutTimersRef.current.delete(transferId);
        }
        updateTransfer(transferId, { status: 'error', error: reason });
    }, [updateTransfer]);

    // ── Start a timeout for an incoming transfer ─────────────────────────────
    const startTransferTimeout = useCallback((transferId: string) => {
        // Clear any existing timer
        const existing = timeoutTimersRef.current.get(transferId);
        if (existing) clearTimeout(existing);

        const timer = setTimeout(() => {
            const transfer = incomingRef.current.get(transferId);
            if (transfer) {
                console.warn('[FileTransfer] Transfer timed out:', transferId);
                cleanupTransfer(transferId, 'Transfer timed out');
            }
        }, TRANSFER_TIMEOUT_MS);

        timeoutTimersRef.current.set(transferId, timer);
    }, [cleanupTransfer]);

    // ── Reset timeout on activity ────────────────────────────────────────────
    const resetTransferTimeout = useCallback((transferId: string) => {
        const transfer = incomingRef.current.get(transferId);
        if (transfer) {
            transfer.lastActivity = Date.now();
        }
        startTransferTimeout(transferId);
    }, [startTransferTimeout]);

    // Tracking for cleanup
    const createdUrlsRef = useRef<Set<string>>(new Set());

    // Helper to add URLs for tracking
    const trackUrl = useCallback((url: string) => {
        createdUrlsRef.current.add(url);
    }, []);

    // ── Handle incoming data channel messages ────────────────────────────────
    const handleMessage = useCallback((msg: ReceivedDataMessage) => {
        const data = msg.payload;
        if (data.length < 1) return;

        const msgType = data[0];
        const decoder = new TextDecoder();
        const transferId = decoder.decode(data.slice(1, 37));

        switch (msgType) {
            case MSG_FILE_START: {
                // ── Rate limiting: check concurrent transfer limits ──────
                const currentCount = incomingRef.current.size;
                if (currentCount >= MAX_INCOMING_TRANSFERS) {
                    console.warn('[FileTransfer] Too many concurrent incoming transfers, rejecting:', transferId);
                    return;
                }

                const senderId = msg.from?.identity ?? 'unknown';
                let senderCount = 0;
                for (const t of incomingRef.current.values()) {
                    if (t.senderId === senderId) senderCount++;
                }
                if (senderCount >= MAX_INCOMING_PER_SENDER) {
                    console.warn('[FileTransfer] Too many concurrent transfers from sender:', senderId);
                    return;
                }

                const totalChunks = decodeUint32(data, 37);
                const fileSize = decodeFloat64(data, 41);
                const iv = data.slice(49, 61);
                const rawKey = data.slice(61, 93);
                const fileHash = data.slice(93, 125);
                const rawFileName = decoder.decode(data.slice(125));

                // ── Security: sanitize filename ──────────────────────────
                const fileName = sanitizeFileName(rawFileName);

                // ── Security: block dangerous file types ─────────────────
                if (isBlockedFileType(fileName)) {
                    console.warn('[FileTransfer] Blocked dangerous file type:', fileName);
                    const senderName = msg.from?.name ?? 'Unknown';
                    setTransfers(prev => {
                        const next = new Map(prev);
                        next.set(transferId, {
                            transferId,
                            fileName,
                            fileSize,
                            progress: 0,
                            status: 'error',
                            senderId,
                            senderName,
                            timestamp: new Date().toISOString(),
                            error: 'Blocked: dangerous file type',
                        });
                        return next;
                    });
                    return;
                }

                // ── Security: validate file size ─────────────────────────
                if (fileSize > MAX_FILE_SIZE || fileSize <= 0) {
                    console.warn('[FileTransfer] Invalid file size:', fileSize);
                    return;
                }

                const senderName = msg.from?.name ?? 'Unknown';
                const timestamp = new Date().toISOString();

                // Import AES key
                importKey(rawKey).then(key => {
                    incomingRef.current.set(transferId, {
                        fileName,
                        fileSize,
                        totalChunks,
                        receivedChunks: new Map(),
                        iv,
                        key,
                        senderId,
                        senderName,
                        timestamp,
                        lastActivity: Date.now(),
                        fileHash,
                    });

                    // Start timeout for this transfer
                    startTransferTimeout(transferId);

                    setTransfers(prev => {
                        const next = new Map(prev);
                        next.set(transferId, {
                            transferId,
                            fileName,
                            fileSize,
                            progress: 0,
                            status: 'receiving',
                            senderId,
                            senderName,
                            timestamp,
                        });
                        return next;
                    });
                }).catch(err => {
                    console.error('[FileTransfer] Failed to import key:', err);
                });
                break;
            }

            case MSG_FILE_CHUNK: {
                const chunkIndex = decodeUint32(data, 37);
                const chunkData = data.slice(41);
                const transfer = incomingRef.current.get(transferId);

                if (!transfer) {
                    console.warn('[FileTransfer] Received chunk for unknown transfer:', transferId);
                    return;
                }

                // ── Security: validate chunk index ───────────────────────
                if (chunkIndex >= transfer.totalChunks || chunkIndex < 0) {
                    console.warn('[FileTransfer] Invalid chunk index:', chunkIndex);
                    return;
                }

                transfer.receivedChunks.set(chunkIndex, chunkData);
                const progress = Math.round(
                    (transfer.receivedChunks.size / transfer.totalChunks) * 100,
                );
                updateTransfer(transferId, { progress });

                // Reset timeout on activity
                resetTransferTimeout(transferId);
                break;
            }

            case MSG_FILE_COMPLETE: {
                const transfer = incomingRef.current.get(transferId);
                if (!transfer) return;

                // Clear timeout timer
                const timer = timeoutTimersRef.current.get(transferId);
                if (timer) {
                    clearTimeout(timer);
                    timeoutTimersRef.current.delete(transferId);
                }

                // Reassemble chunks in order
                const chunks: Uint8Array[] = [];
                for (let i = 0; i < transfer.totalChunks; i++) {
                    const chunk = transfer.receivedChunks.get(i);
                    if (!chunk) {
                        console.error('[FileTransfer] Missing chunk', i);
                        updateTransfer(transferId, {
                            status: 'error',
                            error: `Missing chunk ${i}`,
                        });
                        incomingRef.current.delete(transferId);
                        return;
                    }
                    chunks.push(chunk);
                }

                // Concatenate all encrypted chunks
                const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
                const encryptedData = new Uint8Array(totalLength);
                let offset = 0;
                for (const chunk of chunks) {
                    encryptedData.set(chunk, offset);
                    offset += chunk.length;
                }

                // Decrypt the full payload
                decryptData(encryptedData, transfer.key, transfer.iv)
                    .then(async plainData => {
                        // ── Security: verify file integrity via SHA-256 ──
                        const receivedHash = await computeHash(plainData);
                        const hashMatch = transfer.fileHash.length === receivedHash.length &&
                            transfer.fileHash.every((b, i) => b === receivedHash[i]);

                        if (!hashMatch) {
                            console.error('[FileTransfer] Integrity check failed — file hash mismatch');
                            updateTransfer(transferId, {
                                status: 'error',
                                error: 'Integrity check failed',
                            });
                            incomingRef.current.delete(transferId);
                            return;
                        }

                        // Force safe MIME type to prevent browser from executing content
                        const blob = new Blob([plainData.buffer as ArrayBuffer], {
                            type: 'application/octet-stream',
                        });
                        const blobUrl = URL.createObjectURL(blob);
                        trackUrl(blobUrl);
                        updateTransfer(transferId, {
                            status: 'complete',
                            progress: 100,
                            blobUrl,
                        });
                        incomingRef.current.delete(transferId);
                    })
                    .catch(err => {
                        console.error('[FileTransfer] Decryption failed:', err);
                        updateTransfer(transferId, {
                            status: 'error',
                            error: 'Decryption failed',
                        });
                        incomingRef.current.delete(transferId);
                    });
                break;
            }
        }
    }, [updateTransfer, startTransferTimeout, resetTransferTimeout, trackUrl]);

    const { send } = useDataChannel('file-transfer', handleMessage);

    // Cleanup URLs + timeout timers on unmount
    useEffect(() => {
        const urls = createdUrlsRef.current;
        const timers = timeoutTimersRef.current;
        return () => {
            urls.forEach(url => {
                try {
                URL.revokeObjectURL(url);
                } catch (e) {
                console.error('[FileTransfer] Failed to revoke URL:', e);
                }
            });
            urls.clear();

            // Clear all timeout timers
            timers.forEach(timer => clearTimeout(timer));
            timers.clear();
        };
    }, []);

    // ── Send a file ──────────────────────────────────────────────────────────
    const sendFile = useCallback(
        async (file: File, senderName: string, senderId: string) => {
            if (file.size > MAX_FILE_SIZE) {
                throw new Error(`File too large. Maximum is ${MAX_FILE_SIZE / (1024 * 1024)} MB.`);
            }

            // ── Security: block dangerous file types on send side too ────
            if (isBlockedFileType(file.name)) {
                throw new Error('This file type is not allowed for security reasons.');
            }

            const transferId = generateTransferId();
            const aesKey = await generateKey();
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const rawKey = await exportKey(aesKey);

            // Read file as ArrayBuffer
            const arrayBuffer = await file.arrayBuffer();
            const fileData = new Uint8Array(arrayBuffer);

            // Compute SHA-256 hash for integrity verification
            const fileHash = await computeHash(fileData);

            // Encrypt the entire file
            const encryptedData = await encryptData(fileData, aesKey, iv);

            // Split into chunks
            const totalChunks = Math.ceil(encryptedData.length / CHUNK_SIZE);

            // Sanitize filename for transmission
            const safeFileName = sanitizeFileName(file.name);

            // Register in local state
            const timestamp = new Date().toISOString();
            setTransfers(prev => {
                const next = new Map(prev);
                next.set(transferId, {
                    transferId,
                    fileName: safeFileName,
                    fileSize: file.size,
                    progress: 0,
                    status: 'sending',
                    senderId,
                    senderName,
                    timestamp,
                });
                return next;
            });

            try {
                // 1. Send start message (now includes fileHash)
                const startMsg = buildFileStartMessage(
                    transferId, totalChunks, file.size, iv, rawKey, safeFileName, fileHash,
                );
                await send(startMsg, { reliable: true });

                // 2. Send chunks with small delay to not overwhelm
                for (let i = 0; i < totalChunks; i++) {
                    const start = i * CHUNK_SIZE;
                    const end = Math.min(start + CHUNK_SIZE, encryptedData.length);
                    const chunk = encryptedData.slice(start, end);

                    const chunkMsg = buildFileChunkMessage(transferId, i, chunk);
                    await send(chunkMsg, { reliable: true });

                    const progress = Math.round(((i + 1) / totalChunks) * 100);
                    updateTransfer(transferId, { progress });

                    // Small yield to prevent blocking
                    if (i % 10 === 0) {
                        await new Promise(r => setTimeout(r, 5));
                    }
                }

                // 3. Send complete message
                const completeMsg = buildFileCompleteMessage(transferId);
                await send(completeMsg, { reliable: true });

                // Also create a local blob URL for the sender (safe MIME type)
                const localBlob = new Blob([fileData.buffer as ArrayBuffer], {
                    type: 'application/octet-stream',
                });
                const localBlobUrl = URL.createObjectURL(localBlob);
                trackUrl(localBlobUrl);

                updateTransfer(transferId, {
                    status: 'complete',
                    progress: 100,
                    blobUrl: localBlobUrl,
                });
            } catch (err) {
                console.error('[FileTransfer] Send failed:', err);
                updateTransfer(transferId, {
                    status: 'error',
                    error: err instanceof Error ? err.message : 'Send failed',
                });
            }
        },
        [send, updateTransfer, trackUrl],
    );

    return {
        transfers,
        sendFile,
        maxFileSize: MAX_FILE_SIZE,
    };
}
