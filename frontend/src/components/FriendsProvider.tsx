"use client";

import React, { createContext, useContext, ReactNode } from 'react';
import { useFriendsSocket } from '@/hooks/useFriendsSocket';
import { useAuthStore } from '@/store/useAuthStore';

interface FriendsContextType {
    sendRoomInvite: (friendId: string, roomId: string, roomName: string) => void;
    toggleRoomOpen: (roomId: string, isOpen: boolean, roomName: string) => void;
    initiateCall: (friendId: string) => void;
    respondToCall: (callerId: string, accepted: boolean) => void;
    terminateCall: (friendId: string) => void;
}

const FriendsContext = createContext<FriendsContextType | undefined>(undefined);

export function FriendsProvider({ children }: { children: ReactNode }) {
    const { token } = useAuthStore();
    const socketActions = useFriendsSocket(token);

    return (
        <FriendsContext.Provider value={socketActions}>
            {children}
        </FriendsContext.Provider>
    );
}

export function useFriends() {
    const context = useContext(FriendsContext);
    if (context === undefined) {
        throw new Error('useFriends must be used within a FriendsProvider');
    }
    return context;
}
