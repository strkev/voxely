"use client";

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { useSettingsStore, VIDEO_PRESETS, type VideoQuality, type ScreenShareResolution, type ScreenShareFps } from '@/store/useSettingsStore';
import {
    LiveKitRoom,
    RoomAudioRenderer,
    ControlBar,
    ParticipantTile,
    useTracks,
    useRoomContext,
    useIsSpeaking,
    useIsMuted,
    TrackReferenceOrPlaceholder,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Track, LocalTrackPublication, RemoteAudioTrack } from 'livekit-client';
import { AlertCircle, Star, X, Link2, Check, Settings, Monitor, Volume2, VolumeX, Bell, ChevronUp, ChevronLeft, ChevronRight, Mic, MicOff, Users, ScreenShare, LogOut, Moon, Lock, Unlock, Image as ImageIcon, Sun, Palette } from 'lucide-react';
import { useRoomSounds } from '@/hooks/useRoomSounds';
import { useChatSocket, ChatMessage } from '@/hooks/useChatSocket';
import { ChatSidebar } from '@/components/ChatSidebar';
import { playSound } from '@/lib/sounds';
import { NoiseSuppressionProcessor } from '@/lib/rnnoise-processor';
import { FriendsSidebar } from '@/components/FriendsSidebar';
import { FriendRequestsModal } from '@/components/FriendRequestsModal';
import { VirtualBackgroundModal } from '@/components/VirtualBackgroundModal';
import { RoomInviteBanner } from '@/components/RoomInviteBanner';
import { useFriendsSocket } from '@/hooks/useFriendsSocket';
import { useLeaveGuardStore } from '@/store/useLeaveGuardStore';
import { useFriendsStore } from '@/store/useFriendsStore';
import { getContrastColor } from '@/lib/colors';

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

    const participantName = trackRef?.participant?.name || trackRef?.participant?.identity || 'Unknown';
    const initial = participantName.charAt(0).toUpperCase();
    const isCameraTrack = trackRef?.source === Track.Source.Camera;
    const isMuted = useIsMuted({ participant: trackRef?.participant, source: Track.Source.Microphone } as TrackReferenceOrPlaceholder);

    const localUser = useAuthStore(s => s.user);
    const friends = useFriendsStore(s => s.friends);
    let userColor = '#FF5A5F';

    const [volume, setVolume] = useState(1);
    const [isLocallyMuted, setIsLocallyMuted] = useState(false);
    const [isVolumeExpanded, setIsVolumeExpanded] = useState(false);

    // Sync volume and mute state
    useEffect(() => {
        const participant = trackRef?.participant;
        if (!participant || participant.isLocal) return;

        const targetVol = isLocallyMuted ? 0 : volume;

        const sync = () => {
            const pubs = Array.from(participant.audioTrackPublications.values());
            pubs.forEach(pub => {
                const track = pub.track;
                if (!track) return;

                // Use LiveKit native volume (0-1) - only on RemoteAudioTrack
                if (track instanceof RemoteAudioTrack) {
                    track.setVolume(Math.min(1, targetVol));
                }

                // Firefox/Safari extra safety: explicitly mute elements
                track.attachedElements.forEach(el => {
                    const audioEl = el as HTMLAudioElement;
                    audioEl.muted = (targetVol === 0);
                    if (targetVol === 0) {
                        audioEl.volume = 0;
                    }
                });
            });
        };

        sync();

        // Listen for track changes/attachments to keep volume in sync
        // Using string event names for safety
        participant.on('trackSubscribed', sync);
        participant.on('trackUnsubscribed', sync);

        return () => {
            participant.off('trackSubscribed', sync);
            participant.off('trackUnsubscribed', sync);
        };
    }, [volume, isLocallyMuted, trackRef?.participant]);

    // Farbe für andere Teilnehmer aus Metadaten auslesen (Fallback)
    try {
        if (trackRef?.participant?.metadata) {
            const meta = JSON.parse(trackRef.participant.metadata);
            if (meta.avatarColor) userColor = meta.avatarColor;
        }
    } catch { /* ignore */ }

    // Farbe aus dem Friends-Store überschreibt Metadaten (für Echtzeit-Updates)
    if (!trackRef?.participant?.isLocal && trackRef?.participant?.identity) {
        const friend = friends.find(f => f.id === trackRef.participant!.identity);
        if (friend?.avatarColor) {
            userColor = friend.avatarColor;
        }
    }

    // Farbe für einen selbst direkt aus dem AuthStore (updated sofort)
    if (trackRef?.participant?.isLocal && localUser?.avatarColor) {
        userColor = localUser.avatarColor;
    }

    return (
        <div
            className={`relative w-full h-full group rounded-[16px] transition-shadow duration-200 ${isScreenShare ? 'lk-screen-share-tile' : ''}`}
            style={{
                containerType: 'inline-size',
                '--user-color': userColor
            } as React.CSSProperties}
        >
            {/* HINTERGRUND-AVATAR: Liegt unter dem Video (z-0). 
                Wird als Fallback gerendert. */}
            {isCameraTrack && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 bg-[#111] rounded-[16px]">
                    <div
                        className={`w-[32%] max-w-[120px] min-w-[40px] aspect-square rounded-full flex items-center justify-center font-bold shadow-md transition-transform duration-200 ${isSpeaking ? 'avatar-speaking' : ''}`}
                        style={{
                            fontSize: 'clamp(18px, 12cqw, 54px)',
                            backgroundColor: userColor,
                            color: getContrastColor(userColor)
                        }}
                    >
                        {initial}
                    </div>
                </div>
            )}

            {/* LIVEKIT TILE: Wird in z-10 gewrappt. */}
            <div className={`relative w-full h-full z-10 lk-custom-tile-wrapper ${isMuted ? 'is-muted' : ''}`}>
                <ParticipantTile trackRef={trackRef} />
                
                {/* Custom Participant Name & Status Badge */}
                <div className="absolute bottom-1.5 left-1.5 z-20 flex items-center gap-2 bg-black/55 backdrop-blur-md px-2 py-1 rounded-md border border-white/5 pointer-events-none">
                    <div className={`p-0.5 rounded-sm flex items-center justify-center ${isMuted ? 'text-primary' : 'text-green-500'}`}>
                        {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </div>
                    <span className="text-[16px] font-semibold text-white/90 truncate max-w-[150px]">
                        {participantName}
                    </span>
                </div>
            </div>

            {/* Spotlight toggle — auf z-20 erhöht, damit es über dem Video bleibt */}
            {onSpotlight && (
                <button
                    onClick={() => onSpotlight(isSpotlit ? null : (trackRef ?? null))}
                    title={isSpotlit ? 'Spotlight entfernen' : 'Spotlight'}
                    className={`
                        absolute top-2 right-2 z-20 p-1.5 rounded-lg backdrop-blur-md
                        transition-all duration-200
                        ${isSpotlit
                            ? 'bg-amber-400/90 text-white opacity-100 shadow-md'
                            : 'bg-black/40 text-white/70 opacity-100 hover:bg-black/60 hover:text-white'}
                    `}
                >
                    <Star className={`w-4 h-4 ${isSpotlit ? 'fill-white' : ''}`} />
                </button>
            )}

            {/* Spotlight badge when pinned */}
            {isSpotlit && (
                <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 bg-amber-400/90 text-white text-xs font-semibold px-2.5 py-1 rounded-full backdrop-blur-sm pointer-events-none shadow-md">
                    <Star className="w-3 h-3 fill-white" />
                    Spotlight
                </div>
            )}

            {/* Audio Controls (Volume & Mute) — Only for remote participants */}
            {trackRef?.participant && !trackRef.participant.isLocal && (
                <div 
                    className={`
                        absolute top-2 left-2 z-20 flex items-center p-1.5 rounded-lg backdrop-blur-md bg-black/40 shadow-md transition-opacity duration-200
                        ${isSpotlit ? 'top-10' : ''} 
                        opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 group/volume
                    `}
                    onClick={(e) => e.stopPropagation()} /* Prevent triggering Spotlight on click */
                >
                    <button
                        onClick={() => setIsLocallyMuted(!isLocallyMuted)}
                        className="text-white hover:text-primary transition-colors focus:outline-none shrink-0"
                        title={isLocallyMuted ? "Unmute locally" : "Mute locally"}
                    >
                        {isLocallyMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>

                    {!isVolumeExpanded && (
                        <button
                            onClick={() => setIsVolumeExpanded(true)}
                            className="ml-2 text-white/70 hover:text-white sm:hidden shrink-0"
                            title="Expand volume slider"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    )}

                    <div className={`flex items-center overflow-hidden transition-all duration-300 ${isVolumeExpanded ? 'w-44 ml-2 opacity-100' : 'w-0 opacity-0'} sm:w-0 sm:ml-0 sm:opacity-0 sm:group-hover/volume:w-36 sm:group-hover/volume:ml-2 sm:group-hover/volume:opacity-100 focus-within:w-44 focus-within:ml-2 focus-within:opacity-100`}>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={isLocallyMuted ? 0 : volume}
                            onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                setVolume(val);
                                if (val > 0 && isLocallyMuted) setIsLocallyMuted(false);
                            }}
                            className="w-20 sm:w-24 h-1.5 rounded-full appearance-none bg-white/30 cursor-pointer shrink-0"
                            style={{
                                background: `linear-gradient(to right, #FF5A5F ${(isLocallyMuted ? 0 : volume) * 100}%, rgba(255,255,255,0.3) ${(isLocallyMuted ? 0 : volume) * 100}%)`
                            }}
                            title="Adjust volume locally"
                        />
                        <span className="text-[10px] font-mono text-white/90 w-10 text-right shrink-0">
                            {isLocallyMuted ? '0%' : `${Math.round(volume * 100)}%`}
                        </span>
                        
                        <div className="flex-1 sm:hidden" />
                        
                        {isVolumeExpanded && (
                            <button
                                onClick={() => setIsVolumeExpanded(false)}
                                className="pl-2 text-white/70 hover:text-white sm:hidden shrink-0"
                                title="Collapse volume slider"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                        )}
                    </div>
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
const SCREEN_RES_OPTIONS: ScreenShareResolution[] = ['720p', '1080p', '1440p', '4K', 'Source'];
const SCREEN_FPS_OPTIONS: ScreenShareFps[] = [5, 15, 30, 60];

function InRoomSettings({ onClose, onOpenVirtualBackground }: { onClose: () => void, onOpenVirtualBackground: () => void }) {
    const {
        soundsEnabled, soundVolume, videoQuality, showDevInfo, autoHideControlBar, noiseSuppression,
        screenShareResolution, screenShareFps, theme, setTheme,
        setSoundsEnabled, setSoundVolume, setVideoQuality, setShowDevInfo, setAutoHideControlBar, setNoiseSuppression,
        setScreenShareResolution, setScreenShareFps,
    } = useSettingsStore();

    const backdropRef = useRef<HTMLDivElement>(null);

    // Lock body scroll while settings modal is open
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    if (typeof document === 'undefined') return null;

    return createPortal(
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
                        <h2 className="text-sm font-semibold text-text-main">Room Settings</h2>
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

                {/* Virtual Background */}
                <div className="px-6 py-4 border-b border-gray-100">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <ImageIcon className="w-4 h-4 text-text-muted" />
                            <span className="text-sm font-medium text-text-main">Virtual Background</span>
                        </div>
                        <button
                            onClick={() => {
                                onClose();
                                onOpenVirtualBackground();
                            }}
                            className="bg-gray-100 hover:bg-gray-200 text-text-main px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                        >
                            Configure
                        </button>
                    </div>
                    <p className="text-[10px] text-text-muted mt-1">Blur your background or use a custom image.</p>
                </div>

                {/* Camera Quality */}
                <div className="px-6 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-2 mb-3">
                        <Monitor className="w-4 h-4 text-text-muted" />
                        <span className="text-sm font-semibold text-text-main">Camera Quality</span>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        {QUALITY_OPTIONS.map(q => (
                            <button
                                key={q}
                                onClick={() => setVideoQuality(q)}
                                className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all ${videoQuality === q
                                    ? 'bg-primary text-white shadow-sm'
                                    : 'bg-gray-100 text-text-main hover:bg-gray-200'
                                    }`}
                            >
                                {q}
                            </button>
                        ))}
                    </div>
                    <p className="text-[10px] text-text-muted mt-2">Changes apply immediately to your camera stream.</p>
                </div>

                {/* Screen Share Quality */}
                <div className="px-6 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-2 mb-3">
                        <ScreenShare className="w-4 h-4 text-text-muted" />
                        <span className="text-sm font-semibold text-text-main">Screen Share Quality</span>
                    </div>

                    {/* Resolution */}
                    <p className="text-[10px] font-medium text-text-muted mb-1.5 uppercase tracking-wider">Resolution</p>
                    <div className="flex gap-1.5 flex-wrap mb-3">
                        {SCREEN_RES_OPTIONS.map(r => (
                            <button
                                key={r}
                                onClick={() => setScreenShareResolution(r)}
                                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${screenShareResolution === r
                                    ? 'bg-primary text-white shadow-sm'
                                    : 'bg-gray-100 text-text-main hover:bg-gray-200'
                                    }`}
                            >
                                {r}
                            </button>
                        ))}
                    </div>

                    {/* FPS */}
                    <p className="text-[10px] font-medium text-text-muted mb-1.5 uppercase tracking-wider">Frame Rate</p>
                    <div className="flex gap-1.5 flex-wrap">
                        {SCREEN_FPS_OPTIONS.map(f => (
                            <button
                                key={f}
                                onClick={() => setScreenShareFps(f)}
                                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${screenShareFps === f
                                    ? 'bg-primary text-white shadow-sm'
                                    : 'bg-gray-100 text-text-main hover:bg-gray-200'
                                    }`}
                            >
                                {f} fps
                            </button>
                        ))}
                    </div>
                    <p className="text-[10px] text-text-muted mt-2">&quot;Source&quot; streams at your native screen resolution. Changes apply on next screen share.</p>
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
                <div className="px-6 py-4 border-b border-gray-100">
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

                {/* Appearance / Theme */}
                <div className="px-6 py-4 border-b border-gray-100">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Palette className="w-4 h-4 text-text-muted" />
                            <span className="text-sm font-semibold text-text-main">Appearance</span>
                        </div>
                        <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-200">
                            {(['light', 'dark', 'system'] as const).map((value) => {
                                const options = {
                                    light: { icon: Sun, label: 'Light' },
                                    dark: { icon: Moon, label: 'Dark' },
                                    system: { icon: Monitor, label: 'System' }
                                };
                                const { icon: Icon, label } = options[value];
                                const isActive = theme === value;
                                return (
                                    <button
                                        key={value}
                                        onClick={() => setTheme(value)}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all ${isActive
                                                ? 'bg-white text-primary shadow-sm ring-1 ring-black/5'
                                                : 'text-text-muted hover:text-text-main'
                                            }`}
                                        title={`${label} Mode`}
                                    >
                                        <Icon className="w-3.5 h-3.5" />
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}

// ─── Live Video Quality Sync ─────────────────────────────────────────────────
// Watches the settings store and applies quality changes to the active tracks
// without requiring a rejoin.
function LiveVideoQualitySync() {
    const room = useRoomContext();
    const { videoQuality, screenShareResolution, screenShareFps } = useSettingsStore();
    const prevVideoQualityRef = useRef(videoQuality);
    const prevScreenResRef = useRef(screenShareResolution);
    const prevScreenFpsRef = useRef(screenShareFps);

    useEffect(() => {
        if (prevVideoQualityRef.current === videoQuality) return;
        prevVideoQualityRef.current = videoQuality;

        const localP = room.localParticipant;
        const qPreset = VIDEO_PRESETS[videoQuality];

        // Update any published camera tracks
        const cameraPubs = Array.from(localP.videoTrackPublications.values()).filter(
            p => p.source === Track.Source.Camera && p.track
        );

        for (const pub of cameraPubs) {
            if (!pub.track) continue;
            // Restart the camera track with new constraints
            pub.track.restartTrack({
                width: qPreset.width,
                height: qPreset.height,
                frameRate: qPreset.frameRate,
            }).catch(err => console.warn('[LiveQualitySync] Failed to restart camera track:', err));
        }
    }, [room, videoQuality]);

    // Track screen share setting changes for next screen share
    useEffect(() => {
        prevScreenResRef.current = screenShareResolution;
    }, [screenShareResolution]);

    useEffect(() => {
        prevScreenFpsRef.current = screenShareFps;
    }, [screenShareFps]);

    return null;
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


// ─── Virtual Background Hook ──────────────────────────────────────────────────
function VirtualBackgroundHook({
    processorRef,
    bgOption,
    bgImage,
    blurRadius,
}: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    processorRef: React.MutableRefObject<any>;
    bgOption: 'none' | 'blur' | 'image';
    bgImage: string | null;
    blurRadius: number;
}) {
    const room = useRoomContext();
    const lastTrackSidRef = useRef<string | undefined>(undefined);

    useEffect(() => {
        const localP = room.localParticipant;

        const applyBackground = async () => {
            // Find the published camera track
            const camPub = Array.from(localP.videoTrackPublications.values()).find(
                (p) => p.source === Track.Source.Camera && p.track
            );
            const camTrack = camPub?.videoTrack;
            
            if (!camTrack || camTrack.mediaStreamTrack.readyState !== 'live') {
                lastTrackSidRef.current = undefined;
                return;
            }

            // DIMENSION CHECK: Wait for track resolution to be known (means frames are flowing)
            if (!camTrack.dimensions) {
                console.log('[VirtualBackground] Waiting for track dimensions...');
                setTimeout(applyBackground, 300);
                return;
            }

            try {
                // If the track SID changed, we MUST recreate the processor to avoid WebGL context issues
                if (lastTrackSidRef.current !== camTrack.sid) {
                    console.log('[VirtualBackground] Track changed. Recreating processor for:', camTrack.sid);
                    
                    if (processorRef.current) {
                        try {
                            await processorRef.current.destroy();
                        } catch (e) {
                            console.warn('[VirtualBackground] Error destroying old processor:', e);
                        }
                        processorRef.current = null;
                    }

                    const { BackgroundProcessor } = await import('@livekit/track-processors');
                    processorRef.current = BackgroundProcessor({ mode: 'disabled' });
                    
                    await camTrack.setProcessor(processorRef.current);
                    lastTrackSidRef.current = camTrack.sid;
                }

                if (!processorRef.current) return;

                // Switch to the correct mode
                if (bgOption === 'none') {
                    await processorRef.current.switchTo({ mode: 'disabled' });
                } else if (bgOption === 'blur') {
                    await processorRef.current.switchTo({ mode: 'background-blur', blurRadius });
                } else if (bgOption === 'image' && bgImage) {
                    await processorRef.current.switchTo({ mode: 'virtual-background', imagePath: bgImage });
                }
            } catch (err) {
                console.error('[VirtualBackground] Failed to apply:', err);
                // Reset on error so we try again next time
                lastTrackSidRef.current = undefined;
            }
        };

        applyBackground();

        const handleTrackPublished = (pub: LocalTrackPublication) => {
            if (pub.source === Track.Source.Camera) {
                // Larger delay to let the track fully initialize and avoid "no video frame" error
                // Especially important during quality switches where the underlying stream changes
                setTimeout(applyBackground, 1200);
            }
        };

        localP.on('localTrackPublished', handleTrackPublished);

        return () => {
            localP.off('localTrackPublished', handleTrackPublished);
        };
    }, [room, bgOption, bgImage, blurRadius, processorRef]);

    // Final cleanup when component unmounts
    useEffect(() => {
        return () => {
            if (processorRef.current) {
                console.log('[VirtualBackground] Cleaning up processor on unmount');
                processorRef.current.destroy().catch(() => {});
                processorRef.current = null;
                lastTrackSidRef.current = undefined;
            }
        };
    }, [processorRef]);

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
            <div className="absolute inset-0 pb-[76px] pt-[64px] flex flex-col">
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
        <div className="absolute inset-0 pb-[76px] pt-[64px] flex flex-col">
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
    const { soundsEnabled, soundVolume, videoQuality, showDevInfo, controlBarVisible, setControlBarVisible, autoHideControlBar, noiseSuppression, screenShareFps, virtualBackground, virtualBackgroundImage, blurRadius } = useSettingsStore();
    const noiseProcessorRef = useRef<NoiseSuppressionProcessor | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bgProcessorRef = useRef<any>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [virtualBackgroundOpen, setVirtualBackgroundOpen] = useState(false);
    const [showFriendsModal, setShowFriendsModal] = useState(false);
    const [friendsSidebarOpen, setFriendsSidebarOpen] = useState(false);
    const [toastMessage, setToastMessage] = useState<{ id: string; name: string; text: string } | null>(null);
    const toastTimerRef = useRef<NodeJS.Timeout | null>(null);
    const qPreset = VIDEO_PRESETS[videoQuality];

    // Friends state & socket
    const incomingRequests = useFriendsStore(s => s.incomingRequests);
    const friendsSocketRef = useFriendsSocket(authToken);

    const handleToggleOpenRoom = useCallback((isOpen: boolean) => {
        const socket = friendsSocketRef.current;
        if (!socket) return;
        const roomName = decodeURIComponent(roomId)
            .replace(/-\d{1,5}$/, '')
            .replace(/-/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
        socket.emit('room:set-open', { roomId, isOpen, roomName });
    }, [friendsSocketRef, roomId]);

    const handleInviteFriend = useCallback((friendId: string) => {
        const socket = friendsSocketRef.current;
        if (!socket) return;
        // Get human-readable room name from slug
        const roomName = decodeURIComponent(roomId)
            .replace(/-\d{1,5}$/, '')
            .replace(/-/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
        socket.emit('friend:invite', { friendId, roomId, roomName });
    }, [friendsSocketRef, roomId]);

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

    // Clean up processors on unmount
    useEffect(() => {
        return () => {
            noiseProcessorRef.current?.destroy();
            noiseProcessorRef.current = null;
            bgProcessorRef.current?.destroy();
            bgProcessorRef.current = null;
        };
    }, []);

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
        document.body.style.setProperty('background-color', '#030712', 'important');
        document.documentElement.style.setProperty('background-color', '#030712', 'important');
        return () => {
            document.body.style.backgroundColor = bodyBg;
            document.documentElement.style.backgroundColor = htmlBg;
        };
    }, []);

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
            className="fixed inset-0 top-16 bg-gray-950 overflow-hidden transition-[padding-right] duration-300"
            style={{ paddingRight: chatOpen && typeof window !== 'undefined' && window.innerWidth >= 640 ? `${chatSidebarWidth}px` : '0px' }}
        >
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
                            maxBitrate: 50_000_000, // Effectively unlimited
                            maxFramerate: screenShareFps,
                        },
                        screenShareSimulcastLayers: [],
                    },
                }}
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

                    {/* Open Room Status Indicator */}
                    {/* Settings gear */}
                    <button
                        onClick={() => setSettingsOpen(true)}
                        aria-label="Settings"
                        className="shrink-0 flex items-center bg-white/90 hover:bg-white border border-[rgba(220,220,220,0.85)] hover:border-primary/40 text-text-main hover:text-primary rounded-2xl px-3 py-2.5 sm:px-4 sm:py-2.5 text-sm font-medium transition-all duration-150 backdrop-blur-md shadow-sm"
                    >
                        <Settings className="w-4 h-4" />
                        <span className={`topbar-btn-inner ${isCompact ? 'topbar-btn-inner--compact' : ''}`}>Settings</span>
                    </button>

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
                <ChevronRotationFix />
                <LiveVideoQualitySync />
                <NoiseSuppressionHook processorRef={noiseProcessorRef} enabled={noiseSuppression} />
                <VirtualBackgroundHook processorRef={bgProcessorRef} bgOption={virtualBackground} bgImage={virtualBackgroundImage} blurRadius={blurRadius} />
                <CustomVideoConference />
                <RoomAudioRenderer />
                {showDevInfo && <DevInfoOverlay />}

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
                        <div className="bg-white/90 backdrop-blur-md border border-white/60 rounded-full shadow-lg px-3 py-1.5 flex items-center">
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
            </LiveKitRoom>

            {settingsOpen && <InRoomSettings onClose={() => setSettingsOpen(false)} onOpenVirtualBackground={() => setVirtualBackgroundOpen(true)} />}
            {virtualBackgroundOpen && <VirtualBackgroundModal onClose={() => setVirtualBackgroundOpen(false)} />}

            {/* Friends Sidebar — toggle overlay */}
            {friendsSidebarOpen && (
                <>
                    {/* Invisible backdrop to capture outside clicks */}
                    <div
                        className="fixed inset-0 z-40 bg-transparent"
                        onClick={() => setFriendsSidebarOpen(false)}
                    />
                    {/* Wrapper with !static and !h-full to prevent Mobile Safari from shifting the sticky sidebar upwards and hiding its header */}
                    <div className="fixed top-16 left-0 bottom-0 z-50 [&_.friends-sidebar]:!static [&_.friends-sidebar]:!h-full">
                        <FriendsSidebar
                            currentRoomId={roomId}
                            isRoomOpen={isRoomOpen}
                            onInvite={handleInviteFriend}
                            onOpenRequests={() => setShowFriendsModal(true)}
                            onClose={() => setFriendsSidebarOpen(false)}
                            onToggleOpen={handleToggleOpenRoom}
                        />
                    </div>
                </>
            )}

            {/* Room Invite Banner */}
            <RoomInviteBanner />

            {/* Leave confirmation modal overlay — portaled to body to ensure it stays above all other UI */}
            {pendingTarget && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-transparent backdrop-blur-sm p-4"  style={{ backgroundColor: 'rgba(0,0,0,0.4)', pointerEvents: 'auto' }}>
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
