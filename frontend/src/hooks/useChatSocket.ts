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
}

interface UseChatSocketOptions {
    roomId: string;
    token: string | null;
    userName: string;
    userId: string;
    onNewMessage?: (msg: ChatMessage) => void;
}

export interface TypingUser {
    userId: string;
    name: string;
}

interface UseChatSocketReturn {
    messages: ChatMessage[];
    sendMessage: (text: string) => void;
    sendTyping: (isTyping: boolean) => void;
    sendReaction: (messageId: string, emoji: string) => void;
    typingUsers: TypingUser[];
    connected: boolean;
    isRoomOpen: boolean;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// Minimum ms between sends — simple client-side rate limit
const SEND_THROTTLE_MS = 500;
const TYPING_THROTTLE_MS = 1000;

export function useChatSocket({ roomId, token, userName, userId, onNewMessage }: UseChatSocketOptions): UseChatSocketReturn {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
    const [connected, setConnected] = useState(false);
    const [isRoomOpen, setIsRoomOpen] = useState(false);
    const socketRef = useRef<Socket | null>(null);
    const lastSentRef = useRef<number>(0);
    const lastTypingSentRef = useRef<number>(0);
    const typingTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});
    const onNewMessageRef = useRef(onNewMessage);

    useEffect(() => {
        onNewMessageRef.current = onNewMessage;
    }, [onNewMessage]);

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
            setMessages(prev => [...prev, msg]);
            if (onNewMessageRef.current) {
                onNewMessageRef.current(msg);
            }
            
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

        socket.on('chat:react', ({ messageId, reactions }: { messageId: string; reactions: Record<string, string[]> }) => {
            setMessages(prev => prev.map(m => {
                if (m.id === messageId) {
                    return { ...m, reactions };
                }
                return m;
            }));
        });

        socket.on('room:open-status', ({ isOpen }: { isOpen: boolean }) => {
            setIsRoomOpen(isOpen);
        });

        socket.on('chat:history', (history: ChatMessage[]) => {
            setMessages(history);
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
    }, [roomId, token, userName]);

    const sendMessage = useCallback((text: string) => {
        const socket = socketRef.current;
        if (!socket || !socket.connected) return;

        const now = Date.now();
        if (now - lastSentRef.current < SEND_THROTTLE_MS) return;
        lastSentRef.current = now;

        const trimmed = text.trim().slice(0, 500);
        if (!trimmed) return;

        socket.emit('chat:message', { roomId, text: trimmed });
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

    const sendReaction = useCallback((messageId: string, emoji: string) => {
        const socket = socketRef.current;
        if (!socket || !socket.connected) return;
        
        // Optimistic UI update
        setMessages(prev => prev.map(m => {
            if (m.id === messageId) {
                const newReactions = { ...m.reactions };
                if (!newReactions[emoji]) newReactions[emoji] = [];
                
                const userIndex = newReactions[emoji].indexOf(userId);
                if (userIndex > -1) {
                    // Remove reaction
                    newReactions[emoji] = newReactions[emoji].filter(id => id !== userId);
                    if (newReactions[emoji].length === 0) delete newReactions[emoji];
                } else {
                    // Add reaction
                    newReactions[emoji] = [...newReactions[emoji], userId];
                }
                return { ...m, reactions: newReactions };
            }
            return m;
        }));

        socket.emit('chat:react', { roomId, messageId, emoji });
    }, [roomId, userId]);

    return { messages, sendMessage, sendTyping, sendReaction, typingUsers, connected, isRoomOpen };
}
