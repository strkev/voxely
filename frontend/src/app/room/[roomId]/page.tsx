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
    useParticipants,
    useMediaDeviceSelect,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { ChevronUp } from 'lucide-react';
import { playSound } from '@/lib/sounds';
import { FriendsSidebar } from '@/components/FriendsSidebar';
import { RoomInviteBanner } from '@/components/RoomInviteBanner';
import { useFriends } from '@/components/FriendsProvider';
import { useFriendsStore } from '@/store/useFriendsStore';
import { useLeaveGuardStore } from '@/store/useLeaveGuardStore';
import { AutoStartAudio } from '@/components/room/AutoStartAudio';
import { useUIStore } from '@/store/useUIStore';
import { toast } from 'react-hot-toast';
import { RoomModals } from '@/components/room/RoomModals';
import { RoomTopbar } from '@/components/room/RoomTopbar';
import { VideoConferenceView } from '@/components/room/VideoConferenceView';
import { RoomEffects } from '@/components/room/RoomEffects';
import { DevInfoOverlay } from '@/components/room/DevInfoOverlay';
import { ConnectionError } from '@/components/room/ConnectionError';
import { SecureContextWarning } from '@/components/room/SecureContextWarning';
import { LeaveConfirmModal } from '@/components/room/LeaveConfirmModal';
import { CustomControlBar } from '@/components/room/CustomControlBar';
import { SecurityCheckOverlay } from '@/components/room/SecurityCheckOverlay';

import { ExternalE2EEKeyProvider, Room } from 'livekit-client';

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
    const hydrated = useSettingsStore(s => s.hydrated);
    const setControlBarVisible = useSettingsStore(s => s.setControlBarVisible);

    // UI Store access
    const {
        chatOpen, setChatOpen, chatSidebarWidth,
        setUnread,
        friendsSidebarOpen, setFriendsSidebarOpen,
        isRoomOpen: uiIsRoomOpen, setIsRoomOpen: setUiIsRoomOpen,
        setShowFriendsModal,
        setShowSettings
    } = useUIStore(useShallow(s => ({
        chatOpen: s.chatOpen,
        setChatOpen: s.setChatOpen,
        chatSidebarWidth: s.chatSidebarWidth,
        setUnread: s.setUnread,
        friendsSidebarOpen: s.friendsSidebarOpen,
        setFriendsSidebarOpen: s.setFriendsSidebarOpen,
        isRoomOpen: s.isRoomOpen,
        setIsRoomOpen: s.setIsRoomOpen,
        setShowFriendsModal: s.setShowFriendsModal,
        setShowSettings: s.setShowSettings
    })));

    // Custom Toast implementation using react-hot-toast for top-center design
    const handleShowToast = useCallback((msg: { id?: string, name: string, text: string }) => {
        toast.custom((t) => (
            <div
                className={`${t.visible ? 'animate-in slide-in-from-top-4 fade-in' : 'animate-out fade-out zoom-out-95'
                    } duration-300 max-w-[300px] w-full bg-white dark:bg-gray-900/95 backdrop-blur-xl border border-gray-200 dark:border-white/10 shadow-2xl dark:shadow-black/40 rounded-2xl p-4 pointer-events-auto flex items-start flex-col gap-1 transition-all text-left cursor-pointer hover:border-primary/40 dark:hover:border-primary/40`}
                onClick={() => {
                    toast.dismiss(t.id);
                    if (msg.name === 'System') {
                        setShowSettings(true);
                    } else {
                        setChatOpen(true);
                    }
                }}
            >
                <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
                    <span className="text-xs font-bold text-gray-900 dark:text-white truncate">{msg.name}</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2 leading-relaxed break-words w-full">
                    {msg.text}
                </p>
            </div>
        ), { id: msg.id || Date.now().toString(), duration: 1500, position: 'top-center' });
    }, [setChatOpen, setShowSettings]);

    // Friends state & socket
    const incomingRequests = useFriendsStore(s => s.incomingRequests);
    const { sendRoomInvite, toggleRoomOpen, initiateCall, joinRoomSocket, leaveRoomSocket } = useFriends();
    const isDark = mounted ? (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) : (theme === 'dark');

    useEffect(() => {
        if (!mounted || !user) return;
        joinRoomSocket(roomId, user.name || 'Anonymous');
        return () => {
            leaveRoomSocket(roomId);
        };
    }, [mounted, user, roomId, joinRoomSocket, leaveRoomSocket]);

    useThemeBackground(theme);
    const { livekitToken, setLivekitToken, e2eeKey, tokenError, setTokenError } = useLiveKitToken(roomId, user, authToken, authLoading, mounted);
    usePreventTabClose(!!livekitToken);

    // Native LiveKit E2EE Setup
    const keyProvider = useMemo(() => new ExternalE2EEKeyProvider(), []);
    const workerRef = useRef<Worker | null>(null);

    useEffect(() => {
        if (e2eeKey) {
            keyProvider.setKey(e2eeKey);
        }
    }, [keyProvider, e2eeKey]);

    const e2eeSetup = useMemo(() => {
        if (typeof window === 'undefined') return undefined;
        if (!workerRef.current) {
            workerRef.current = new Worker(
                new URL('../../../lib/livekit-e2ee.worker.ts', import.meta.url)
            );
        }
        return { keyProvider, worker: workerRef.current };
    }, [keyProvider]);

    // Cleanup: terminate the E2EE worker on unmount
    useEffect(() => {
        return () => {
            workerRef.current?.terminate();
            workerRef.current = null;
        };
    }, []);

    // Enable E2EE on the room once the key is set
    const roomRef = useRef<Room | null>(null);
    useEffect(() => {
        if (roomRef.current && e2eeKey) {
            roomRef.current.setE2EEEnabled(true);
        }
    }, [e2eeKey]);

    const humanReadableRoomName = useMemo(() => {
        return decodeURIComponent(roomId)
            .replace(/-\d{1,5}$/, '')
            .replace(/-/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
    }, [roomId]);

    const handleToggleOpenRoom = useCallback((isOpen: boolean) => {
        setUiIsRoomOpen(isOpen);
        toggleRoomOpen(roomId, isOpen, humanReadableRoomName);
    }, [toggleRoomOpen, roomId, humanReadableRoomName, setUiIsRoomOpen]);

    const handleInviteFriend = useCallback((friendId: string) => {
        // Get human-readable room name from slug
        sendRoomInvite(friendId, roomId, humanReadableRoomName);
    }, [sendRoomInvite, roomId, humanReadableRoomName]);

    const handleCallFriend = useCallback((friendId: string) => {
        initiateCall(friendId);
    }, [initiateCall]);

    const [copied, setCopied] = useState(false);
    const controlBarTimerRef = useRef<NodeJS.Timeout | null>(null);
    // Room instance is intentionally stable — device IDs are only initial defaults.
    // LiveKitDeviceSync handles live switching via room.switchActiveDevice().
    // We only create once hydration is complete to capture initial user settings.
    const qPreset = VIDEO_PRESETS[videoQuality];
    const room = useMemo(() => {
        if (!hydrated || !e2eeSetup) return undefined;

        const r = new Room({
            encryption: e2eeSetup,
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
        });
        roomRef.current = r;
        return r;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hydrated]);


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

    const handleIncomingFile = useCallback((fileName: string, senderName: string) => {
        if (!chatOpen) {
            setUnread(u => u + 1);
            handleShowToast({
                id: `file-toast-${Date.now()}`,
                name: senderName,
                text: `📁 Datei gesendet: ${fileName}`
            });
        }
    }, [chatOpen, setUnread, handleShowToast]);

    useEffect(() => { setMounted(true); }, []);
    useEffect(() => {
        const isSecure = typeof window !== 'undefined' && (window.isSecureContext || !!navigator.mediaDevices);
        setIsSecureContext(isSecure);
    }, []);

    const availableWidth = windowWidth - (chatOpen && windowWidth >= 640 ? chatSidebarWidth : 0);
    const isCompact = availableWidth < 700;

    // ── Missing Mic Indication ──────────────────────────────────────────────
    const { devices: micDevices } = useMediaDeviceSelect({ kind: 'audioinput' });
    const hasNoMic = micDevices.length === 0;

    useEffect(() => {
        if (!hasNoMic) return;

        let micBtn: HTMLButtonElement | null = null;

        const handleClick = (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            handleShowToast({
                id: Date.now().toString(),
                name: 'System',
                text: 'No microphone found. Please check your settings or permissions.'
            });
        };

        const setup = () => {
            micBtn = document.querySelector('.lk-button-group > button:first-child') as HTMLButtonElement | null;
            if (micBtn && !micBtn.hasAttribute('data-mic-disabled')) {
                micBtn.setAttribute('data-mic-disabled', 'true');
                micBtn.style.opacity = '0.4';
                micBtn.style.filter = 'grayscale(100%)';
                micBtn.title = 'Kein Mikrofon gefunden';
                micBtn.addEventListener('click', handleClick, true);
            }
        };

        const interval = setInterval(setup, 500);
        setup();

        return () => {
            clearInterval(interval);
            if (micBtn) {
                micBtn.removeAttribute('data-mic-disabled');
                micBtn.style.opacity = '';
                micBtn.style.filter = '';
                micBtn.title = '';
                micBtn.removeEventListener('click', handleClick, true);
            }
        };
    }, [hasNoMic, handleShowToast]);



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

    if (isSecureContext === null || authLoading || !mounted || !hydrated) {
        return (
            <div className="flex-1 flex items-center justify-center min-h-[50vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (!user) return null;

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
                room={room}
                video={false}
                audio={false}
                token={livekitToken && e2eeKey ? livekitToken : undefined}
                serverUrl={serverUrl}
                data-lk-theme="default"
                style={{ height: '100%', width: '100%', background: 'transparent', position: 'relative' }}
                onDisconnected={() => router.push('/dashboard')}
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
                    isDark={isDark}
                    requestLeave={requestLeave}
                    onIncomingFileTransfer={handleIncomingFile}
                    handleShowToast={handleShowToast}
                />
                <AutoStartAudio />
                <SecurityCheckOverlay />
                <RoomEffects />
                <VideoConferenceView />
                <RoomAudioRenderer />
                {showDevInfo && <DevInfoOverlay />}

                <RoomModals />

                {/* Collapsible control bar */}
                {controlBarVisible ? (
                    <div
                        className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-40 transition-opacity duration-200 ${chatOpen ? 'max-sm:opacity-0 max-sm:pointer-events-none' : ''}`}
                        onMouseEnter={() => {
                            if (autoHideControlBar && controlBarTimerRef.current) {
                                clearTimeout(controlBarTimerRef.current);
                                controlBarTimerRef.current = null;
                            }
                        }}
                        onMouseLeave={() => {
                            if (autoHideControlBar) {
                                if (controlBarTimerRef.current) clearTimeout(controlBarTimerRef.current);
                                controlBarTimerRef.current = setTimeout(() => setControlBarVisible(false), 4000);
                            }
                        }}
                    >
                        <CustomControlBar isDark={isDark} />
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

            {/* Toast Notifications are now handled via react-hot-toast (top-center) */}
        </div>
    );
}
