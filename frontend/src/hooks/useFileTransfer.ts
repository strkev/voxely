"use client";

import { useCallback, useRef, useState, useEffect } from 'react';
import { useDataChannel } from '@livekit/components-react';
import type { ReceivedDataMessage } from '@livekit/components-core';

import {
    MAX_FILE_SIZE,
    CHUNK_SIZE,
    MAX_INCOMING_TRANSFERS,
    MAX_INCOMING_PER_SENDER,
    TRANSFER_TIMEOUT_MS,
    type FileTransferInfo,
    type IncomingTransfer,
    hasDangerousMagicNumber,
    MSG_FILE_START,
    MSG_FILE_CHUNK,
    MSG_FILE_COMPLETE,
    sanitizeFileName,
    isBlockedFileType,
    computeHash,
    decodeUint32,
    decodeFloat64,
    buildFileStartMessage,
    buildFileChunkMessage,
    buildFileCompleteMessage,
    generateTransferId,
    MAX_MEMORY_FILES
} from '@/lib/file-utils';

export interface UseFileTransferOptions {
    onIncomingTransfer?: (transfer: FileTransferInfo) => void;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useFileTransfer(options?: UseFileTransferOptions) {
    const { onIncomingTransfer } = options ?? {};
    const [transfers, setTransfers] = useState<Map<string, FileTransferInfo>>(new Map());
    const incomingRef = useRef<Map<string, IncomingTransfer>>(new Map());
    const timeoutTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
    const completedQueueRef = useRef<string[]>([]);

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

    // ── Eviction Logic ───────────────────────────────────────────────────────
    const evictOldestTransfer = useCallback(() => {
        if (completedQueueRef.current.length < MAX_MEMORY_FILES) return;

        const oldestId = completedQueueRef.current.shift();
        if (!oldestId) return;

        setTransfers(prev => {
            const next = new Map(prev);
            const existing = next.get(oldestId);
            if (existing && existing.blobUrl) {
                try {
                    URL.revokeObjectURL(existing.blobUrl);
                    createdUrlsRef.current.delete(existing.blobUrl);
                } catch (e) {
                    console.error('[FileTransfer] Failed to revoke evicted URL:', e);
                }
                next.set(oldestId, { ...existing, status: 'evicted', blobUrl: undefined });
            }
            return next;
        });
    }, []);

    // ── Assemble a completed transfer ────────────────────────────
    const assembleFiles = useCallback((transferId: string, transfer: IncomingTransfer) => {

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

        // Concatenate all chunks
        const totalLength = chunks.reduce((sum: number, c: Uint8Array) => sum + c.length, 0);
        const plainData = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
            plainData.set(chunk, offset);
            offset += chunk.length;
        }

        // ── Security: verify file integrity via SHA-256 ──
        computeHash(plainData).then((receivedHash) => {
            const hashMatch = transfer.fileHash.length === receivedHash.length &&
                transfer.fileHash.every((b: number, i: number) => b === receivedHash[i]);

            if (!hashMatch) {
                console.error('[FileTransfer] Integrity check failed — file hash mismatch');
                updateTransfer(transferId, {
                    status: 'error',
                    error: 'Integrity check failed',
                });
                incomingRef.current.delete(transferId);
                return;
            }

            // ── Security: Magic Number validation ──
            const dangerousType = hasDangerousMagicNumber(plainData);
            if (dangerousType) {
                console.error('[FileTransfer] Magic Number check failed — detected:', dangerousType);
                updateTransfer(transferId, {
                    status: 'error',
                    error: `Blocked: detected ${dangerousType}`,
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

            // Manage memory (FIFO)
            evictOldestTransfer();
            completedQueueRef.current.push(transferId);

            updateTransfer(transferId, {
                status: 'complete',
                progress: 100,
                blobUrl,
            });
            incomingRef.current.delete(transferId);
        }).catch(err => {
            console.error('[FileTransfer] Finalization failed:', err);
            updateTransfer(transferId, {
                status: 'error',
                error: 'File finalization failed',
            });
            incomingRef.current.delete(transferId);
        });
    }, [updateTransfer, trackUrl, evictOldestTransfer]);

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

                // New layout: type(1) + id(36) + chunks(4) + size(8) + hash(32) + name(var)
                const totalChunks = decodeUint32(data, 37);
                const fileSize = decodeFloat64(data, 41);
                const fileHash = data.slice(49, 81);
                const rawFileName = decoder.decode(data.slice(81));

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

                incomingRef.current.set(transferId, {
                    fileName,
                    fileSize,
                    totalChunks,
                    receivedChunks: new Map(),
                    receivedBytes: 0,
                    senderId,
                    senderName,
                    timestamp,
                    lastActivity: Date.now(),
                    fileHash,
                });

                const transferInfo: FileTransferInfo = {
                    transferId,
                    fileName,
                    fileSize,
                    progress: 0,
                    status: 'receiving',
                    senderId,
                    senderName,
                    timestamp,
                };

                // Start timeout for this transfer
                startTransferTimeout(transferId);

                setTransfers(prev => {
                    const next = new Map(prev);
                    next.set(transferId, transferInfo);
                    return next;
                });

                if (onIncomingTransfer) {
                    onIncomingTransfer(transferInfo);
                }
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

                // ── Security: chunk replay protection ────────────────────
                if (transfer.receivedChunks.has(chunkIndex)) {
                    return;
                }

                // ── Security: cumulative byte limit ──
                const maxBytes = transfer.fileSize * 1.05; // 5% overhead tolerance
                if (transfer.receivedBytes + chunkData.length > maxBytes) {
                    console.warn('[FileTransfer] Cumulative byte limit exceeded, terminating:', transferId);
                    cleanupTransfer(transferId, 'Data size limit exceeded');
                    return;
                }

                transfer.receivedChunks.set(chunkIndex, chunkData);
                transfer.receivedBytes += chunkData.length;
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

                assembleFiles(transferId, transfer);
                break;
            }
        }
    }, [updateTransfer, startTransferTimeout, resetTransferTimeout, cleanupTransfer, assembleFiles, onIncomingTransfer]);

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

            // Read file as ArrayBuffer
            const arrayBuffer = await file.arrayBuffer();
            const fileData = new Uint8Array(arrayBuffer);

            // ── Security: Magic Number check before sending ──
            const dangerousType = hasDangerousMagicNumber(fileData);
            if (dangerousType) {
                throw new Error(`Blocked: file detected as ${dangerousType}`);
            }

            // Compute SHA-256 hash for integrity verification
            const fileHash = await computeHash(fileData);

            // Split into chunks
            const totalChunks = Math.ceil(fileData.length / CHUNK_SIZE);

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
                // 1. Send start message
                const startMsg = buildFileStartMessage(
                    transferId, totalChunks, file.size, safeFileName, fileHash,
                );
                await send(startMsg, { reliable: true });

                // 2. Send chunks with small delay to not overwhelm
                for (let i = 0; i < totalChunks; i++) {
                    const start = i * CHUNK_SIZE;
                    const end = Math.min(start + CHUNK_SIZE, fileData.length);
                    const chunk = fileData.slice(start, end);

                    const chunkMsg = buildFileChunkMessage(transferId, i, chunk);
                    await send(chunkMsg, { reliable: true });

                    const progress = Math.round(((i + 1) / totalChunks) * 100);
                    updateTransfer(transferId, { progress });

                    // Small yield to prevent blocking
                    if (i % 10 === 0) {
                        await new Promise(r => setTimeout(r, 5));
                    }
                }

                // 4. Send complete message
                const completeMsg = buildFileCompleteMessage(transferId);
                await send(completeMsg, { reliable: true });

                // Also create a local blob URL for the sender (safe MIME type)
                const localBlob = new Blob([fileData.buffer as ArrayBuffer], {
                    type: 'application/octet-stream',
                });
                const localBlobUrl = URL.createObjectURL(localBlob);
                trackUrl(localBlobUrl);

                // Manage memory (FIFO)
                evictOldestTransfer();
                completedQueueRef.current.push(transferId);

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
        [send, updateTransfer, trackUrl, evictOldestTransfer],
    );

    return {
        transfers,
        sendFile,
        maxFileSize: MAX_FILE_SIZE,
    };
}
