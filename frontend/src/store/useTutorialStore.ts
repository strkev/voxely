import { create } from 'zustand';

export interface TutorialStep {
    targetSelector: string;
    message: string;
    state: 'waving' | 'typing' | 'locking' | 'friends' | 'happy' | 'support';
    title: string;
}

interface TutorialState {
    isActive: boolean;
    currentStep: number;
    steps: TutorialStep[];
    startTutorial: () => void;
    nextStep: () => void;
    prevStep: () => void;
    endTutorial: () => void;
}

const DASHBOARD_STEPS: TutorialStep[] = [
    {
        targetSelector: '[data-tutorial="mascot-welcome"]',
        title: "Welcome!",
        message: "Hi! I'm Voxy. Let me show you around!",
        state: 'waving'
    },
    {
        targetSelector: '[data-tutorial="friends-sidebar"]',
        title: "Friends",
        message: "See your friends, their status, and call them directly.",
        state: 'happy'
    },
    {
        targetSelector: '[data-tutorial="create-room"]',
        title: "Create Space",
        message: "Start your own private, encrypted conversation here.",
        state: 'typing'
    },
    {
        targetSelector: '[data-tutorial="join-room-section"]',
        title: "Join Space",
        message: "Have a code? Enter it here to join a room instantly.",
        state: 'locking'
    },
    {
        targetSelector: '[data-tutorial="open-rooms-section"]',
        title: "Active Rooms",
        message: "Join rooms your friends have already opened.",
        state: 'friends'
    },
    {
        targetSelector: '[data-tutorial="user-dropdown"]',
        title: "Your Account",
        message: "Manage your profile, avatar, and app settings.",
        state: 'waving'
    },
    {
        targetSelector: '[data-tutorial="mascot-welcome"]',
        title: "All set!",
        message: "You're ready to explore. Have fun chatting!",
        state: 'support'
    }
];

export const useTutorialStore = create<TutorialState>((set) => ({
    isActive: false,
    currentStep: 0,
    steps: DASHBOARD_STEPS,
    startTutorial: () => set({ isActive: true, currentStep: 0 }),
    nextStep: () => set((state) => ({
        currentStep: Math.min(state.currentStep + 1, state.steps.length - 1)
    })),
    prevStep: () => set((state) => ({
        currentStep: Math.max(state.currentStep - 1, 0)
    })),
    endTutorial: () => set({ isActive: false, currentStep: 0 }),
}));
