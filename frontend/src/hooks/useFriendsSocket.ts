"use client";

import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useFriendsStore, RoomInvitation, Friend } from '@/store/useFriendsStore';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Connects to the backend Socket.IO server for friend-related events.
 *
 * Listens for:
 * - `friend:online`            – a friend came online
 * - `friend:offline`           – a friend went offline
 * - `friend:online-list`       – initial list of online friends on connect
 * - `friend:invite-received`   – room invitation from a friend
 * - `friend:request-received`  – new incoming friend request
 * - `friend:request-accepted`  – your outgoing request was accepted
 * - `friend:request-declined`  – your request was declined / other party cancelled
 * - `friend:removed`           – a friend removed you
 *
 * This hook should be mounted ONCE at the app/layout level or on pages where
 * the friend sidebar is visible (dashboard, room).
 */
export function useFriendsSocket(token: string | null) {
    const socketRef = useRef<Socket | null>(null);
    const {
        setOnlineList,
        setUserOnline,
        setUserOffline,
        setInvitation,
        addIncomingRequest,
        removeIncomingRequest,
        removeOutgoingRequest,
        addFriend,
        removeFriendById,
        fetchFriends,
        fetchRequests,
    } = useFriendsStore();

    useEffect(() => {
        if (!token) return;

        const socket = io(BACKEND_URL, {
            auth: { token },
            transports: ['websocket'],
            reconnectionAttempts: 5,
        });

        socketRef.current = socket;

        // Initial data fetch on connect
        socket.on('connect', () => {
            fetchFriends(token);
            fetchRequests(token);
        });

        // Re-fetch data on reconnect to ensure nothing was missed
        socket.io.on('reconnect', () => {
            fetchFriends(token);
            fetchRequests(token);
        });

        // Online presence events
        socket.on('friend:online-list', ({ userIds }: { userIds: string[] }) => {
            setOnlineList(userIds);
        });

        socket.on('friend:online', ({ userId }: { userId: string }) => {
            setUserOnline(userId);
        });

        socket.on('friend:offline', ({ userId }: { userId: string }) => {
            setUserOffline(userId);
        });

        // Room invitation
        socket.on('friend:invite-received', (data: Omit<RoomInvitation, 'receivedAt'>) => {
            setInvitation({ ...data, receivedAt: Date.now() });
        });

        // New incoming friend request
        socket.on('friend:request-received', (data: {
            id: string;
            senderId: string;
            sender: { id: string; name: string };
            createdAt: string;
        }) => {
            addIncomingRequest(data);
        });

        // Your outgoing request was accepted → add new friend, remove outgoing request
        socket.on('friend:request-accepted', (data: {
            requestId: string;
            friend: Friend;
        }) => {
            removeOutgoingRequest(data.requestId);
            addFriend(data.friend);
        });

        // Request declined / cancelled by other party
        socket.on('friend:request-declined', ({ requestId }: { requestId: string }) => {
            removeIncomingRequest(requestId);
            removeOutgoingRequest(requestId);
        });

        // You were removed as a friend
        socket.on('friend:removed', ({ userId }: { userId: string }) => {
            removeFriendById(userId);
        });

        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, [token, setOnlineList, setUserOnline, setUserOffline, setInvitation, addIncomingRequest, removeIncomingRequest, removeOutgoingRequest, addFriend, removeFriendById, fetchFriends, fetchRequests]);

    return socketRef;
}
