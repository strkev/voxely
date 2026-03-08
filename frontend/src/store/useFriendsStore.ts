import { create } from 'zustand';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

export interface Friend {
    id: string;
    name: string;
    avatarColor: string;
}

export interface FriendRequestIncoming {
    id: string;
    senderId: string;
    sender: { id: string; name: string; avatarColor: string };
    createdAt: string;
}

export interface FriendRequestOutgoing {
    id: string;
    receiverId: string;
    receiver: { id: string; name: string; avatarColor: string };
    createdAt: string;
}

export interface RoomInvitation {
    fromUserId: string;
    fromUserName: string;
    roomId: string;
    roomName: string;
    receivedAt: number;
}

export interface OpenRoom {
    roomId: string;
    roomName: string;
    participants: string[]; // array of friendIds in this room
    totalParticipantCount: number; // total users in room (including non-friends)
}

interface FriendsState {
    friends: Friend[];
    onlineUserIds: Set<string>;
    incomingRequests: FriendRequestIncoming[];
    outgoingRequests: FriendRequestOutgoing[];
    pendingInvitation: RoomInvitation | null;
    openRooms: OpenRoom[];

    // Data fetching
    fetchFriends: (token: string) => Promise<void>;
    fetchRequests: (token: string) => Promise<void>;

    // Friend request actions
    sendRequest: (token: string, name: string) => Promise<{ error?: string }>;
    acceptRequest: (token: string, requestId: string) => Promise<{ error?: string }>;
    declineRequest: (token: string, requestId: string) => Promise<{ error?: string }>;

    // Friend management
    removeFriend: (token: string, friendId: string) => Promise<{ error?: string }>;

    // Online presence (called by socket hook)
    setOnlineList: (userIds: string[]) => void;
    setUserOnline: (userId: string) => void;
    setUserOffline: (userId: string) => void;

    // Room invitations (called by socket hook)
    setInvitation: (invitation: RoomInvitation) => void;
    clearInvitation: () => void;

    // Open Rooms
    setOpenRooms: (rooms: OpenRoom[]) => void;

    // Add a new incoming request (from socket event)
    addIncomingRequest: (request: FriendRequestIncoming) => void;

    // Real-time sync actions (from socket events)
    removeIncomingRequest: (requestId: string) => void;
    removeOutgoingRequest: (requestId: string) => void;
    addFriend: (friend: Friend) => void;
    removeFriendById: (friendId: string) => void;
    updateFriendProfile: (friendId: string, data: Partial<Friend>) => void;
}

export const useFriendsStore = create<FriendsState>()((set, get) => ({
    friends: [],
    onlineUserIds: new Set<string>(),
    incomingRequests: [],
    outgoingRequests: [],
    pendingInvitation: null,
    openRooms: [],

    fetchFriends: async (token) => {
        try {
            const res = await fetch(`${API_URL}/api/friends`, {
                credentials: 'include',
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (res.ok) {
                const data = await res.json();
                set({ friends: data.friends ?? [] });
            }
        } catch (err) {
            console.error('Failed to fetch friends:', err);
        }
    },

    fetchRequests: async (token) => {
        try {
            const res = await fetch(`${API_URL}/api/friends/requests`, {
                credentials: 'include',
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (res.ok) {
                const data = await res.json();
                set({
                    incomingRequests: data.incoming ?? [],
                    outgoingRequests: data.outgoing ?? [],
                });
            }
        } catch (err) {
            console.error('Failed to fetch friend requests:', err);
        }
    },

    sendRequest: async (token, name) => {
        try {
            const res = await fetch(`${API_URL}/api/friends/request`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ name }),
            });
            const data = await res.json();
            if (!res.ok) return { error: data.error ?? 'Failed to send request' };

            // Refresh outgoing requests
            await get().fetchRequests(token);
            return {};
        } catch (err) {
            console.error('Failed to send friend request:', err);
            return { error: 'Network error' };
        }
    },

    acceptRequest: async (token, requestId) => {
        try {
            const res = await fetch(`${API_URL}/api/friends/requests/${requestId}/accept`, {
                method: 'POST',
                credentials: 'include',
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            const data = await res.json();
            if (!res.ok) return { error: data.error ?? 'Failed to accept request' };

            // Refresh both friends and requests
            await Promise.all([
                get().fetchFriends(token),
                get().fetchRequests(token),
            ]);
            return {};
        } catch (err) {
            console.error('Failed to accept friend request:', err);
            return { error: 'Network error' };
        }
    },

    declineRequest: async (token, requestId) => {
        try {
            const res = await fetch(`${API_URL}/api/friends/requests/${requestId}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (!res.ok) {
                const data = await res.json();
                return { error: data.error ?? 'Failed to decline request' };
            }

            // Refresh requests
            await get().fetchRequests(token);
            return {};
        } catch (err) {
            console.error('Failed to decline friend request:', err);
            return { error: 'Network error' };
        }
    },

    removeFriend: async (token, friendId) => {
        try {
            const res = await fetch(`${API_URL}/api/friends/${friendId}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (!res.ok) {
                const data = await res.json();
                return { error: data.error ?? 'Failed to remove friend' };
            }

            // Refresh friends list
            await get().fetchFriends(token);
            return {};
        } catch (err) {
            console.error('Failed to remove friend:', err);
            return { error: 'Network error' };
        }
    },

    setOnlineList: (userIds) => set({ onlineUserIds: new Set(userIds) }),
    setUserOnline: (userId) =>
        set((state) => {
            const next = new Set(state.onlineUserIds);
            next.add(userId);
            return { onlineUserIds: next };
        }),
    setUserOffline: (userId) =>
        set((state) => {
            const next = new Set(state.onlineUserIds);
            next.delete(userId);
            return { onlineUserIds: next };
        }),

    setInvitation: (invitation) => set({ pendingInvitation: invitation }),
    clearInvitation: () => set({ pendingInvitation: null }),

    setOpenRooms: (rooms) => set({ openRooms: rooms }),

    addIncomingRequest: (request) =>
        set((state) => ({
            incomingRequests: [request, ...state.incomingRequests],
        })),

    removeIncomingRequest: (requestId) =>
        set((state) => ({
            incomingRequests: state.incomingRequests.filter(r => r.id !== requestId),
        })),

    removeOutgoingRequest: (requestId) =>
        set((state) => ({
            outgoingRequests: state.outgoingRequests.filter(r => r.id !== requestId),
        })),

    addFriend: (friend) =>
        set((state) => ({
            friends: [friend, ...state.friends],
        })),

    removeFriendById: (friendId) =>
        set((state) => ({
            friends: state.friends.filter(f => f.id !== friendId),
            onlineUserIds: (() => {
                const next = new Set(state.onlineUserIds);
                next.delete(friendId);
                return next;
            })(),
        })),

    updateFriendProfile: (friendId, data) =>
        set((state) => ({
            friends: state.friends.map(f =>
                f.id === friendId ? { ...f, ...data } : f
            ),
        })),
}));
