"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

export interface ChatMessage {
    id: string;
    userId: string;
    name: string;
    text: string;
    timestamp: string;
    reactions?: Record<string, string[]>;
    encrypted?: boolean; // true if the message could not be decrypted
    fileTransfer?: {
        transferId: string;
        fileName: string;
        fileSize: number;
        blobUrl?: string;
        progress: number;
        status: 'sending' | 'receiving' | 'complete' | 'error';
        error?: string;
    };
}

interface UseChatSocketOptions {
    roomId: string;
    token: string | null;
    userName: string;
    onNewMessage?: (msg: ChatMessage) => void;
    // E2EE callbacks (optional)
    encryptChat?: (plaintext: string) => Promise<string | null>;
    decryptChat?: (ciphertext: string) => Promise<string | null>;
    joinTimestamp?: string; // hide messages before this timestamp
}

export interface TypingUser {
    userId: string;
    name: string;
}

interface UseChatSocketReturn {
    messages: ChatMessage[];
    sendMessage: (text: string) => void;
    sendTyping: (isTyping: boolean) => void;
    typingUsers: TypingUser[];
    connected: boolean;
    isRoomOpen: boolean;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// Minimum ms between sends — simple client-side rate limit
const SEND_THROTTLE_MS = 500;
const TYPING_THROTTLE_MS = 1000;

// Marker prefix to identify encrypted messages
const E2EE_PREFIX = 'E2EE:';

export function useChatSocket({ roomId, token, userName, onNewMessage, encryptChat, decryptChat, joinTimestamp }: UseChatSocketOptions): UseChatSocketReturn {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
    const [connected, setConnected] = useState(false);
    const [isRoomOpen, setIsRoomOpen] = useState(false);
    const socketRef = useRef<Socket | null>(null);
    const lastSentRef = useRef<number>(0);
    const lastTypingSentRef = useRef<number>(0);
    const typingTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});
    const onNewMessageRef = useRef(onNewMessage);
    const encryptChatRef = useRef(encryptChat);
    const decryptChatRef = useRef(decryptChat);
    const joinTimestampRef = useRef(joinTimestamp);

    useEffect(() => {
        onNewMessageRef.current = onNewMessage;
    }, [onNewMessage]);

    useEffect(() => {
        encryptChatRef.current = encryptChat;
    }, [encryptChat]);

    useEffect(() => {
        decryptChatRef.current = decryptChat;
    }, [decryptChat]);

    useEffect(() => {
        joinTimestampRef.current = joinTimestamp;
    }, [joinTimestamp]);

    // Decrypt a message text (if it's encrypted)
    const tryDecrypt = useCallback(async (text: string): Promise<{ text: string; encrypted: boolean }> => {
        if (!text.startsWith(E2EE_PREFIX)) {
            return { text, encrypted: false };
        }
        const ciphertext = text.slice(E2EE_PREFIX.length);
        const decrypt = decryptChatRef.current;
        if (!decrypt) {
            return { text: '🔒 Encrypted message', encrypted: true };
        }
        const plaintext = await decrypt(ciphertext);
        if (plaintext === null) {
            return { text: '🔒 Encrypted message', encrypted: true };
        }
        return { text: plaintext, encrypted: false };
    }, []);

    useEffect(() => {
        if (!token || !roomId) return;

        const socket = io(BACKEND_URL, {
            auth: { token },
            transports: ['websocket'],
            reconnectionAttempts: 5,
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            setConnected(true);
            socket.emit('chat:join', { roomId, name: userName });
        });

        socket.on('disconnect', () => {
            setConnected(false);
        });

        socket.on('connect_error', (err) => {
            console.warn('[chat] socket connect_error:', err.message);
            setConnected(false);
        });

        socket.on('chat:message', (msg: ChatMessage) => {
            // Decrypt incoming message
            tryDecrypt(msg.text).then(({ text, encrypted }) => {
                const decryptedMsg = { ...msg, text, encrypted };
                setMessages(prev => [...prev, decryptedMsg]);
                if (onNewMessageRef.current) {
                    onNewMessageRef.current(decryptedMsg);
                }
            });
            
            // If someone sends a message, they are no longer typing
            setTypingUsers(prev => prev.filter(u => u.userId !== msg.userId));
            if (typingTimeoutsRef.current[msg.userId]) {
                clearTimeout(typingTimeoutsRef.current[msg.userId]);
                delete typingTimeoutsRef.current[msg.userId];
            }
        });

        socket.on('chat:typing', ({ userId, name, isTyping }: { userId: string, name: string, isTyping: boolean }) => {
            if (isTyping) {
                setTypingUsers(prev => {
                    if (!prev.find(u => u.userId === userId)) {
                        return [...prev, { userId, name }];
                    }
                    return prev;
                });

                // Clear existing timeout if present
                if (typingTimeoutsRef.current[userId]) {
                    clearTimeout(typingTimeoutsRef.current[userId]);
                }

                // Auto-remove typing indicator after 3 seconds of inactivity
                typingTimeoutsRef.current[userId] = setTimeout(() => {
                    setTypingUsers(prev => prev.filter(u => u.userId !== userId));
                    delete typingTimeoutsRef.current[userId];
                }, 3000);
            } else {
                setTypingUsers(prev => prev.filter(u => u.userId !== userId));
                if (typingTimeoutsRef.current[userId]) {
                    clearTimeout(typingTimeoutsRef.current[userId]);
                    delete typingTimeoutsRef.current[userId];
                }
            }
        });


        socket.on('room:open-status', ({ isOpen }: { isOpen: boolean }) => {
            setIsRoomOpen(isOpen);
        });

        socket.on('chat:history', (history: ChatMessage[]) => {
            // Filter out messages from before the user joined (E2EE: can't decrypt old messages)
            const jt = joinTimestampRef.current;
            const filteredHistory = jt
                ? history.filter(m => new Date(m.timestamp).getTime() >= new Date(jt).getTime())
                : history;

            // Decrypt all history messages
            Promise.all(
                filteredHistory.map(async (m) => {
                    const { text, encrypted } = await tryDecrypt(m.text);
                    return { ...m, text, encrypted };
                })
            ).then(decryptedHistory => {
                setMessages(decryptedHistory);
            });
        });

        return () => {
            // Clear all typing timeouts on unmount
            Object.values(typingTimeoutsRef.current).forEach(clearTimeout);
            typingTimeoutsRef.current = {};

            if (socket.connected) {
                socket.emit('chat:leave', { roomId });
            }
            socket.disconnect();
            socketRef.current = null;
            setMessages([]);
            setTypingUsers([]);
            setConnected(false);
        };
    }, [roomId, token, userName, tryDecrypt]);

    const sendMessage = useCallback((text: string) => {
        const socket = socketRef.current;
        if (!socket || !socket.connected) return;

        const now = Date.now();
        if (now - lastSentRef.current < SEND_THROTTLE_MS) return;
        lastSentRef.current = now;

        const trimmed = text.trim().slice(0, 500);
        if (!trimmed) return;

        // Encrypt the message if E2EE is available
        const encrypt = encryptChatRef.current;
        if (encrypt) {
            encrypt(trimmed).then(ciphertext => {
                if (ciphertext) {
                    socket.emit('chat:message', { roomId, text: E2EE_PREFIX + ciphertext });
                } else {
                    // Fallback: send plaintext if encryption fails
                    socket.emit('chat:message', { roomId, text: trimmed });
                }
            });
        } else {
            socket.emit('chat:message', { roomId, text: trimmed });
        }
    }, [roomId]);

    const sendTyping = useCallback((isTyping: boolean) => {
        const socket = socketRef.current;
        if (!socket || !socket.connected) return;

        const now = Date.now();
        // Throttle typing events, but always let 'false' pass immediately
        if (isTyping && now - lastTypingSentRef.current < TYPING_THROTTLE_MS) return;
        
        if (isTyping) {
            lastTypingSentRef.current = now;
        }

        socket.emit('chat:typing', { roomId, isTyping });
    }, [roomId]);


    return { messages, sendMessage, sendTyping, typingUsers, connected, isRoomOpen };
}
