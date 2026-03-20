"use client";

import React, { memo } from 'react';
import { useUIStore } from '@/store/useUIStore';
import { SettingsModal } from '@/components/SettingsModal';
import { FriendRequestsModal } from '@/components/FriendRequestsModal';

export const RoomModals = memo(() => {
    const showSettings = useUIStore(s => s.showSettings);
    const setShowSettings = useUIStore(s => s.setShowSettings);
    const settingsTab = useUIStore(s => s.settingsTab);
    
    const showFriendsModal = useUIStore(s => s.showFriendsModal);
    const setShowFriendsModal = useUIStore(s => s.setShowFriendsModal);

    return (
        <>
            {/* Unified Settings Modal */}
            {showSettings && (
                <SettingsModal
                    onClose={() => setShowSettings(false)}
                    defaultTab={settingsTab}
                />
            )}

            {/* Friend Requests Modal */}
            {showFriendsModal && (
                <FriendRequestsModal onClose={() => setShowFriendsModal(false)} />
            )}
        </>
    );
});

RoomModals.displayName = 'RoomModals';
