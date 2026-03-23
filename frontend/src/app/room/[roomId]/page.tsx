"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/store/useAuthStore';
import { useSettingsStore, VIDEO_PRESETS } from '@/store/useSettingsStore';
import { useWindowWidth, useThemeBackground, usePreventTabClose, useLiveKitToken } from '@/hooks/useRoomHooks';
import {
    LiveKitRoom,
    RoomAudioRenderer,
    ControlBar,
    useParticipants,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { ChevronUp } from 'lucide-react';
import { useChatSocket, ChatMessage } from '@/hooks/useChatSocket';
import { playSound } from '@/lib/sounds';
import { FriendsSidebar } from '@/components/FriendsSidebar';
import { RoomInviteBanner } from '@/components/RoomInviteBanner';
import { useFriends } from '@/components/FriendsProvider';
import { useFriendsStore } from '@/store/useFriendsStore';
import { useLeaveGuardStore } from '@/store/useLeaveGuardStore';
import { AutoStartAudio } from '@/components/room/AutoStartAudio';
import { useUIStore } from '@/store/useUIStore';
import { ChatToast } from '@/components/room/ChatToast';
import { RoomModals } from '@/components/room/RoomModals';
import { RoomTopbar } from '@/components/room/RoomTopbar';
import { VideoConferenceView } from '@/components/room/VideoConferenceView';
import { RoomEffects } from '@/components/room/RoomEffects';
import { DevInfoOverlay } from '@/components/room/DevInfoOverlay';
import { ConnectionError } from '@/components/room/ConnectionError';
import { SecureContextWarning } from '@/components/room/SecureContextWarning';
import { LeaveConfirmModal } from '@/components/room/LeaveConfirmModal';













// ─── Friends Sidebar with Presence Tracking ─────────────────────────────────
function FriendsSidebarWithPresence({
    roomId,
    isRoomOpen,
    onInvite,
    onOpenRequests,
    onClose,
    onToggleOpen,
    onCall,
}: {
    roomId: string;
    isRoomOpen: boolean;
    onInvite: (friendId: string) => void;
    onOpenRequests: () => void;
    onClose: () => void;
    onToggleOpen: (isOpen: boolean) => void;
    onCall: (friendId: string) => void;
}) {
    const participants = useParticipants();
    const inRoomUserIds = useMemo(() => {
        const ids = new Set<string>();
        participants.forEach(p => {
            if (p.identity) ids.add(p.identity);
        });
        return ids;
    }, [participants]);

    return (
        <FriendsSidebar
            currentRoomId={roomId}
            isRoomOpen={isRoomOpen}
            onInvite={onInvite}
            onOpenRequests={onOpenRequests}
            onClose={onClose}
            onToggleOpen={onToggleOpen}
            onCall={onCall}
            inRoomUserIds={inRoomUserIds}
        />
    );
}


// ─── Page ─────────────────────────────────────────────────────────────────────
export default function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
    const router = useRouter();
    const { user, token: authToken, isLoading: authLoading } = useAuthStore(
        useShallow(s => ({
            user: s.user,
            token: s.token,
            isLoading: s.isLoading
        }))
    );
    const { activate: activateGuard, deactivate: deactivateGuard, pendingTarget, requestLeave, cancelLeave, confirmLeave: storeConfirmLeave } = useLeaveGuardStore(
        useShallow(s => ({
            activate: s.activate,
            deactivate: s.deactivate,
            pendingTarget: s.pendingTarget,
            requestLeave: s.requestLeave,
            cancelLeave: s.cancelLeave,
            confirmLeave: s.confirmLeave
        }))
    );
    const [isSecureContext, setIsSecureContext] = useState<boolean | null>(null);
    const [mounted, setMounted] = useState(false);
    const windowWidth = useWindowWidth(1200);
    const resolvedParams = React.use(params);
    const roomId = resolvedParams.roomId;

    // ── Chat state ────────────────────────────────────────────────────────────
    const soundsEnabled = useSettingsStore(s => s.soundsEnabled);
    const soundVolume = useSettingsStore(s => s.soundVolume);
    const videoQuality = useSettingsStore(s => s.videoQuality);
    const showDevInfo = useSettingsStore(s => s.showDevInfo);
    const controlBarVisible = useSettingsStore(s => s.controlBarVisible);
    const autoHideControlBar = useSettingsStore(s => s.autoHideControlBar);
    const screenShareFps = useSettingsStore(s => s.screenShareFps);
    const theme = useSettingsStore(s => s.theme);
    const audioDeviceId = useSettingsStore(s => s.audioDeviceId);
    const videoDeviceId = useSettingsStore(s => s.videoDeviceId);
    const setControlBarVisible = useSettingsStore(s => s.setControlBarVisible);
    
    // UI Store access
    const { 
        chatOpen, setChatOpen, chatSidebarWidth,
        setUnread, showToast,
        friendsSidebarOpen, setFriendsSidebarOpen,
        isRoomOpen: uiIsRoomOpen, setIsRoomOpen: setUiIsRoomOpen,
        setShowFriendsModal
    } = useUIStore(useShallow(s => ({
        chatOpen: s.chatOpen,
        setChatOpen: s.setChatOpen,
        chatSidebarWidth: s.chatSidebarWidth,
        setUnread: s.setUnread,
        showToast: s.showToast,
        friendsSidebarOpen: s.friendsSidebarOpen,
        setFriendsSidebarOpen: s.setFriendsSidebarOpen,
        isRoomOpen: s.isRoomOpen,
        setIsRoomOpen: s.setIsRoomOpen,
        setShowFriendsModal: s.setShowFriendsModal
    })));

    // Friends state & socket
    const incomingRequests = useFriendsStore(s => s.incomingRequests);
    const { sendRoomInvite, toggleRoomOpen, initiateCall } = useFriends();
    const isDark = mounted ? (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) : (theme === 'dark');

    useThemeBackground(theme);
    const { livekitToken, setLivekitToken, tokenError, setTokenError } = useLiveKitToken(roomId, user, authToken, authLoading, mounted);
    usePreventTabClose(!!livekitToken);

    const humanReadableRoomName = useMemo(() => {
        return decodeURIComponent(roomId)
            .replace(/-\d{1,5}$/, '')
            .replace(/-/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
    }, [roomId]);

    const handleToggleOpenRoom = useCallback((isOpen: boolean) => {
        toggleRoomOpen(roomId, isOpen, humanReadableRoomName);
    }, [toggleRoomOpen, roomId, humanReadableRoomName]);

    const handleInviteFriend = useCallback((friendId: string) => {
        // Get human-readable room name from slug
        sendRoomInvite(friendId, roomId, humanReadableRoomName);
    }, [sendRoomInvite, roomId, humanReadableRoomName]);

    const handleCallFriend = useCallback((friendId: string) => {
        initiateCall(friendId);
    }, [initiateCall]);
    
    const [copied, setCopied] = useState(false);
    const controlBarTimerRef = useRef<NodeJS.Timeout | null>(null);
    // roomOptions is intentionally stable — device IDs are only initial defaults.
    // LiveKitDeviceSync handles live switching via room.switchActiveDevice().
    const qPreset = VIDEO_PRESETS[videoQuality];
    const roomOptions = useMemo(() => ({
        videoCaptureDefaults: {
            deviceId: videoDeviceId || undefined,
            resolution: { width: qPreset.width, height: qPreset.height, frameRate: qPreset.frameRate },
        },
        audioCaptureDefaults: {
            deviceId: audioDeviceId || undefined,
        },
        publishDefaults: {
            videoCodec: 'vp9' as const,
            videoEncoding: {
                maxBitrate: qPreset.maxBitrate,
                maxFramerate: qPreset.frameRate,
            },
            screenShareEncoding: {
                maxBitrate: 50_000_000,
                maxFramerate: screenShareFps,
            },
            screenShareSimulcastLayers: [],
        },
    }), [videoDeviceId, audioDeviceId, qPreset, screenShareFps]);


    // Ensure control bar is always visible on mount + activate leave guard
    useEffect(() => {
        setControlBarVisible(true);
        activateGuard();
        return () => { deactivateGuard(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-hide control bar after 4s of inactivity
    useEffect(() => {
        if (!autoHideControlBar || !controlBarVisible) return;
        
        if (controlBarTimerRef.current) clearTimeout(controlBarTimerRef.current);
        controlBarTimerRef.current = setTimeout(() => setControlBarVisible(false), 4000);
        
        return () => {
            if (controlBarTimerRef.current) clearTimeout(controlBarTimerRef.current);
        };
    }, [autoHideControlBar, controlBarVisible, setControlBarVisible]);

    const handleNewMessage = useCallback((msg: ChatMessage) => {
        if (!chatOpen) {
            setUnread(u => u + 1);

            // Show visual toast
            if (msg.userId !== user?.id) {
                showToast({
                    id: msg.id,
                    name: msg.name,
                    text: msg.text
                });
            }
        }
    }, [chatOpen, user?.id, setUnread, showToast]);

    // Set up real-time chat socket
    const { messages, typingUsers, sendMessage, sendTyping, sendReaction, connected: chatConnected, isRoomOpen: socketIsRoomOpen } = useChatSocket({
        roomId,
        token: authToken,
        userName: user?.name ?? 'Anonymous',
        userId: user?.id ?? '',
        onNewMessage: handleNewMessage,
    });

    // Sync room open status to store
    useEffect(() => {
        setUiIsRoomOpen(socketIsRoomOpen);
    }, [socketIsRoomOpen, setUiIsRoomOpen]);


    useEffect(() => { setMounted(true); }, []);
    useEffect(() => {
        const isSecure = typeof window !== 'undefined' && (window.isSecureContext || !!navigator.mediaDevices);
        setIsSecureContext(isSecure);
    }, []);

    const availableWidth = windowWidth - (chatOpen && windowWidth >= 640 ? chatSidebarWidth : 0);
    const isCompact = availableWidth < 700;



    // Confirm leave: navigate to the pending target from the global store
    const handleConfirmLeave = useCallback(() => {
        // Play leave sound before closing
        if (soundsEnabled) {
            playSound('leave', soundVolume);
        }

        const target = storeConfirmLeave();
        if (target) {
            // Delay the actual navigation by 400ms to allow the LiveKit disconnected 
            // 'leave' sound effect to finish playing before the page unmounts
            setTimeout(() => {
                router.push(target);
            }, 400);
        }
    }, [storeConfirmLeave, router, soundsEnabled, soundVolume]);



    // Escape key closes chat sidebar
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && chatOpen) setChatOpen(false);
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [chatOpen, setChatOpen]);

    const handleCopyLink = () => {
        navigator.clipboard.writeText(roomId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (tokenError) {
        return <ConnectionError onRetry={() => { setTokenError(false); setLivekitToken(''); }} />;
    }

    if (isSecureContext === null || authLoading || !mounted) {
        return (
            <div className="flex-1 flex items-center justify-center min-h-[50vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (isSecureContext === false) {
        return <SecureContextWarning />;
    }

    const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || 'ws://localhost:7880';

    return (
        <div
            className={`fixed inset-0 top-16 overflow-hidden transition-[padding-right] duration-300 ${isDark ? 'bg-gray-950' : 'bg-[#F7F7F7]'}`}
            style={{ paddingRight: mounted && chatOpen && window.innerWidth >= 640 ? `${chatSidebarWidth}px` : '0px' }}
        >
            <LiveKitRoom
                video={false}
                audio={false}
                token={livekitToken}
                serverUrl={serverUrl}
                data-lk-theme="default"
                style={{ height: '100%', width: '100%', background: 'transparent', position: 'relative' }}
                onDisconnected={() => router.push('/dashboard')}
                options={roomOptions}
            >
                {/* Top bar */}
                <RoomTopbar
                    roomId={roomId}
                    user={user}
                    incomingRequests={incomingRequests}
                    handleCopyLink={handleCopyLink}
                    copied={copied}
                    handleToggleOpenRoom={handleToggleOpenRoom}
                    isCompact={isCompact}
                    messages={messages}
                    typingUsers={typingUsers}
                    sendMessage={sendMessage}
                    sendTyping={sendTyping}
                    onReact={sendReaction}
                    chatConnected={chatConnected}
                    requestLeave={requestLeave}
                />
                <AutoStartAudio />
                <RoomEffects />
                <VideoConferenceView />
                <RoomAudioRenderer />
                {showDevInfo && <DevInfoOverlay />}

                <RoomModals />

                {/* Collapsible control bar */}
                {controlBarVisible ? (
                    <div
                        className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-40 transition-opacity duration-200 ${chatOpen ? 'max-sm:opacity-0 max-sm:pointer-events-none' : ''}`}
                        onMouseEnter={() => {
                            if (autoHideControlBar) {
                                // Reset timer on hover
                                if (controlBarTimerRef.current) {
                                    clearTimeout(controlBarTimerRef.current);
                                    controlBarTimerRef.current = null;
                                }
                            }
                        }}
                        onMouseLeave={() => {
                            if (autoHideControlBar) {
                                if (controlBarTimerRef.current) clearTimeout(controlBarTimerRef.current);
                                controlBarTimerRef.current = setTimeout(() => setControlBarVisible(false), 4000);
                            }
                        }}
                    >
                        <div className="bg-white/90 backdrop-blur-md border border-white/60 rounded-full shadow-lg px-3 py-1.5 flex items-center gap-1">
                            <ControlBar
                                controls={{ camera: true, microphone: true, screenShare: true, chat: false, leave: false }}
                                saveUserChoices={true}
                            />
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={() => setControlBarVisible(true)}
                        className={`fixed bottom-3 left-1/2 -translate-x-1/2 z-40 bg-white/80 hover:bg-white backdrop-blur-md border border-white/60 rounded-full shadow-lg p-2 transition-all duration-200 hover:scale-105 ${chatOpen ? 'max-sm:opacity-0 max-sm:pointer-events-none' : ''}`}
                        title="Show controls"
                    >
                        <ChevronUp className="w-4 h-4 text-text-main" />
                    </button>
                )}

                {/* Friends Sidebar — toggle overlay (moved inside LiveKitRoom for context) */}
                {friendsSidebarOpen && (
                    <>
                        {/* Invisible backdrop to capture outside clicks */}
                        <div
                            className="fixed inset-0 z-40 bg-transparent"
                            onClick={() => setFriendsSidebarOpen(false)}
                        />
                        {/* Wrapper with !static and !h-full to prevent Mobile Safari from shifting the sticky sidebar upwards and hiding its header */}
                        <div className="fixed top-16 left-0 bottom-0 z-50 [&_.friends-sidebar]:!static [&_.friends-sidebar]:!h-full">
                            <FriendsSidebarWithPresence
                                roomId={roomId}
                                isRoomOpen={uiIsRoomOpen}
                                onInvite={handleInviteFriend}
                                onOpenRequests={() => setShowFriendsModal(true)}
                                onClose={() => setFriendsSidebarOpen(false)}
                                onToggleOpen={handleToggleOpenRoom}
                                onCall={handleCallFriend}
                            />
                        </div>
                    </>
                )}
            </LiveKitRoom>



            {/* Room Invite Banner */}
            <RoomInviteBanner />

            {/* Leave confirmation modal overlay */}
            <LeaveConfirmModal 
                isOpen={!!pendingTarget} 
                onCancel={cancelLeave} 
                onConfirm={handleConfirmLeave} 
            />

            {/* Message Toast Notification */}
            <ChatToast />
        </div>
    );
}
