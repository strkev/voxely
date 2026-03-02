"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

export interface ChatMessage {
    id: string;
    userId: string;
    name: string;
    text: string;
    timestamp: string;
}

interface UseChatSocketOptions {
    roomId: string;
    token: string | null;
    userName: string;
}

interface UseChatSocketReturn {
    messages: ChatMessage[];
    sendMessage: (text: string) => void;
    connected: boolean;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// Minimum ms between sends — simple client-side rate limit
const SEND_THROTTLE_MS = 500;

export function useChatSocket({ roomId, token, userName }: UseChatSocketOptions): UseChatSocketReturn {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [connected, setConnected] = useState(false);
    const socketRef = useRef<Socket | null>(null);
    const lastSentRef = useRef<number>(0);

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
        });

        socket.on('chat:history', (history: ChatMessage[]) => {
            setMessages(history);
        });

        return () => {
            socket.emit('chat:leave', { roomId });
            socket.disconnect();
            socketRef.current = null;
            setMessages([]);
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

    return { messages, sendMessage, connected };
}
