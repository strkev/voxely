"use client";

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { useSettingsStore, VIDEO_PRESETS, type VideoQuality } from '@/store/useSettingsStore';
import {
    LiveKitRoom,
    RoomAudioRenderer,
    ControlBar,
    ParticipantTile,
    useTracks,
    useRoomContext,
    useIsSpeaking,
    TrackReferenceOrPlaceholder,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Track } from 'livekit-client';
import { AlertCircle, Star, X, Link2, Check, Settings, Monitor, Volume2, VolumeX, Bell, ChevronUp, Mic } from 'lucide-react';
import { useRoomSounds } from '@/hooks/useRoomSounds';
import { useChatSocket } from '@/hooks/useChatSocket';
import { ChatSidebar } from '@/components/ChatSidebar';
import { playSound } from '@/lib/sounds';
import { NoiseSuppressionProcessor } from '@/lib/rnnoise-processor';

// ─── Auto-start audio ─────────────────────────────────────────────────────────
function AutoStartAudio() {
    const room = useRoomContext();
    useEffect(() => {
        room.startAudio().catch(() => { });
    }, [room]);
    return null;
}

// ─── Chevron Rotation Fix ─────────────────────────────────────────────────────
function ChevronRotationFix() {
    useEffect(() => {
        let justSet = false;
        const closeAll = () => {
            document.querySelectorAll('.lk-button-menu[data-menu-open]').forEach(el => {
                el.removeAttribute('data-menu-open');
            });
        };
        const handleChevronClick = (e: Event) => {
            const btn = e.currentTarget as HTMLElement;
            const wasOpen = btn.hasAttribute('data-menu-open');
            closeAll();
            if (!wasOpen) {
                btn.setAttribute('data-menu-open', '');
                justSet = true;
                requestAnimationFrame(() => { justSet = false; });
            }
        };
        const handleDocumentClick = () => { if (!justSet) closeAll(); };
        const attachListeners = () => {
            document.querySelectorAll('.lk-button-menu').forEach(btn => {
                if (!btn.hasAttribute('data-chevron-patched')) {
                    btn.setAttribute('data-chevron-patched', '');
                    btn.addEventListener('click', handleChevronClick);
                }
            });
        };
        const observer = new MutationObserver(attachListeners);
        observer.observe(document.body, { childList: true, subtree: true });
        attachListeners();
        document.addEventListener('click', handleDocumentClick);
        return () => {
            observer.disconnect();
            document.removeEventListener('click', handleDocumentClick);
        };
    }, []);
    return null;
}

// ─── Unique key for each track (identity + source avoids duplicates on screen share) ──
function trackKey(track: TrackReferenceOrPlaceholder, fallback: number): string {
    const identity = track.participant?.identity ?? `p-${fallback}`;
    const source = track.source ?? 'unknown';
    return `${identity}-${source}`;
}

// ─── Custom tile: speaking glow + spotlight button ───────────────────────────
function SpotlightableTile({
    trackRef,
    isSpotlit = false,
    onSpotlight,
}: {
    trackRef?: TrackReferenceOrPlaceholder;
    isSpotlit?: boolean;
    onSpotlight?: (t: TrackReferenceOrPlaceholder | null) => void;
}) {
    const isSpeaking = useIsSpeaking(trackRef?.participant ?? undefined);
    const isScreenShare = trackRef?.source === Track.Source.ScreenShare;

    const glowStyle = isSpeaking ? {
        boxShadow: '0 0 0 2.5px #FF5A5F, 0 0 18px 4px rgba(255,90,95,0.55), inset 0 0 14px 2px rgba(255,90,95,0.30)',
    } : undefined;

    return (
        <div
            className={`relative w-full h-full group rounded-[16px] transition-shadow duration-200 ${isScreenShare ? 'lk-screen-share-tile' : ''}`}
            style={glowStyle}
        >
            <ParticipantTile trackRef={trackRef} />

            {/* Spotlight toggle — always faintly visible, full opacity on hover */}
            {onSpotlight && (
                <button
                    onClick={() => onSpotlight(isSpotlit ? null : (trackRef ?? null))}
                    title={isSpotlit ? 'Spotlight entfernen' : 'Spotlight'}
                    className={`
                        absolute top-2 right-2 z-1 p-1.5 rounded-lg backdrop-blur-md
                        transition-all duration-200
                        ${isSpotlit
                            ? 'bg-amber-400/90 text-white opacity-100 shadow-md'
                            : 'bg-black/40 text-white/60 opacity-40 hover:opacity-100 hover:bg-amber-400/80'
                        }
                    `}
                >
                    <Star className={`w-3.5 h-3.5 ${isSpotlit ? 'fill-white' : ''}`} />
                </button>
            )}

            {/* Spotlight badge when pinned */}
            {isSpotlit && (
                <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-amber-400/90 text-white text-xs font-semibold px-2.5 py-1 rounded-full backdrop-blur-sm pointer-events-none">
                    <Star className="w-3 h-3 fill-white" />
                    Spotlight
                </div>
            )}
        </div>
    );
}

// ─── Dev info overlay ────────────────────────────────────────────────────────
function DevInfoOverlay() {
    const room = useRoomContext();
    const [stats, setStats] = useState<{ bitrate: string; resolution: string; codec: string; fps: string }>({ bitrate: '—', resolution: '—', codec: '—', fps: '—' });

    useEffect(() => {
        const update = async () => {
            const localP = room.localParticipant;
            const videoTrack = localP.videoTrackPublications.values().next().value;
            if (!videoTrack?.track) {
                setStats({ bitrate: '—', resolution: '—', codec: '—', fps: '—' });
                return;
            }
            try {
                const report = await videoTrack.track.getRTCStatsReport();
                let bitrate = '—', codec = '—', fps = '—';
                const dims = videoTrack.dimensions;
                const resolution = dims ? `${dims.width}×${dims.height}` : '—';
                if (report) {
                    report.forEach((stat) => {
                        if (stat.type === 'outbound-rtp' && stat.kind === 'video') {
                            if (stat.bytesSent !== undefined) {
                                const kbps = Math.round(((stat.bytesSent ?? 0) * 8) / 1000);
                                bitrate = `${kbps} kbps`;
                            }
                            if (stat.framesPerSecond) fps = `${Math.round(stat.framesPerSecond)}`;
                        }
                        if (stat.type === 'codec' && stat.mimeType?.startsWith('video/')) {
                            codec = stat.mimeType.replace('video/', '');
                        }
                    });
                }
                setStats({ bitrate, resolution, codec, fps });
            } catch { /* ignore */ }
        };
        const interval = setInterval(update, 2000);
        update();
        return () => clearInterval(interval);
    }, [room]);

    return (
        <div className="absolute top-[56px] right-3 z-20 bg-black/70 backdrop-blur-md text-white/80 text-[10px] font-mono rounded-lg px-3 py-2 space-y-0.5 pointer-events-none">
            <div className="text-white/50 text-[9px] font-semibold uppercase tracking-wider mb-1">Dev Info</div>
            <div>RES: {stats.resolution}</div>
            <div>FPS: {stats.fps}</div>
            <div>Codec: {stats.codec}</div>
            <div>Bitrate: {stats.bitrate}</div>
        </div>
    );
}

// ─── In-room settings modal ─────────────────────────────────────────────────
type SoundKey = 'join' | 'leave' | 'mute' | 'unmute' | 'cameraOn' | 'cameraOff' | 'screenShareOn' | 'screenShareOff';
const SOUND_LABELS: { key: SoundKey; label: string }[] = [
    { key: 'join', label: 'Join' },
    { key: 'leave', label: 'Leave' },
    { key: 'mute', label: 'Mute' },
    { key: 'unmute', label: 'Unmute' },
    { key: 'cameraOn', label: 'Camera On' },
    { key: 'cameraOff', label: 'Camera Off' },
    { key: 'screenShareOn', label: 'Screen On' },
    { key: 'screenShareOff', label: 'Screen Off' },
];
const QUALITY_OPTIONS: VideoQuality[] = ['360p', '720p', '1080p', '1440p', '4K'];

function InRoomSettings({ onClose }: { onClose: () => void }) {
    const {
        soundsEnabled, soundVolume, videoQuality, showDevInfo, autoHideControlBar, noiseSuppression,
        setSoundsEnabled, setSoundVolume, setVideoQuality, setShowDevInfo, setAutoHideControlBar, setNoiseSuppression,
    } = useSettingsStore();
    const backdropRef = useRef<HTMLDivElement>(null);

    // Lock body scroll while settings modal is open
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    return (
        <div
            ref={backdropRef}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
        >
            <div className="bg-surface rounded-2xl shadow-xl border border-gray-100 w-full max-w-md mx-4 max-h-[80vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-surface rounded-t-2xl z-10">
                    <div className="flex items-center gap-2">
                        <Settings className="w-4 h-4 text-text-muted" />
                        <h2 className="text-sm font-semibold text-text-main">Settings</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-gray-100 transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Noise Suppression */}
                <div className="px-6 py-4 border-b border-gray-100">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Mic className="w-4 h-4 text-text-muted" />
                            <span className="text-sm font-medium text-text-main">Noise Suppression</span>
                        </div>
                        <button
                            onClick={() => setNoiseSuppression(!noiseSuppression)}
                            className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${noiseSuppression ? 'bg-primary' : 'bg-gray-200'}`}
                        >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${noiseSuppression ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                    </div>
                    <p className="text-[10px] text-text-muted mt-1">AI-powered background noise removal (RNNoise)</p>
                </div>

                {/* Video Quality */}
                <div className="px-6 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-2 mb-3">
                        <Monitor className="w-4 h-4 text-text-muted" />
                        <span className="text-sm font-semibold text-text-main">Video Quality</span>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        {QUALITY_OPTIONS.map(q => {
                            const p = VIDEO_PRESETS[q];
                            const bitLabel = p.maxBitrate >= 1_000_000
                                ? `${(p.maxBitrate / 1_000_000).toFixed(p.maxBitrate % 1_000_000 === 0 ? 0 : 1)} Mbps`
                                : `${(p.maxBitrate / 1000).toFixed(0)} kbps`;
                            return (
                                <button
                                    key={q}
                                    onClick={() => setVideoQuality(q)}
                                    className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all ${videoQuality === q
                                        ? 'bg-primary text-white shadow-sm'
                                        : 'bg-gray-100 text-text-main hover:bg-gray-200'
                                        }`}
                                >
                                    {q}
                                    <span className="block text-[10px] opacity-70 mt-0.5">{bitLabel}</span>
                                </button>
                            );
                        })}
                    </div>
                    <p className="text-[10px] text-text-muted mt-2">Higher quality uses more bandwidth. Takes effect when you next toggle camera/screen share.</p>
                </div>


                {/* Auto-hide Control Bar */}
                <div className="px-6 py-4 border-b border-gray-100">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-text-main">Auto-hide Controls</span>
                        <button
                            onClick={() => setAutoHideControlBar(!autoHideControlBar)}
                            className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${autoHideControlBar ? 'bg-primary' : 'bg-gray-200'}`}
                        >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${autoHideControlBar ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                    </div>
                    <p className="text-[10px] text-text-muted mt-1">Automatically hides controls after 4s of inactivity</p>
                </div>

                {/* Dev Info Toggle */}
                <div className="px-6 py-4 border-b border-gray-100">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-text-main">Developer Info Overlay</span>
                        <button
                            onClick={() => setShowDevInfo(!showDevInfo)}
                            className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${showDevInfo ? 'bg-primary' : 'bg-gray-200'}`}
                        >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${showDevInfo ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                    </div>
                    <p className="text-[10px] text-text-muted mt-1">Shows bitrate, resolution, codec & FPS</p>
                </div>

                {/* Sound Settings */}
                <div className="px-6 py-4">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <Bell className="w-4 h-4 text-text-muted" />
                            <span className="text-sm font-semibold text-text-main">Sound Effects</span>
                        </div>
                        <button
                            onClick={() => setSoundsEnabled(!soundsEnabled)}
                            className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${soundsEnabled ? 'bg-primary' : 'bg-gray-200'}`}
                        >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${soundsEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                    </div>
                    <div className={`transition-opacity ${soundsEnabled ? '' : 'opacity-40 pointer-events-none'}`}>
                        <div className="flex items-center gap-2 mb-3">
                            <VolumeX className="w-3 h-3 text-text-muted" />
                            <input
                                type="range" min={0} max={1} step={0.01} value={soundVolume}
                                onChange={(e) => setSoundVolume(parseFloat(e.target.value))}
                                className="flex-1 h-1 rounded-full accent-primary cursor-pointer"
                            />
                            <Volume2 className="w-3 h-3 text-text-muted" />
                            <span className="text-[10px] font-mono text-text-muted w-7 text-right">{Math.round(soundVolume * 100)}%</span>
                        </div>
                        <div className="grid grid-cols-4 gap-1.5">
                            {SOUND_LABELS.map(({ key, label }) => (
                                <button
                                    key={key}
                                    onClick={() => playSound(key, soundVolume)}
                                    className="text-[10px] font-medium text-primary border border-primary/20 bg-primary/5 hover:bg-primary/10 px-2 py-1 rounded-lg transition-colors truncate"
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Noise Suppression Hook ──────────────────────────────────────────────────
function NoiseSuppressionHook({
    processorRef,
    enabled,
}: {
    processorRef: React.MutableRefObject<NoiseSuppressionProcessor | null>;
    enabled: boolean;
}) {
    const room = useRoomContext();
    const appliedRef = useRef(false);
    const originalTrackRef = useRef<MediaStreamTrack | null>(null);

    useEffect(() => {
        const localP = room.localParticipant;

        const applyNoiseSuppression = async () => {
            // Find the published mic track
            const micPub = Array.from(localP.audioTrackPublications.values()).find(
                (p) => p.source === Track.Source.Microphone && p.track?.mediaStreamTrack
            );
            if (!micPub?.track?.mediaStreamTrack) return;

            if (enabled && !appliedRef.current) {
                try {
                    // Store original track for restoration
                    originalTrackRef.current = micPub.track.mediaStreamTrack;

                    // Create processor and get filtered stream
                    const processor = new NoiseSuppressionProcessor();
                    const originalStream = new MediaStream([micPub.track.mediaStreamTrack]);
                    const filteredStream = await processor.process(originalStream);
                    const filteredTrack = filteredStream.getAudioTracks()[0];

                    if (filteredTrack) {
                        // Replace the track's underlying media stream track
                        await micPub.track.replaceTrack(filteredTrack);
                        processorRef.current = processor;
                        appliedRef.current = true;
                    }
                } catch (err) {
                    console.error('[NoiseSuppression] Failed to apply:', err);
                }
            } else if (!enabled && appliedRef.current) {
                // Restore original track
                if (originalTrackRef.current) {
                    try {
                        await micPub.track.replaceTrack(originalTrackRef.current);
                    } catch {
                        // Original track might be ended, that's ok
                    }
                }
                processorRef.current?.destroy();
                processorRef.current = null;
                originalTrackRef.current = null;
                appliedRef.current = false;
            }
        };

        applyNoiseSuppression();

        // Listen for new mic track publications
        const handleTrackPublished = () => {
            if (enabled && !appliedRef.current) {
                // Small delay to let the track settle
                setTimeout(applyNoiseSuppression, 500);
            }
        };

        localP.on('localTrackPublished', handleTrackPublished);
        return () => {
            localP.off('localTrackPublished', handleTrackPublished);
        };
    }, [room, enabled, processorRef]);

    return null;
}

// ─── Video grid ───────────────────────────────────────────────────────────────
function CustomVideoConference() {
    useRoomSounds();

    const tracks = useTracks(
        [
            { source: Track.Source.Camera, withPlaceholder: true },
            { source: Track.Source.ScreenShare, withPlaceholder: false },
        ],
        { onlySubscribed: false },
    );

    const [spotlightTrack, setSpotlightTrack] = useState<TrackReferenceOrPlaceholder | null>(null);
    const handleSpotlight = useCallback((track: TrackReferenceOrPlaceholder | null) => {
        setSpotlightTrack(track);
    }, []);

    // Clear spotlight if the pinned track disappears (participant left or screen share ended)
    useEffect(() => {
        if (!spotlightTrack) return;
        const spotKey = `${spotlightTrack.participant?.identity ?? ''}-${spotlightTrack.source ?? ''}`;
        const stillPresent = tracks.some(
            t => trackKey(t, -1) === spotKey
        );
        if (!stillPresent) setSpotlightTrack(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tracks.map(t => trackKey(t, 0)).join(',')]);

    // ── SPOTLIGHT MODE ──────────────────────────────────────────────────────
    if (spotlightTrack) {
        const spotKey = `${spotlightTrack.participant?.identity ?? ''}-${spotlightTrack.source ?? ''}`;
        const otherTracks = tracks.filter(
            t => trackKey(t, -1) !== spotKey
        );

        return (
            <div className="absolute inset-0 pb-[76px] pt-[52px] flex flex-col">
                <div className="flex-1 flex flex-col sm:flex-row gap-1.5 sm:gap-2 p-1.5 sm:p-2 min-h-0">

                    {/* Main pinned tile — grid constrains height like grid mode */}
                    <div className="flex-1 min-w-0 min-h-0 grid grid-cols-1 auto-rows-fr">
                        <SpotlightableTile
                            trackRef={spotlightTrack}
                            isSpotlit={true}
                            onSpotlight={handleSpotlight}
                        />
                    </div>

                    {/* Sidebar — other participants */}
                    {otherTracks.length > 0 && (
                        <div className="flex flex-row sm:flex-col gap-1.5 sm:gap-2 w-full sm:w-44 shrink-0 overflow-x-auto sm:overflow-y-auto scrollbar-hide">
                            {otherTracks.map((track, i) => (
                                <div key={trackKey(track, i)} className="aspect-video w-28 sm:w-full shrink-0">
                                    <SpotlightableTile
                                        trackRef={track}
                                        isSpotlit={false}
                                        onSpotlight={handleSpotlight}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ── GRID MODE ───────────────────────────────────────────────────────────
    const count = tracks.length;
    // Mobile: 1 col for 1 track, 2 cols otherwise. Desktop: existing logic.
    const gridCols =
        count <= 1 ? 'grid-cols-1' :
            count <= 4 ? 'grid-cols-1 sm:grid-cols-2' :
                count <= 9 ? 'grid-cols-1 sm:grid-cols-3' :
                    'grid-cols-2 sm:grid-cols-4';

    return (
        <div className="absolute inset-0 pb-[76px] pt-[52px] flex flex-col">
            <div
                className={`flex-1 grid ${gridCols} gap-1.5 sm:gap-2 p-1.5 sm:p-2 auto-rows-fr`}
                style={{ minHeight: 0 }}
            >
                {tracks.map((track, i) => (
                    <SpotlightableTile
                        key={trackKey(track, i)}
                        trackRef={track}
                        isSpotlit={false}
                        onSpotlight={handleSpotlight}
                    />
                ))}
            </div>
        </div>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
    const router = useRouter();
    const { user, token: authToken } = useAuthStore();
    const [livekitToken, setLivekitToken] = useState<string>('');
    const [isSecureContext, setIsSecureContext] = useState<boolean>(true);
    const [mounted, setMounted] = useState(false);
    const [tokenError, setTokenError] = useState(false);
    const resolvedParams = React.use(params);
    const roomId = resolvedParams.roomId;

    // ── Chat state ────────────────────────────────────────────────────────────
    const [chatOpen, setChatOpen] = useState(false);
    const [unread, setUnread] = useState(0);
    const [copied, setCopied] = useState(false);
    const { videoQuality, showDevInfo, controlBarVisible, setControlBarVisible, autoHideControlBar, noiseSuppression } = useSettingsStore();
    const noiseProcessorRef = useRef<NoiseSuppressionProcessor | null>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const qPreset = VIDEO_PRESETS[videoQuality];

    // Ensure control bar is always visible on mount
    useEffect(() => {
        setControlBarVisible(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-hide control bar after 4s of inactivity
    useEffect(() => {
        if (!autoHideControlBar || !controlBarVisible) return;
        const timer = setTimeout(() => setControlBarVisible(false), 4000);
        (window as unknown as Record<string, unknown>).__controlBarTimer = timer as unknown;
        return () => clearTimeout(timer);
    }, [autoHideControlBar, controlBarVisible, setControlBarVisible]);

    // Clean up noise processor on unmount
    useEffect(() => {
        return () => {
            noiseProcessorRef.current?.destroy();
            noiseProcessorRef.current = null;
        };
    }, []);

    const { messages, sendMessage, connected } = useChatSocket({
        roomId,
        token: authToken,
        userName: user?.name ?? 'Anonymous',
    });

    // Increment unread when sidebar is closed and new message arrives
    const prevLengthRef = React.useRef(0);
    useEffect(() => {
        if (messages.length > prevLengthRef.current) {
            if (!chatOpen) setUnread(u => u + (messages.length - prevLengthRef.current));
        }
        prevLengthRef.current = messages.length;
    }, [messages.length, chatOpen]);

    const handleRead = useCallback(() => setUnread(0), []);

    useEffect(() => { setMounted(true); }, []);
    useEffect(() => {
        if (typeof window !== 'undefined' && !navigator.mediaDevices) setIsSecureContext(false);
    }, []);
    useEffect(() => {
        if (!mounted) return;
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
    }, [user, roomId, router, mounted, authToken]);

    // Escape key closes chat sidebar
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && chatOpen) setChatOpen(false);
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [chatOpen]);

    const handleCopyLink = () => {
        navigator.clipboard.writeText(window.location.href);
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

    if (!livekitToken) {
        return (
            <div className="flex-1 flex items-center justify-center min-h-[50vh]">
                <div className="animate-pulse flex flex-col items-center">
                    <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin mb-4" />
                    <p className="text-text-muted font-medium">Connecting to room…</p>
                </div>
            </div>
        );
    }

    if (!isSecureContext) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] px-4">
                <div className="bg-surface shadow-flat border border-gray-100 rounded-2xl p-8 max-w-md w-full text-center flex flex-col items-center">
                    <div className="w-16 h-16 bg-red-50 text-primary rounded-full flex items-center justify-center mb-6">
                        <AlertCircle className="w-8 h-8" />
                    </div>
                    <h2 className="text-2xl font-bold text-text-main mb-3">Camera Access Blocked</h2>
                    <p className="text-text-muted mb-6 leading-relaxed">WebRTC erfordert <strong>HTTPS</strong> oder <strong>localhost</strong>.</p>
                    <button onClick={() => router.push('/dashboard')} className="w-full py-2.5 px-6 bg-primary text-white rounded-xl font-medium hover:bg-[#E0484D] transition-colors">
                        Zurück zum Dashboard
                    </button>
                </div>
            </div>
        );
    }

    const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || 'ws://localhost:7880';

    return (
        <div
            className="fixed inset-0 top-16 bg-gray-950 overflow-hidden transition-[padding-right] duration-300"
            style={{ paddingRight: chatOpen && typeof window !== 'undefined' && window.innerWidth >= 640 ? '320px' : '0px' }}
        >
            {/* Top bar */}
            <div className="absolute top-0 left-0 right-0 h-[52px] z-10 flex items-center px-2 sm:px-4 gap-1.5 sm:gap-3 overflow-x-auto scrollbar-hide">
                <div className="flex items-center gap-2 bg-white/90 backdrop-blur-md border border-[rgba(220,220,220,0.85)] rounded-full px-2.5 sm:px-3.5 py-1.5 shadow-sm shrink-0">
                    <span className="relative flex h-2 w-2 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                    </span>
                    <span className="text-text-main text-xs font-semibold capitalize select-none truncate max-w-[100px] sm:max-w-none">
                        {decodeURIComponent(roomId)
                            .replace(/-\d{1,5}$/, '')
                            .replace(/-/g, ' ')
                            .replace(/\b\w/g, c => c.toUpperCase())}
                    </span>
                </div>

                {/* Copy link button */}
                <button
                    onClick={handleCopyLink}
                    aria-label="Copy room link"
                    className="shrink-0 flex items-center gap-1.5 bg-white/90 hover:bg-white border border-[rgba(220,220,220,0.85)] hover:border-primary/40 text-text-main hover:text-primary rounded-full px-2.5 sm:px-3.5 py-1.5 text-xs font-medium transition-all duration-150 backdrop-blur-md shadow-sm"
                >
                    {copied ? <Check className="w-3 h-3 text-green-500" /> : <Link2 className="w-3 h-3" />}
                    <span className="hidden sm:inline">{copied ? 'Copied!' : 'Share'}</span>
                </button>

                <div className="flex-1 min-w-[8px]" />

                {/* Settings gear */}
                <button
                    onClick={() => setSettingsOpen(true)}
                    aria-label="Settings"
                    className="shrink-0 flex items-center gap-1.5 bg-white/90 hover:bg-white border border-[rgba(220,220,220,0.85)] hover:border-primary/40 text-text-main hover:text-primary rounded-full px-2.5 sm:px-3.5 py-1.5 text-xs font-medium transition-all duration-150 backdrop-blur-md shadow-sm"
                >
                    <Settings className="w-3 h-3" />
                    <span className="hidden sm:inline">Settings</span>
                </button>

                {/* Chat toggle button lives inside ChatSidebar */}
                <ChatSidebar
                    roomId={roomId}
                    currentUserId={user?.id ?? ''}
                    messages={messages}
                    sendMessage={sendMessage}
                    connected={connected}
                    isOpen={chatOpen}
                    onToggle={() => setChatOpen(o => !o)}
                    unreadCount={unread}
                    onRead={handleRead}
                />

                <button
                    onClick={() => router.push('/dashboard')}
                    className="shrink-0 flex items-center gap-1.5 bg-white/90 hover:bg-white border border-[rgba(220,220,220,0.85)] hover:border-primary/40 text-text-main hover:text-primary rounded-full px-2.5 sm:px-3.5 py-1.5 text-xs font-medium transition-all duration-150 backdrop-blur-md shadow-sm"
                >
                    <X className="w-3 h-3" />
                    <span className="hidden sm:inline">Leave</span>
                </button>
            </div>

            <LiveKitRoom
                video={false}
                audio={false}
                token={livekitToken}
                serverUrl={serverUrl}
                data-lk-theme="default"
                style={{ height: '100%', width: '100%', background: 'transparent', position: 'relative' }}
                onDisconnected={() => router.push('/dashboard')}
                options={{
                    videoCaptureDefaults: {
                        resolution: { width: qPreset.width, height: qPreset.height, frameRate: qPreset.frameRate },
                    },
                    publishDefaults: {
                        videoCodec: 'vp9',
                        videoEncoding: {
                            maxBitrate: qPreset.maxBitrate,
                            maxFramerate: qPreset.frameRate,
                        },
                        screenShareEncoding: {
                            maxBitrate: 5_000_000,
                            maxFramerate: 60,
                        },
                    },
                }}
            >
                <AutoStartAudio />
                <ChevronRotationFix />
                <NoiseSuppressionHook processorRef={noiseProcessorRef} enabled={noiseSuppression} />
                <CustomVideoConference />
                <RoomAudioRenderer />
                {showDevInfo && <DevInfoOverlay />}

                {/* Collapsible control bar */}
                {controlBarVisible ? (
                    <div
                        className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-20 transition-opacity duration-200 ${chatOpen ? 'max-sm:opacity-0 max-sm:pointer-events-none' : ''}`}
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
                        <div className="bg-white/90 backdrop-blur-md border border-white/60 rounded-full shadow-lg px-3 py-1.5 flex items-center">
                            <ControlBar
                                controls={{ camera: true, microphone: true, screenShare: true, chat: false, leave: false }}
                            />
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={() => setControlBarVisible(true)}
                        className={`fixed bottom-3 left-1/2 -translate-x-1/2 z-20 bg-white/80 hover:bg-white backdrop-blur-md border border-white/60 rounded-full shadow-lg p-2 transition-all duration-200 hover:scale-105 ${chatOpen ? 'max-sm:opacity-0 max-sm:pointer-events-none' : ''}`}
                        title="Show controls"
                    >
                        <ChevronUp className="w-4 h-4 text-text-main" />
                    </button>
                )}
            </LiveKitRoom>

            {settingsOpen && <InRoomSettings onClose={() => setSettingsOpen(false)} />}
        </div>
    );
}
