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
    useRoomContext,
    useParticipants,
    useLocalParticipant,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { RoomEvent } from 'livekit-client';
import { AlertCircle, Link2, Check, Volume2, Users, LogOut, Lock, Unlock, ImageIcon, ChevronUp } from 'lucide-react';
import { useChatSocket, ChatMessage } from '@/hooks/useChatSocket';
import { ChatSidebar } from '@/components/ChatSidebar';
import { playSound } from '@/lib/sounds';
import { FriendsSidebar } from '@/components/FriendsSidebar';
import { FriendRequestsModal } from '@/components/FriendRequestsModal';
import { RoomInviteBanner } from '@/components/RoomInviteBanner';
import { useFriends } from '@/components/FriendsProvider';
import { useFriendsStore } from '@/store/useFriendsStore';
import { useLeaveGuardStore } from '@/store/useLeaveGuardStore';
import { SettingsModal } from '@/components/SettingsModal';
import { VideoConferenceView } from '@/components/room/VideoConferenceView';
import { RoomEffects } from '@/components/room/RoomEffects';
import { DevInfoOverlay } from '@/components/room/DevInfoOverlay';




// ─── Auto-start audio ─────────────────────────────────────────────────────────
function AutoStartAudio() {
    const room = useRoomContext();
    const [isAudioAllowed, setIsAudioAllowed] = useState(true);
    const [isBusy, setIsBusy] = useState(false);

    useEffect(() => {
        const handleAudioStatusChanged = (playing: boolean) => {
            console.log('[AutoStartAudio] status changed, playing:', playing);
            setIsAudioAllowed(playing);
            if (playing) setIsBusy(false);
        };

        room.on(RoomEvent.AudioPlaybackStatusChanged, handleAudioStatusChanged);

        // Initial check/start
        room.startAudio().then(() => {
            setIsAudioAllowed(true);
        }).catch(() => {
            console.warn('[AutoStartAudio] initial playback blocked');
            setIsAudioAllowed(false);
        });

        return () => {
            room.off(RoomEvent.AudioPlaybackStatusChanged, handleAudioStatusChanged);
        };
    }, [room]);

    useEffect(() => {
        if (isAudioAllowed || isBusy) return;

        const handleInteraction = async (e: Event) => {
            if (isAudioAllowed || isBusy) return;
            
            console.log(`[AutoStartAudio] Interaction (${e.type}) detected, starting audio...`);
            setIsBusy(true);
            try {
                await room.startAudio();
                setIsAudioAllowed(true);
                setIsBusy(false);
            } catch (err) {
                console.error('[AutoStartAudio] startAudio failed:', err);
                // Allow retry after a short delay
                setTimeout(() => setIsBusy(false), 1000);
            }
        };

        // pointerdown is better than mousedown/touchstart as it handles both without double-firing
        const events = ['pointerdown', 'keydown'];
        events.forEach(e => window.addEventListener(e, handleInteraction, { capture: true }));

        return () => {
            events.forEach(e => window.removeEventListener(e, handleInteraction, { capture: true }));
        };
    }, [isAudioAllowed, isBusy, room]);

    if (isAudioAllowed) return null;

    return (
        <div className="fixed inset-0 z-[950] flex items-center justify-center bg-black/40 backdrop-blur-md transition-opacity animate-in fade-in duration-300">
            <div className="bg-white dark:bg-gray-900 p-8 rounded-[32px] shadow-2xl border border-white/10 flex flex-col items-center gap-6 max-w-sm text-center mx-4">
                <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center animate-pulse">
                    <Volume2 className="w-10 h-10 text-primary" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-text-main mb-2">Audio Required</h2>
                    <p className="text-text-muted text-sm leading-relaxed">
                        To hear others in the room, please click the button below to activate audio.
                    </p>
                </div>
                <button
                    disabled={isBusy}
                    onClick={async (e) => {
                        e.stopPropagation();
                        if (isBusy) return;
                        setIsBusy(true);
                        try {
                            await room.startAudio();
                            setIsAudioAllowed(true);
                        } catch (err) {
                            console.error(err);
                            setIsBusy(false);
                        }
                    }}
                    className="w-full flex items-center justify-center gap-2 bg-primary text-white px-8 py-4 rounded-2xl font-bold shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                >
                    {isBusy ? 'Activating...' : 'Activate Audio'}
                </button>
            </div>
        </div>
    );
}



// ─── Custom tile: speaking glow + spotlight button ───────────────────────────


// ─── Dev info overlay ────────────────────────────────────────────────────────

// ─── Local Camera Aware Quick Action ─────────────────────────────────────────
function LocalCameraAwareQuickAction({ onOpenSettings }: { onOpenSettings: () => void }) {
    const { isCameraEnabled } = useLocalParticipant();

    if (!isCameraEnabled) return null;

    return (
        <button
            onClick={onOpenSettings}
            className="shrink-0 flex items-center justify-center h-[42px] w-[42px] rounded-2xl text-sm font-medium transition-all duration-150 backdrop-blur-md shadow-sm border bg-white/90 hover:bg-white text-text-main hover:text-primary border-[rgba(220,220,220,0.85)] hover:border-primary/40 relative group"
            title="Update Background"
        >
            <ImageIcon className="w-4 h-4" />
        </button>
    );
}






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
    const [isSecureContext, setIsSecureContext] = useState<boolean>(true);
    const [mounted, setMounted] = useState(false);
    const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
    const [tokenError, setTokenError] = useState(false);
    const resolvedParams = React.use(params);
    const roomId = resolvedParams.roomId;

    // ── Chat state ────────────────────────────────────────────────────────────
    const [chatOpen, setChatOpen] = useState(false);
    const [chatSidebarWidth, setChatSidebarWidth] = useState(320);
    const [unread, setUnread] = useState(0);
    const [copied, setCopied] = useState(false);
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
    const [showFriendsModal, setShowFriendsModal] = useState(false);
    const [friendsSidebarOpen, setFriendsSidebarOpen] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [settingsTab, setSettingsTab] = useState<'audio-video' | 'quality' | 'interface' | 'sounds' | 'profile' | 'account'>('audio-video');
    const [toastMessage, setToastMessage] = useState<{ id: string; name: string; text: string } | null>(null);
    const toastTimerRef = useRef<NodeJS.Timeout | null>(null);
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
        const timer = setTimeout(() => setControlBarVisible(false), 4000);
        (window as unknown as Record<string, unknown>).__controlBarTimer = timer as unknown;
        return () => clearTimeout(timer);
    }, [autoHideControlBar, controlBarVisible, setControlBarVisible]);

    const handleNewMessage = useCallback((msg: ChatMessage) => {
        if (!chatOpen) {
            setUnread(u => u + 1);

            // Show visual toast
            if (msg.userId !== user?.id) {
                setToastMessage({
                    id: msg.id,
                    name: msg.name,
                    text: msg.text
                });

                if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
                toastTimerRef.current = setTimeout(() => {
                    setToastMessage(null);
                }, 4000);
            }
        }
    }, [chatOpen, user?.id]);

    // Set up real-time chat socket
    const { messages, typingUsers, sendMessage, sendTyping, sendReaction, connected: chatConnected, isRoomOpen } = useChatSocket({
        roomId,
        token: authToken,
        userName: user?.name ?? 'Anonymous',
        userId: user?.id ?? '',
        onNewMessage: handleNewMessage,
    });

    const handleRead = useCallback(() => setUnread(0), []);

    useEffect(() => { setMounted(true); }, []);
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const isSecure = window.isSecureContext || !!navigator.mediaDevices;
            setIsSecureContext(isSecure);
        }
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
    }, [chatOpen]);

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

    if (!isSecureContext) {
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
                <div className="absolute top-4 left-0 right-0 z-40 flex items-center px-3 sm:px-4 gap-2 sm:gap-3 overflow-visible py-2 -my-2 flex-wrap sm:flex-nowrap">
                    {/* Friends toggle button */}
                    <button
                        onClick={() => setFriendsSidebarOpen(o => !o)}
                        aria-label="Friends"
                        className={`shrink-0 flex items-center backdrop-blur-md border rounded-2xl px-3 py-2.5 sm:px-4 sm:py-2.5 text-sm font-medium transition-all duration-150 shadow-sm ${friendsSidebarOpen
                            ? 'bg-primary/90 hover:bg-primary border-primary/60 text-white'
                            : 'bg-white/90 hover:bg-white border-[rgba(220,220,220,0.85)] hover:border-primary/40 text-text-main hover:text-primary'
                            }`}
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
                        className="shrink-0 flex items-center bg-gray-900 hover:bg-gray-800 text-white border border-gray-800 rounded-2xl px-3 py-2.5 sm:px-4 sm:py-2.5 text-sm font-medium transition-all duration-150 shadow-sm"
                    >
                        {copied ? <Check className="w-4 h-4 text-green-400" /> : <Link2 className="w-4 h-4" />}
                        <span className={`topbar-btn-inner ${isCompact ? 'topbar-btn-inner--compact' : ''}`}>{copied ? 'Copied!' : 'Share'}</span>
                    </button>

                    {/* Open Room Status Indicator */}
                    <button
                        onClick={() => handleToggleOpenRoom(!isRoomOpen)}
                        title={isRoomOpen ? 'Room is open to friends (click to close)' : 'Room is closed (click to open)'}
                        className={`shrink-0 flex items-center justify-center p-2.5 rounded-2xl text-sm font-medium transition-all duration-150 backdrop-blur-md shadow-sm border ${isRoomOpen ? 'bg-primary/10 hover:bg-primary/20 text-primary border-primary/20 hover:border-primary/40' : 'bg-white/90 hover:bg-white text-text-muted hover:text-primary border-[rgba(220,220,220,0.85)] hover:border-primary/40'}`}
                    >
                        {isRoomOpen ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                    </button>

                    <div className="flex-1 min-w-[8px]" />
                    <LocalCameraAwareQuickAction onOpenSettings={() => { setSettingsTab('audio-video'); setShowSettings(true); }} />


                    {/* Chat toggle button lives inside ChatSidebar */}
                    <ChatSidebar
                        roomId={roomId}
                        currentUserId={user?.id ?? ''}
                        messages={messages}
                        typingUsers={typingUsers}
                        sendMessage={sendMessage}
                        sendTyping={sendTyping}
                        onReact={sendReaction}
                        connected={chatConnected}
                        isOpen={chatOpen}
                        onToggle={() => setChatOpen(o => !o)}
                        unreadCount={unread}
                        onRead={handleRead}
                        width={chatSidebarWidth}
                        onWidthChange={setChatSidebarWidth}
                        forceCompact={isCompact}
                    />

                    <button
                        onClick={() => requestLeave('/dashboard')}
                        className="shrink-0 flex items-center bg-primary/90 hover:bg-primary border border-primary/60 text-white rounded-2xl px-3 py-2.5 sm:px-4 sm:py-2.5 text-sm font-medium transition-all duration-150 backdrop-blur-md shadow-sm"
                    >
                        <LogOut className="w-4 h-4" />
                        <span className={`topbar-btn-inner ${isCompact ? 'topbar-btn-inner--compact' : ''}`}>Leave</span>
                    </button>
                </div>
                <AutoStartAudio />
                <RoomEffects />
                <VideoConferenceView />
                <RoomAudioRenderer />
                {showDevInfo && <DevInfoOverlay />}

                {/* Unified Settings Modal */}
                {showSettings && (
                    <SettingsModal
                        onClose={() => setShowSettings(false)}
                        defaultTab={settingsTab}
                    />
                )}

                {/* Collapsible control bar */}
                {controlBarVisible ? (
                    <div
                        className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-40 transition-opacity duration-200 ${chatOpen ? 'max-sm:opacity-0 max-sm:pointer-events-none' : ''}`}
                        onMouseEnter={() => {
                            if (autoHideControlBar) {
                                // Reset timer on hover
                                if ((window as unknown as Record<string, unknown>).__controlBarTimer) {
                                    clearTimeout((window as unknown as Record<string, unknown>).__controlBarTimer as number);
                                    (window as unknown as Record<string, unknown>).__controlBarTimer = undefined;
                                }
                            }
                        }}
                        onMouseLeave={() => {
                            if (autoHideControlBar) {
                                (window as unknown as Record<string, unknown>).__controlBarTimer = setTimeout(() => setControlBarVisible(false), 4000) as unknown;
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
                                isRoomOpen={isRoomOpen}
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

            {/* Friend Requests Modal */}
            {showFriendsModal && (
                <FriendRequestsModal onClose={() => setShowFriendsModal(false)} />
            )}

            {/* Message Toast Notification */}
            <div
                className={`
                    fixed top-[120px] z-50 transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]
                    ${toastMessage ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8 pointer-events-none'}
                `}
                style={{
                    right: chatOpen && typeof window !== 'undefined' && window.innerWidth >= 640 ? `${chatSidebarWidth + 16}px` : '16px'
                }}
            >
                {toastMessage && (
                    <button
                        onClick={() => {
                            setChatOpen(true);
                            setToastMessage(null);
                        }}
                        className="flex flex-col gap-1 items-start bg-white dark:bg-gray-900/95 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-2xl p-4 shadow-2xl dark:shadow-black/40 max-w-[300px] hover:border-primary/40 dark:hover:border-primary/40 transition-all text-left"
                    >
                        <div className="flex items-center gap-2">
                            <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
                            <span className="text-xs font-bold text-gray-900 dark:text-white truncate">{toastMessage.name}</span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2 leading-relaxed break-words w-full">
                            {toastMessage.text}
                        </p>
                    </button>
                )}
            </div>
        </div>
    );
}
