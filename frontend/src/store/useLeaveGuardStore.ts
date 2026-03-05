"use client";

import { create } from 'zustand';

/**
 * Global store for room leave confirmation.
 * Used by both the room page (to show the styled modal) and the Header
 * (to trigger leave confirmation when the user clicks navigation links).
 */
interface LeaveGuardState {
    /** Whether the user is currently in a room and leave guard is active */
    active: boolean;
    /** The target URL to navigate to after user confirms leaving */
    pendingTarget: string | null;
    /** Activate the guard (called when entering a room) */
    activate: () => void;
    /** Deactivate the guard (called when leaving a room) */
    deactivate: () => void;
    /** Request navigation — if guard is active, stores the target for confirmation */
    requestLeave: (target: string) => void;
    /** Cancel the pending leave (user clicked "Stay") */
    cancelLeave: () => void;
    /** Confirm the pending leave (user clicked "Leave") — returns the target URL */
    confirmLeave: () => string | null;
}

export const useLeaveGuardStore = create<LeaveGuardState>()((set, get) => ({
    active: false,
    pendingTarget: null,

    activate: () => set({ active: true, pendingTarget: null }),
    deactivate: () => set({ active: false, pendingTarget: null }),

    requestLeave: (target: string) => {
        if (get().active) {
            set({ pendingTarget: target });
        }
    },

    cancelLeave: () => set({ pendingTarget: null }),

    confirmLeave: () => {
        const target = get().pendingTarget;
        set({ pendingTarget: null, active: false });
        return target;
    },
}));
