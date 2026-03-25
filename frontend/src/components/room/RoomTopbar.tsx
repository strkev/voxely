"use client";

import React, { useCallback, useEffect, type MutableRefObject } from 'react';
import { Users, Check, Link2, Unlock, Lock, LogOut, ImageIcon } from 'lucide-react';
import { useLocalParticipant } from '@livekit/components-react';
import { ChatSidebar } from '@/components/ChatSidebar';
import { ChatMessage, TypingUser } from '@/hooks/useChatSocket';
import { useFileTransfer } from '@/hooks/useFileTransfer';
import { useE2EEKeyManager } from '@/hooks/useE2EEKeyManager';
import { User } from '@/store/useAuthStore';
import { FriendRequestIncoming } from '@/store/useFriendsStore';

import { useUIStore } from '@/store/useUIStore';

interface RoomTopbarProps {
    roomId: string;
    user: User | null;
    incomingRequests: FriendRequestIncoming[];
    handleCopyLink: () => void;
    copied: boolean;
    handleToggleOpenRoom: (open: boolean) => void;
    isCompact: boolean;
    messages: ChatMessage[];
    typingUsers: TypingUser[];
    sendMessage: (text: string) => void;
    sendTyping: (isTyping: boolean) => void;
    onReact: (messageId: string, emoji: string) => void;
    chatConnected: boolean;
    isDark: boolean;
    requestLeave: (target: string) => void;
    // E2EE callback refs — populated by this component once ECDH keys are ready
    encryptChatRef?: MutableRefObject<((plaintext: string) => Promise<string | null>) | undefined>;
    decryptChatRef?: MutableRefObject<((ciphertext: string) => Promise<string | null>) | undefined>;
    onIncomingFileTransfer?: (fileName: string, senderName: string) => void;
}

function LocalCameraAwareQuickAction({ onOpenSettings }: { onOpenSettings: () => void }) {
    const { isCameraEnabled } = useLocalParticipant();

    if (!isCameraEnabled) return null;

    return (
        <button
            onClick={onOpenSettings}
            className="shrink-0 flex items-center justify-center h-[42px] w-[42px] rounded-2xl text-sm font-medium transition-all duration-150 backdrop-blur-md shadow-sm border bg-white/90 hover:bg-white text-text-main hover:text-primary border-[rgba(220,220,220,0.85)] hover:border-primary/40 leading-none"
            title="Update Background"
        >
            <ImageIcon className="w-4 h-4" />
        </button>
    );
}

export function RoomTopbar({
    roomId,
    user,
    incomingRequests,
    handleCopyLink,
    copied,
    handleToggleOpenRoom,
    isCompact,
    messages,
    typingUsers,
    sendMessage,
    sendTyping,
    onReact,
    chatConnected,
    isDark,
    requestLeave,
    encryptChatRef,
    decryptChatRef,
    onIncomingFileTransfer,
}: RoomTopbarProps) {
    const setFriendsSidebarOpen = useUIStore(s => s.setFriendsSidebarOpen);
    const setShowSettings = useUIStore(s => s.setShowSettings);
    const setSettingsTab = useUIStore(s => s.setSettingsTab);
    const chatOpen = useUIStore(s => s.chatOpen);
    const setChatOpen = useUIStore(s => s.setChatOpen);
    const unread = useUIStore(s => s.unread);
    const setUnread = useUIStore(s => s.setUnread);
    const chatSidebarWidth = useUIStore(s => s.chatSidebarWidth);
    const setChatSidebarWidth = useUIStore(s => s.setChatSidebarWidth);
    const isRoomOpen = useUIStore(s => s.isRoomOpen);

    const handleRead = React.useCallback(() => {
        if (unread > 0) setUnread(0);
    }, [unread, setUnread]);

    // E2EE key manager (ECDH key exchange via dedicated data channel)
    const e2ee = useE2EEKeyManager(user?.id ?? '');

    // Populate the parent's E2EE refs once the key manager is ready
    useEffect(() => {
        if (encryptChatRef) encryptChatRef.current = e2ee.encryptChat;
        if (decryptChatRef) decryptChatRef.current = e2ee.decryptChat;
    }, [e2ee.encryptChat, e2ee.decryptChat, encryptChatRef, decryptChatRef]);

    // File transfer via LiveKit data channel (hook needs to be inside LiveKitRoom)
    const { transfers, sendFile, maxFileSize } = useFileTransfer({
        e2ee: {
            encryptFileKeyForPeer: e2ee.encryptFileKeyForPeer,
            decryptFileKeyFromPeer: e2ee.decryptFileKeyFromPeer,
            getPeerIds: e2ee.getPeerIds,
        },
        onIncomingTransfer: (t) => {
            if (onIncomingFileTransfer) onIncomingFileTransfer(t.fileName, t.senderName);
        }
    });

    const handleSendFile = useCallback((file: File) => {
        sendFile(file, user?.name ?? 'Anonymous', user?.id ?? '');
    }, [sendFile, user?.name, user?.id]);

    return (
        <div className="absolute top-4 left-0 right-0 z-40 flex items-center px-3 sm:px-4 gap-2 sm:gap-3 overflow-visible py-2 -my-2 flex-wrap sm:flex-nowrap">
            {/* Friends toggle button */}
            <button
                onClick={() => setFriendsSidebarOpen(o => !o)}
                aria-label="Friends"
                className="shrink-0 flex items-center bg-white/90 hover:bg-white backdrop-blur-md border border-[rgba(220,220,220,0.85)] hover:border-primary/40 rounded-2xl px-3 py-2.5 sm:px-4 sm:py-2.5 text-sm font-medium text-text-main hover:text-primary transition-all duration-150 shadow-sm"
            >
                <div className="relative flex items-center justify-center">
                    <Users className="w-4 h-4" />
                    {incomingRequests.length > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white border border-white/90 sm:border-white shadow-sm pointer-events-none">
                            {incomingRequests.length > 9 ? '9+' : incomingRequests.length}
                        </span>
                    )}
                </div>
                <span className={`topbar-btn-inner ${isCompact ? 'topbar-btn-inner--compact' : ''}`}>Friends</span>
            </button>

            {/* Copy link button */}
            <button
                onClick={handleCopyLink}
                aria-label="Copy room link"
                className={`shrink-0 flex items-center backdrop-blur-md border rounded-2xl px-3 py-2.5 sm:px-4 sm:py-2.5 text-sm font-medium transition-all duration-150 shadow-sm ${
                    copied 
                        ? 'bg-green-50 border-green-200 text-green-600'
                        : 'bg-white/90 hover:bg-white border-[rgba(220,220,220,0.85)] hover:border-primary/40 text-text-main hover:text-primary'
                }`}
            >
                {copied ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
                <span className={`topbar-btn-inner ${isCompact ? 'topbar-btn-inner--compact' : ''}`}>{copied ? 'Copied!' : 'Share'}</span>
            </button>

            {/* Open Room Status Indicator */}
            <button
                onClick={() => handleToggleOpenRoom(!isRoomOpen)}
                title={isRoomOpen ? 'Room is open to friends (click to close)' : 'Room is closed (click to open)'}
                className={`shrink-0 flex items-center justify-center h-[42px] w-[42px] rounded-2xl text-sm font-medium transition-all duration-150 backdrop-blur-md shadow-sm border leading-none ${isRoomOpen ? 'bg-primary/10 hover:bg-primary/20 text-primary border-primary/20 hover:border-primary/40' : 'bg-white/90 hover:bg-white text-text-muted hover:text-primary border-[rgba(220,220,220,0.85)] hover:border-primary/40'}`}
            >
                {isRoomOpen ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            </button>

            <div className="flex-1 min-w-[8px]" />
            <LocalCameraAwareQuickAction onOpenSettings={() => { setSettingsTab('video'); setShowSettings(true); }} />


            {/* Chat toggle button lives inside ChatSidebar */}
            <ChatSidebar
                roomId={roomId}
                currentUserId={user?.id ?? ''}
                messages={messages}
                typingUsers={typingUsers}
                sendMessage={sendMessage}
                sendTyping={sendTyping}
                onReact={onReact}
                connected={chatConnected}
                isOpen={chatOpen}
                onToggle={() => setChatOpen(o => !o)}
                unreadCount={unread}
                onRead={handleRead}
                width={chatSidebarWidth}
                onWidthChange={setChatSidebarWidth}
                forceCompact={isCompact}
                isDark={isDark}
                fileTransfers={transfers}
                onSendFile={handleSendFile}
                maxFileSize={maxFileSize}
            />

            <button
                onClick={() => requestLeave('/dashboard')}
                className="shrink-0 flex items-center bg-primary/90 hover:bg-primary border border-primary/60 text-white rounded-2xl px-3 py-2.5 sm:px-4 sm:py-2.5 text-sm font-medium transition-all duration-150 backdrop-blur-md shadow-sm"
            >
                <LogOut className="w-4 h-4" />
                <span className={`topbar-btn-inner ${isCompact ? 'topbar-btn-inner--compact' : ''}`}>Leave</span>
            </button>
        </div>
    );
}
