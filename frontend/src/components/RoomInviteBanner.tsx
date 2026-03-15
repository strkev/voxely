"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFriendsStore } from '@/store/useFriendsStore';
import { X, LogIn } from 'lucide-react';

const AUTO_DISMISS_MS = 30_000;

export function RoomInviteBanner() {
    const { pendingInvitation, clearInvitation } = useFriendsStore();
    const [visible, setVisible] = useState(false);
    const router = useRouter();

    useEffect(() => {
        if (pendingInvitation) {
            const st = setTimeout(() => setVisible(true), 0);

            // Auto-dismiss after 30 seconds
            const timer = setTimeout(() => {
                setVisible(false);
                setTimeout(clearInvitation, 300); // Wait for exit animation
            }, AUTO_DISMISS_MS);

            return () => {
                clearTimeout(st);
                clearTimeout(timer);
            };
        } else {
            const t = setTimeout(() => setVisible(false), 0);
            return () => clearTimeout(t);
        }
    }, [pendingInvitation, clearInvitation]);

    if (!pendingInvitation) return null;

    const handleJoin = () => {
        router.push(`/room/${pendingInvitation.roomId}`);
        clearInvitation();
    };

    const handleDismiss = () => {
        setVisible(false);
        setTimeout(clearInvitation, 300);
    };

    return (
        <div
            className={`room-invite-banner ${visible ? 'room-invite-banner--visible' : ''}`}
            role="alert"
            aria-live="polite"
        >
            <div className="room-invite-banner__content">
                <div className="room-invite-banner__text">
                    <strong>{pendingInvitation.fromUserName}</strong> {pendingInvitation.participantCount && pendingInvitation.participantCount > 1 
                        ? `invited you (${pendingInvitation.participantCount} in room)` 
                        : "invited you to join"}
                </div>
                <div className="room-invite-banner__actions">
                    <button onClick={handleJoin} className="room-invite-banner__join">
                        <LogIn className="w-4 h-4" />
                        Join
                    </button>
                    <button onClick={handleDismiss} className="room-invite-banner__dismiss" aria-label="Dismiss">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
