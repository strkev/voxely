"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { useSettingsStore, VIDEO_PRESETS } from '@/store/useSettingsStore';
import {
    LiveKitRoom,
    RoomAudioRenderer,
    ControlBar,
    useParticipants,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { AlertCircle, Lock, LogOut, ChevronUp } from 'lucide-react';
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
    const { user, token: authToken, isLoading: authLoading } = useAuthStore();
    const { activate: activateGuard, deactivate: deactivateGuard, pendingTarget, requestLeave, cancelLeave, confirmLeave: storeConfirmLeave } = useLeaveGuardStore();
    const [livekitToken, setLivekitToken] = useState<string>('');
    const [isSecureContext, setIsSecureContext] = useState<boolean | null>(null);
    const [mounted, setMounted] = useState(false);
    const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
    const [tokenError, setTokenError] = useState(false);
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
    } = useUIStore();

    // Friends state & socket
    const incomingRequests = useFriendsStore(s => s.incomingRequests);
    const { sendRoomInvite, toggleRoomOpen, initiateCall } = useFriends();
    const isDark = mounted ? (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) : (theme === 'dark');

    const handleToggleOpenRoom = useCallback((isOpen: boolean) => {
        const roomName = decodeURIComponent(roomId)
            .replace(/-\d{1,5}$/, '')
            .replace(/-/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
        toggleRoomOpen(roomId, isOpen, roomName);
    }, [toggleRoomOpen, roomId]);

    const handleInviteFriend = useCallback((friendId: string) => {
        // Get human-readable room name from slug
        const roomName = decodeURIComponent(roomId)
            .replace(/-\d{1,5}$/, '')
            .replace(/-/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
        sendRoomInvite(friendId, roomId, roomName);
    }, [sendRoomInvite, roomId]);

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

    // Track window width for topbar responsiveness
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const handleResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const availableWidth = windowWidth - (chatOpen && windowWidth >= 640 ? chatSidebarWidth : 0);
    const isCompact = availableWidth < 700;

    // Prevent white background flash on mobile overscroll
    useEffect(() => {
        if (typeof document === 'undefined') return;
        const bodyBg = document.body.style.backgroundColor;
        const htmlBg = document.documentElement.style.backgroundColor;

        // Use theme-aware background colors
        const isDark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        const bgVal = isDark ? '#030712' : '#F7F7F7';

        document.body.style.setProperty('background-color', bgVal, 'important');
        document.documentElement.style.setProperty('background-color', bgVal, 'important');
        return () => {
            document.body.style.backgroundColor = bodyBg;
            document.documentElement.style.backgroundColor = htmlBg;
        };
    }, [theme]);

    // Browser tab close / refresh warning
    useEffect(() => {
        if (!livekitToken) return; // Only warn if connected to room
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [livekitToken]);

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

    useEffect(() => {
        if (!mounted) return;
        if (authLoading) return; // Wait for auth check to complete
        if (!user) { router.push('/login?redirect=' + encodeURIComponent(window.location.pathname)); return; }
        setTokenError(false);
        const fetchToken = async () => {
            try {
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/livekit/token`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${authToken}`
                    },
                    body: JSON.stringify({ roomName: roomId, participantName: user.name, participantId: user.id }),
                });
                const data = await res.json();
                if (data.token) setLivekitToken(typeof data.token === 'string' ? data.token : data.token.token || '');
                else setTokenError(true);
            } catch (err) { console.error(err); setTokenError(true); }
        };
        fetchToken();
    }, [user, roomId, router, mounted, authToken, authLoading]);

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
        return (
            <div className="flex-1 flex items-center justify-center min-h-[50vh] px-4">
                <div className="bg-surface shadow-flat border border-gray-100 rounded-2xl p-8 max-w-md w-full text-center flex flex-col items-center gap-4">
                    <div className="w-14 h-14 bg-red-50 text-primary rounded-full flex items-center justify-center">
                        <AlertCircle className="w-7 h-7" />
                    </div>
                    <h2 className="text-xl font-semibold text-text-main">Connection Failed</h2>
                    <p className="text-sm text-text-muted">Could not connect to the room. Please check the room code and try again.</p>
                    <div className="flex gap-3 w-full mt-2">
                        <button onClick={() => router.push('/dashboard')} className="flex-1 h-11 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50 transition-colors">Dashboard</button>
                        <button onClick={() => { setTokenError(false); setLivekitToken(''); }} className="flex-1 h-11 rounded-xl bg-primary text-white text-sm font-medium hover:bg-[#E0484D] transition-colors">Retry</button>
                    </div>
                </div>
            </div>
        );
    }

    if (isSecureContext === null || authLoading || !mounted) {
        return (
            <div className="flex-1 flex items-center justify-center min-h-[50vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (isSecureContext === false) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] px-4">
                <div className="bg-surface shadow-flat border border-gray-100 rounded-2xl p-8 max-w-md w-full text-center flex flex-col items-center">
                    <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mb-6">
                        <Lock className="w-8 h-8" />
                    </div>
                    <h2 className="text-2xl font-bold text-text-main mb-3">Secure Connection Required</h2>
                    <p className="text-text-muted mb-6 leading-relaxed">
                        To protect your privacy, video and audio chats are only available over <strong>HTTPS</strong> or <strong>localhost</strong>.
                    </p>
                    <button onClick={() => router.push('/dashboard')} className="w-full py-2.5 px-6 bg-primary text-white rounded-xl font-medium hover:bg-[#E0484D] transition-colors">
                        Back to Dashboard
                    </button>
                </div>
            </div>
        );
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

            {/* Leave confirmation modal overlay — portaled to body to ensure it stays above all other UI */}
            {pendingTarget && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-transparent backdrop-blur-sm p-4" style={{ backgroundColor: 'rgba(0,0,0,0.4)', pointerEvents: 'auto' }}>
                    <div className="bg-surface rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-3 text-red-500 mb-3">
                            <LogOut className="w-6 h-6" />
                            <h2 className="text-xl font-bold text-text-main">Leave Room?</h2>
                        </div>
                        <p className="text-text-muted mb-6">Are you sure you want to disconnect and leave this space?</p>
                        <div className="flex gap-3">
                            <button
                                onClick={cancelLeave}
                                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmLeave}
                                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold shadow-sm hover:bg-red-600 transition-colors"
                            >
                                Leave
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Message Toast Notification */}
            <ChatToast />
        </div>
    );
}
