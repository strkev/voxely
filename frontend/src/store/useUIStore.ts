import { create } from 'zustand';

export type SettingsTab = 'audio-video' | 'quality' | 'interface' | 'sounds' | 'profile' | 'account';

interface UIState {
    // Sidebar
    friendsSidebarOpen: boolean;
    setFriendsSidebarOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
    
    // Modals
    showFriendsModal: boolean;
    setShowFriendsModal: (show: boolean) => void;
    showSettings: boolean;
    setShowSettings: (show: boolean) => void;
    settingsTab: SettingsTab;
    setSettingsTab: (tab: SettingsTab) => void;
    
    // Chat
    isRoomOpen: boolean;
    setIsRoomOpen: (open: boolean) => void;
    chatOpen: boolean;
    setChatOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
    chatSidebarWidth: number;
    setChatSidebarWidth: (width: number) => void;
    unread: number;
    setUnread: (count: number | ((prev: number) => number)) => void;
}

export const useUIStore = create<UIState>((set) => ({
    friendsSidebarOpen: false,
    setFriendsSidebarOpen: (open) => set((state) => ({ 
        friendsSidebarOpen: typeof open === 'function' ? open(state.friendsSidebarOpen) : open 
    })),
    
    showFriendsModal: false,
    setShowFriendsModal: (show) => set({ showFriendsModal: show }),
    
    showSettings: false,
    setShowSettings: (show) => set({ showSettings: show }),
    
    settingsTab: 'audio-video',
    setSettingsTab: (tab) => set({ settingsTab: tab }),
    
    isRoomOpen: false,
    setIsRoomOpen: (open) => set({ isRoomOpen: open }),
    chatOpen: false,
    setChatOpen: (open) => set((state) => ({ 
        chatOpen: typeof open === 'function' ? open(state.chatOpen) : open 
    })),
    chatSidebarWidth: 320,
    setChatSidebarWidth: (width) => set({ chatSidebarWidth: width }),
    unread: 0,
    setUnread: (unread) => set((state) => ({
        unread: typeof unread === 'function' ? (unread as (prev: number) => number)(state.unread) : unread
    })),
}));
