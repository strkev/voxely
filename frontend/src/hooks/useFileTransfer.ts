"use client";

import { useCallback, useRef, useState } from 'react';
import { useDataChannel } from '@livekit/components-react';
import type { ReceivedDataMessage } from '@livekit/components-core';

// ── Constants ────────────────────────────────────────────────────────────────
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const CHUNK_SIZE = 60 * 1024; // 60 KB per chunk (safe for WebRTC)

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
): Uint8Array {
    const encoder = new TextEncoder();
    const idBytes = encoder.encode(transferId); // 36 bytes UUID
    const nameBytes = encoder.encode(fileName);

    const msg = new Uint8Array(
        1 + 36 + 4 + 8 + 12 + 32 + nameBytes.length,
    );

    let offset = 0;
    msg[offset++] = MSG_FILE_START;
    msg.set(idBytes, offset); offset += 36;
    msg.set(encodeUint32(totalChunks), offset); offset += 4;
    msg.set(encodeFloat64(fileSize), offset); offset += 8;
    msg.set(iv, offset); offset += 12;
    msg.set(rawKey, offset); offset += 32;
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

    // ── Handle incoming data channel messages ────────────────────────────────
    const handleMessage = useCallback((msg: ReceivedDataMessage) => {
        const data = msg.payload;
        if (data.length < 1) return;

        const msgType = data[0];
        const decoder = new TextDecoder();
        const transferId = decoder.decode(data.slice(1, 37));

        switch (msgType) {
            case MSG_FILE_START: {
                const totalChunks = decodeUint32(data, 37);
                const fileSize = decodeFloat64(data, 41);
                const iv = data.slice(49, 61);
                const rawKey = data.slice(61, 93);
                const fileName = decoder.decode(data.slice(93));

                const senderId = msg.from?.identity ?? 'unknown';
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
                    });

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

                transfer.receivedChunks.set(chunkIndex, chunkData);
                const progress = Math.round(
                    (transfer.receivedChunks.size / transfer.totalChunks) * 100,
                );
                updateTransfer(transferId, { progress });
                break;
            }

            case MSG_FILE_COMPLETE: {
                const transfer = incomingRef.current.get(transferId);
                if (!transfer) return;

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
                    .then(plainData => {
                        const blob = new Blob([plainData.buffer as ArrayBuffer]);
                        const blobUrl = URL.createObjectURL(blob);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [updateTransfer]);

    const { send } = useDataChannel('file-transfer', handleMessage);

    // ── Send a file ──────────────────────────────────────────────────────────
    const sendFile = useCallback(
        async (file: File, senderName: string, senderId: string) => {
            if (file.size > MAX_FILE_SIZE) {
                throw new Error(`File too large. Maximum is ${MAX_FILE_SIZE / (1024 * 1024)} MB.`);
            }

            const transferId = generateTransferId();
            const aesKey = await generateKey();
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const rawKey = await exportKey(aesKey);

            // Read file as ArrayBuffer
            const arrayBuffer = await file.arrayBuffer();
            const fileData = new Uint8Array(arrayBuffer);

            // Encrypt the entire file
            const encryptedData = await encryptData(fileData, aesKey, iv);

            // Split into chunks
            const totalChunks = Math.ceil(encryptedData.length / CHUNK_SIZE);

            // Register in local state
            const timestamp = new Date().toISOString();
            setTransfers(prev => {
                const next = new Map(prev);
                next.set(transferId, {
                    transferId,
                    fileName: file.name,
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
                // 1. Send start message
                const startMsg = buildFileStartMessage(
                    transferId, totalChunks, file.size, iv, rawKey, file.name,
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

                // Also create a local blob URL for the sender
                const localBlob = new Blob([fileData.buffer as ArrayBuffer]);
                const localBlobUrl = URL.createObjectURL(localBlob);

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
        [send, updateTransfer],
    );

    return {
        transfers,
        sendFile,
        maxFileSize: MAX_FILE_SIZE,
    };
}
