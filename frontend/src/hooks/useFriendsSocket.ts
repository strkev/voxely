"use client";

import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useFriendsStore, UserStatus, RoomInvitation, Friend, FriendRequestIncoming, OpenRoom, IncomingCall } from '@/store/useFriendsStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { useUIStore } from '@/store/useUIStore';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Connects to the backend Socket.IO server for friend-related events.
 *
 * Listens for:
 * - `friend:online`            – a friend came online (with status)
 * - `friend:offline`           – a friend went offline
 * - `friend:online-list`       – initial list of online friends on connect (with statuses)
 * - `friend:status-changed`    – a friend changed their status
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
        setUserStatus,
        setMyStatus,
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

        // 1. Initial data fetch: Do this immediately if we have a token,
        // so the list appears even if the socket is still connecting.
        fetchFriends(token);
        fetchRequests(token);

        const socket = io(BACKEND_URL, {
            auth: { token },
            transports: ['websocket'],
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 10000,
        });

        socketRef.current = socket;

        // 2. Re-fetch data on reconnect to ensure sync
        socket.io.on('reconnect', () => {
            fetchFriends(token);
            fetchRequests(token);
            // Request fresh presence data from server after reconnect
            socket.emit('presence:request-sync');
        });

        socket.on('friend:online-list', ({ users }: { users: { id: string; status: string }[] }) => {
            setOnlineList(users);
        });

        socket.on('friend:online', ({ userId, status }: { userId: string; status?: string }) => {
            setUserOnline(userId, (status as UserStatus) ?? 'online');
        });

        socket.on('friend:offline', ({ userId }: { userId: string }) => {
            setUserOffline(userId);
        });

        socket.on('friend:status-changed', ({ userId, status }: { userId: string; status: string }) => {
            // Check if this is our own status update
            const myUserId = useAuthStore.getState().user?.id;
            if (userId === myUserId) {
                setMyStatus(status as UserStatus);
            } else {
                setUserStatus(userId, status as UserStatus);
            }
        });

        socket.on('friend:invite-received', (data: Omit<RoomInvitation, 'receivedAt'>) => {
            setInvitation({ ...data, receivedAt: Date.now() });
        });

        socket.on('friend:open-rooms-list', (rooms: OpenRoom[]) => {
            setOpenRooms(rooms);
        });

        socket.on('room:open-status', ({ isOpen }: { isOpen: boolean }) => {
            useUIStore.getState().setIsRoomOpen(isOpen);
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

        // Periodic presence sync heartbeat (every 30s)
        // Ensures presence data stays fresh even if events were missed
        const presenceInterval = setInterval(() => {
            if (socket.connected) {
                socket.emit('presence:request-sync');
            }
        }, 30_000);

        return () => {
            clearInterval(presenceInterval);
            socket.disconnect();
            socketRef.current = null;
        };
    }, [token, setOnlineList, setUserOnline, setUserOffline, setUserStatus, setMyStatus, setInvitation, setOpenRooms, addIncomingRequest, removeIncomingRequest, removeOutgoingRequest, addFriend, removeFriendById, updateFriendProfile, fetchFriends, fetchRequests, setIncomingCall, clearIncomingCall, setOutgoingCall, clearOutgoingCall, router]);

    const sendRoomInvite = useCallback((friendId: string, roomId: string, roomName: string) => {
        if (!socketRef.current) return;
        socketRef.current.emit('friend:invite', { friendId, roomId, roomName });
    }, []);

    const toggleRoomOpen = useCallback((roomId: string, isOpen: boolean, roomName: string) => {
        if (!socketRef.current) return;
        socketRef.current.emit('room:set-open', { roomId, isOpen, roomName });
    }, []);

    const joinRoomSocket = useCallback((roomId: string, name: string) => {
        if (!socketRef.current) return;
        socketRef.current.emit('chat:join', { roomId, name });
    }, []);

    const leaveRoomSocket = useCallback((roomId: string) => {
        if (!socketRef.current) return;
        socketRef.current.emit('chat:leave', { roomId });
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

    const setStatus = useCallback((status: UserStatus) => {
        if (!socketRef.current) return;
        socketRef.current.emit('presence:set-status', { status });
    }, []);

    return {
        sendRoomInvite,
        toggleRoomOpen,
        joinRoomSocket,
        leaveRoomSocket,
        initiateCall,
        respondToCall,
        terminateCall,
        setStatus
    };
}
