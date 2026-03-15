"use client";

import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useFriendsStore, RoomInvitation, Friend, FriendRequestIncoming, OpenRoom, IncomingCall } from '@/store/useFriendsStore';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';

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
 * - `call:incoming`            - a friend is calling you
 * - `call:accepted`            - your call was accepted
 * - `call:rejected`            - your call was rejected
 * - `call:terminated`          - a call was terminated
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
        setOpenRooms,
        addIncomingRequest,
        removeIncomingRequest,
        removeOutgoingRequest,
        addFriend,
        removeFriendById,
        updateFriendProfile,
        fetchFriends,
        fetchRequests,
        setIncomingCall,
        clearIncomingCall,
        setOutgoingCall,
        clearOutgoingCall,
    } = useFriendsStore();
    const router = useRouter();

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

        // Re-fetch data on reconnect
        socket.io.on('reconnect', () => {
            fetchFriends(token);
            fetchRequests(token);
        });

        socket.on('friend:online-list', ({ userIds }: { userIds: string[] }) => {
            setOnlineList(userIds);
        });

        socket.on('friend:online', ({ userId }: { userId: string }) => {
            setUserOnline(userId);
        });

        socket.on('friend:offline', ({ userId }: { userId: string }) => {
            setUserOffline(userId);
        });

        socket.on('friend:invite-received', (data: Omit<RoomInvitation, 'receivedAt'>) => {
            setInvitation({ ...data, receivedAt: Date.now() });
        });

        socket.on('friend:open-rooms-list', (rooms: OpenRoom[]) => {
            setOpenRooms(rooms);
        });

        socket.on('friend:request-received', (data: FriendRequestIncoming) => {
            addIncomingRequest(data);
        });

        socket.on('friend:request-accepted', (data: { requestId: string; friend: Friend }) => {
            removeOutgoingRequest(data.requestId);
            addFriend(data.friend);
        });

        socket.on('friend:request-declined', ({ requestId }: { requestId: string }) => {
            removeIncomingRequest(requestId);
            removeOutgoingRequest(requestId);
        });

        socket.on('friend:removed', ({ userId }: { userId: string }) => {
            removeFriendById(userId);
        });

        socket.on('friend:profile-updated', (data: { userId: string } & Partial<Friend>) => {
            const { userId, ...updates } = data;
            updateFriendProfile(userId, updates);
        });

        // --- Direct Call Events ---
        socket.on('call:incoming', (call: IncomingCall) => {
            setIncomingCall(call);
        });

        socket.on('call:accepted', ({ roomId }: { roomId: string }) => {
            clearIncomingCall();
            clearOutgoingCall();
            router.push(`/room/${roomId}`);
        });

        socket.on('call:rejected', ({ fromUserId }: { fromUserId: string }) => {
            clearOutgoingCall();
            const friend = useFriendsStore.getState().friends.find(f => f.id === fromUserId);
            toast.error(`${friend?.name || 'User'} declined the call.`);
        });

        socket.on('call:terminated', ({ fromUserId }: { fromUserId: string }) => {
            clearIncomingCall();
            const friend = useFriendsStore.getState().friends.find(f => f.id === fromUserId);
            toast(`${friend?.name || 'User'} ended the call.`);
        });

        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, [token, setOnlineList, setUserOnline, setUserOffline, setInvitation, setOpenRooms, addIncomingRequest, removeIncomingRequest, removeOutgoingRequest, addFriend, removeFriendById, updateFriendProfile, fetchFriends, fetchRequests, setIncomingCall, clearIncomingCall, setOutgoingCall, clearOutgoingCall, router]);

    const sendRoomInvite = useCallback((friendId: string, roomId: string, roomName: string) => {
        if (!socketRef.current) return;
        socketRef.current.emit('friend:invite', { friendId, roomId, roomName });
    }, []);

    const toggleRoomOpen = useCallback((roomId: string, isOpen: boolean, roomName: string) => {
        if (!socketRef.current) return;
        socketRef.current.emit('room:set-open', { roomId, isOpen, roomName });
    }, []);

    const initiateCall = useCallback((friendId: string) => {
        if (!socketRef.current) return;
        setOutgoingCall({ recipientId: friendId, roomId: null });
        socketRef.current.emit('call:initiate', { friendId });
    }, [setOutgoingCall]);

    const respondToCall = useCallback((callerId: string, accepted: boolean) => {
        if (!socketRef.current) return;
        socketRef.current.emit('call:response', { callerId, accepted });
        if (!accepted) clearIncomingCall();
    }, [clearIncomingCall]);

    const terminateCall = useCallback((friendId: string) => {
        if (!socketRef.current) return;
        socketRef.current.emit('call:terminate', { friendId });
        clearOutgoingCall();
        clearIncomingCall();
    }, [clearOutgoingCall, clearIncomingCall]);

    return {
        sendRoomInvite,
        toggleRoomOpen,
        initiateCall,
        respondToCall,
        terminateCall
    };
}
