"use client";

import { useCallback, useRef, useState, useEffect } from 'react';
import { useDataChannel, useConnectionState, useRemoteParticipants } from '@livekit/components-react';
import { ConnectionState } from 'livekit-client';
import type { ReceivedDataMessage } from '@livekit/components-core';

import { 
    KEY_ANNOUNCE, 
    KEY_REPLY, 
    GROUP_KEY_SHARE,
    generateECDHKeyPair,
    exportPublicKey,
    importPublicKey,
    deriveSharedKey,
    generateGroupKey,
    exportAESKey,
    importAESKey,
    aesEncrypt,
    aesDecrypt,
    decodeUint16,
    buildKeyAnnounce,
    buildKeyReply,
    buildGroupKeyShare
} from '@/lib/crypto';

// ── State types ──────────────────────────────────────────────────────────────

interface PeerKeyState {
    publicKey: CryptoKey;
    sharedKey: CryptoKey;
    salt: Uint8Array;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useE2EEKeyManager(localIdentity: string) {
    const [isReady, setIsReady] = useState(false);
    const [peerCount, setPeerCount] = useState(0);

    // Refs for crypto state (avoid re-renders on every key exchange)
    const keyPairRef = useRef<CryptoKeyPair | null>(null);
    const publicKeyBytesRef = useRef<Uint8Array | null>(null);
    const saltRef = useRef<Uint8Array>(crypto.getRandomValues(new Uint8Array(32)));
    const peersRef = useRef<Map<string, PeerKeyState>>(new Map());
    const groupKeyRef = useRef<CryptoKey | null>(null);
    const initPromiseRef = useRef<Promise<void> | null>(null);
    const hasGeneratedGroupKey = useRef(false);
    const connectionState = useConnectionState();
    const remoteParticipants = useRemoteParticipants();

    const [joinTimestamp] = useState(() => new Date().toISOString());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sendRef = useRef<((data: Uint8Array, options: any) => Promise<void>) | null>(null);

    // Initialize key pair on mount
    useEffect(() => {
        const init = async () => {
            const keyPair = await generateECDHKeyPair();
            keyPairRef.current = keyPair;
            publicKeyBytesRef.current = await exportPublicKey(keyPair.publicKey);
            setIsReady(true);
        };
        initPromiseRef.current = init();
    }, []);

    // Generate group key if we are the first person in the room
    useEffect(() => {
        if (connectionState === ConnectionState.Connected && isReady && !groupKeyRef.current && !hasGeneratedGroupKey.current) {
            if (remoteParticipants.length === 0) {
                generateGroupKey().then(gk => {
                    groupKeyRef.current = gk;
                    hasGeneratedGroupKey.current = true;
                    console.log('[E2EE] Generated initial group key');
                });
            } else {
                // Not first, wait to receive the group key from others.
                // Fallback: if we don't receive one within 3 seconds, generate one anyway
                const timer = setTimeout(() => {
                    if (!groupKeyRef.current && !hasGeneratedGroupKey.current) {
                        generateGroupKey().then(gk => {
                            groupKeyRef.current = gk;
                            hasGeneratedGroupKey.current = true;
                            console.log('[E2EE] Generated fallback group key');
                        });
                    }
                }, 3000);
                return () => clearTimeout(timer);
            }
        }
    }, [connectionState, remoteParticipants.length, isReady]);

    // ── Handle incoming key exchange messages ────────────────────────────────
    const handleKeyMessage = useCallback(async (msg: ReceivedDataMessage) => {
        // Wait for init to complete
        if (initPromiseRef.current) await initPromiseRef.current;

        const data = msg.payload;
        if (data.length < 1) return;

        const msgType = data[0];
        const decoder = new TextDecoder();

        switch (msgType) {
            case KEY_ANNOUNCE:
            case KEY_REPLY: {
                // Parse: senderIdLen(2) + senderId(var) + pubKey(65) + salt(32)
                if (data.length < 1 + 2) return;
                const senderIdLen = decodeUint16(data, 1);
                const expectedLen = 1 + 2 + senderIdLen + 65 + 32;
                if (data.length < expectedLen) return;

                const senderId = decoder.decode(data.slice(3, 3 + senderIdLen));

                // Don't process our own messages
                if (senderId === localIdentity) return;

                const peerPubKeyBytes = data.slice(3 + senderIdLen, 3 + senderIdLen + 65);
                const peerSalt = data.slice(3 + senderIdLen + 65, 3 + senderIdLen + 65 + 32);

                try {
                    const peerPubKey = await importPublicKey(peerPubKeyBytes);

                    // Derive salt: XOR of both salts for deterministic derivation
                    const combinedSalt = new Uint8Array(32);
                    for (let i = 0; i < 32; i++) {
                        combinedSalt[i] = saltRef.current[i] ^ peerSalt[i];
                    }

                    const sharedKey = await deriveSharedKey(
                        keyPairRef.current!.privateKey,
                        peerPubKey,
                        combinedSalt,
                    );

                    peersRef.current.set(senderId, {
                        publicKey: peerPubKey,
                        sharedKey,
                        salt: peerSalt,
                    });
                    setPeerCount(peersRef.current.size);

                    // If this was an announcement and we haven't replied yet, reply
                    if (msgType === KEY_ANNOUNCE && publicKeyBytesRef.current) {
                        const reply = buildKeyReply(localIdentity, publicKeyBytesRef.current, saltRef.current);
                        sendRef.current?.(reply, { reliable: true });
                    }

                    // Share our group key with the new peer if we have one
                    if (groupKeyRef.current) {
                        const rawGroupKey = await exportAESKey(groupKeyRef.current);
                        const { ciphertext, iv } = await aesEncrypt(rawGroupKey, sharedKey);
                        const shareMsg = buildGroupKeyShare(iv, ciphertext);
                        sendRef.current?.(shareMsg, { reliable: true });
                    }
                } catch (err) {
                    console.error('[E2EE] Failed to process peer key:', err);
                }
                break;
            }

            case GROUP_KEY_SHARE: {
                // Parse: iv(12) + encryptedGroupKey(var)
                if (data.length < 1 + 12 + 1) return;
                const iv = data.slice(1, 13);
                const encryptedKeyData = data.slice(13);

                const senderId = msg.from?.identity;
                if (!senderId) return;

                const peerState = peersRef.current.get(senderId);
                if (!peerState) {
                    console.warn('[E2EE] Received group key from unknown peer:', senderId);
                    return;
                }

                try {
                    const rawGroupKey = await aesDecrypt(encryptedKeyData, peerState.sharedKey, iv);
                    // Only import if we don't have one, or if it's the exact same key it's harmless
                    groupKeyRef.current = await importAESKey(rawGroupKey);
                    hasGeneratedGroupKey.current = true; // prevent fallback generation
                    console.log('[E2EE] Group key received from', senderId);
                } catch (err) {
                    console.error('[E2EE] Failed to decrypt group key:', err);
                }
                break;
            }
        }
    }, [localIdentity]);

    const { send } = useDataChannel('e2ee-keys', handleKeyMessage);

    // Announce our public key to the room once ready
    useEffect(() => {
        sendRef.current = send;

        const announce = async () => {
            if (initPromiseRef.current) await initPromiseRef.current;
            if (!publicKeyBytesRef.current) return;

            // Small delay to ensure data channel is ready
            await new Promise(r => setTimeout(r, 500));

            const msg = buildKeyAnnounce(localIdentity, publicKeyBytesRef.current, saltRef.current);
            try {
                await send(msg, { reliable: true });
                console.log('[E2EE] Announced public key');
            } catch (err) {
                console.error('[E2EE] Failed to announce key:', err);
            }
        };
        announce();
    }, [send, localIdentity]);

    // ── Encrypt a per-file AES key for a specific peer ──────────────────────
    const encryptFileKeyForPeer = useCallback(async (
        peerId: string,
        fileKey: Uint8Array,
    ): Promise<{ ciphertext: Uint8Array; iv: Uint8Array } | null> => {
        const peer = peersRef.current.get(peerId);
        if (!peer) return null;
        return aesEncrypt(fileKey, peer.sharedKey);
    }, []);

    // ── Decrypt a per-file AES key from a specific peer ─────────────────────
    const decryptFileKeyFromPeer = useCallback(async (
        peerId: string,
        ciphertext: Uint8Array,
        iv: Uint8Array,
    ): Promise<Uint8Array | null> => {
        const peer = peersRef.current.get(peerId);
        if (!peer) return null;
        try {
            return await aesDecrypt(ciphertext, peer.sharedKey, iv);
        } catch {
            console.error('[E2EE] Failed to decrypt file key from', peerId);
            return null;
        }
    }, []);

    // ── Chat encryption using the group key ─────────────────────────────────
    const encryptChat = useCallback(async (plaintext: string): Promise<string | null> => {
        const gk = groupKeyRef.current;
        if (!gk) return null;

        const data = new TextEncoder().encode(plaintext);
        const { ciphertext, iv } = await aesEncrypt(data, gk);

        // Encode as: base64(iv + ciphertext)
        const combined = new Uint8Array(iv.length + ciphertext.length);
        combined.set(iv);
        combined.set(ciphertext, iv.length);

        return btoa(String.fromCharCode(...combined));
    }, []);

    const decryptChat = useCallback(async (encoded: string): Promise<string | null> => {
        const gk = groupKeyRef.current;
        if (!gk) return null;

        try {
            const binary = atob(encoded);
            const combined = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                combined[i] = binary.charCodeAt(i);
            }

            const iv = combined.slice(0, 12);
            const ciphertext = combined.slice(12);
            const plainBytes = await aesDecrypt(ciphertext, gk, iv);
            return new TextDecoder().decode(plainBytes);
        } catch {
            return null; // Decryption failed — likely a rotated key
        }
    }, []);

    // ── Get all peer IDs that have completed key exchange ────────────────────
    const getPeerIds = useCallback((): string[] => {
        return Array.from(peersRef.current.keys());
    }, []);

    return {
        isReady,
        peerCount,
        joinTimestamp,
        encryptFileKeyForPeer,
        decryptFileKeyFromPeer,
        encryptChat,
        decryptChat,
        getPeerIds,
    };
}
