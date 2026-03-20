"use client";

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { useSettingsStore, VIDEO_PRESETS, type NoiseSuppressionMode } from '@/store/useSettingsStore';
import {
    LiveKitRoom,
    RoomAudioRenderer,
    ControlBar,
    ParticipantTile,
    useTracks,
    useRoomContext,
    useIsSpeaking,
    useIsMuted,
    useParticipants,
    useLocalParticipant,
    TrackReferenceOrPlaceholder,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Track, LocalTrackPublication, RemoteAudioTrack, RoomEvent } from 'livekit-client';
import { AlertCircle, Link2, Check, Volume2, VolumeX, ChevronUp, ChevronLeft, ChevronRight, Mic, MicOff, Users, LogOut, Lock, Unlock, Maximize, ImageIcon } from 'lucide-react';
import { useRoomSounds } from '@/hooks/useRoomSounds';
import { useChatSocket, ChatMessage } from '@/hooks/useChatSocket';
import { ChatSidebar } from '@/components/ChatSidebar';
import { playSound } from '@/lib/sounds';
import { NoiseSuppressionProcessor } from '@/lib/rnnoise-processor';
import { NativeNoiseProcessor } from '@/lib/native-noise-processor';
import { FilterNoiseProcessor } from '@/lib/filter-noise-processor';
import { FriendsSidebar } from '@/components/FriendsSidebar';
import { FriendRequestsModal } from '@/components/FriendRequestsModal';
import { RoomInviteBanner } from '@/components/RoomInviteBanner';
import { useFriends } from '@/components/FriendsProvider';
import { useLeaveGuardStore } from '@/store/useLeaveGuardStore';
import { useFriendsStore } from '@/store/useFriendsStore';
import { getContrastColor } from '@/lib/colors';
import { SettingsModal } from '@/components/SettingsModal';


// ─── Auto-start audio ─────────────────────────────────────────────────────────
function AutoStartAudio() {
    const room = useRoomContext();
    const [isAudioAllowed, setIsAudioAllowed] = useState(true);

    useEffect(() => {
        const handleAudioStatusChanged = (playing: boolean) => {
            console.log('[AutoStartAudio] status changed, playing:', playing);
            setIsAudioAllowed(playing);
        };

        room.on(RoomEvent.AudioPlaybackStatusChanged, handleAudioStatusChanged);

        // Initial check/start
        room.startAudio().catch(() => {
            console.warn('[AutoStartAudio] initial playback blocked');
            setIsAudioAllowed(false);
        });

        return () => {
            room.off(RoomEvent.AudioPlaybackStatusChanged, handleAudioStatusChanged);
        };
    }, [room]);

    useEffect(() => {
        if (isAudioAllowed) return;

        const handleInteraction = () => {
            console.log('[AutoStartAudio] Interaction detected, trying startAudio');
            room.startAudio().then(() => {
                setIsAudioAllowed(true);
                console.log('[AutoStartAudio] status: allowed after interaction');
            }).catch(err => {
                console.error('[AutoStartAudio] failed to start audio on interaction:', err);
            });
        };

        const events = ['click', 'mousedown', 'pointerdown', 'touchstart', 'keydown'];
        events.forEach(e => window.addEventListener(e, handleInteraction, { capture: true }));

        return () => {
            events.forEach(e => window.removeEventListener(e, handleInteraction, { capture: true }));
        };
    }, [isAudioAllowed, room]);

    if (isAudioAllowed) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 backdrop-blur-sm pointer-events-none">
            <button
                onClick={() => {
                    room.startAudio().then(() => {
                        setIsAudioAllowed(true);
                        console.log('[AutoStartAudio] status: allowed after manual click');
                    }).catch(err => {
                        console.error('[AutoStartAudio] manual click failed:', err);
                    });
                }}
                className="pointer-events-auto flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl font-bold shadow-2xl animate-bounce hover:scale-105 transition-transform"
            >
                <Volume2 className="w-5 h-5" />
                Activate Audio
            </button>
        </div>
    );
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
    const source = track.source ?? '';
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
    const { theme } = useSettingsStore();
    const isDark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    const isSpeaking = useIsSpeaking(trackRef?.participant ?? undefined);
    const isScreenShare = trackRef?.source === Track.Source.ScreenShare;

    const participantName = trackRef?.participant?.name || trackRef?.participant?.identity || '';
    const initial = participantName.charAt(0).toUpperCase();
    const isCameraTrack = trackRef?.source === Track.Source.Camera;
    const isMicMuted = useIsMuted({ participant: trackRef?.participant, source: Track.Source.Microphone } as TrackReferenceOrPlaceholder);
    const isTrackMuted = useIsMuted(trackRef as TrackReferenceOrPlaceholder);

    const localUser = useAuthStore(s => s.user);
    const friends = useFriendsStore(s => s.friends);
    let userColor = '#FF5A5F';

    const [volume, setVolume] = useState(100);
    const [isLocallyMuted, setIsLocallyMuted] = useState(false);
    const [isVolumeExpanded, setIsVolumeExpanded] = useState(false);

    // Sync volume via LiveKit's built-in setVolume (0-1 range)
    useEffect(() => {
        const participant = trackRef?.participant;
        if (!participant || participant.isLocal) return;

        const targetVol = isLocallyMuted ? 0 : (volume / 100);

        const sync = () => {
            const pubs = Array.from(participant.audioTrackPublications.values());
            pubs.forEach(pub => {
                const track = pub.track;
                if (!track) return;
                // Use LiveKit internal volume control if it's a remote audio track
                if (track.kind === Track.Kind.Audio && track instanceof RemoteAudioTrack) {
                    track.setVolume(targetVol);
                }
            });
        };

        sync();
        const interval = setInterval(sync, 2000);
        participant.on('trackSubscribed', sync);

        return () => {
            clearInterval(interval);
            participant.off('trackSubscribed', sync);
        };
    }, [volume, isLocallyMuted, trackRef?.participant]);

    // Get color for other participants from metadata (fallback)
    try {
        if (trackRef?.participant?.metadata) {
            const meta = JSON.parse(trackRef.participant.metadata);
            if (meta.avatarColor) userColor = meta.avatarColor;
        }
    } catch { /* ignore */ }

    // Color from friends store overrides metadata (for real-time updates)
    if (!trackRef?.participant?.isLocal && trackRef?.participant?.identity) {
        const friend = friends.find(f => f.id === trackRef.participant!.identity);
        if (friend?.avatarColor) {
            userColor = friend.avatarColor;
        }
    }

    // Own color directly from AuthStore (updates immediately)
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
                <div className={`absolute inset-0 flex items-center justify-center pointer-events-none z-0 rounded-[16px] ${isDark ? 'bg-[#111]' : 'bg-app-surface'}`}>
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
            <div className={`relative w-full h-full z-10 lk-custom-tile-wrapper ${isTrackMuted && !isScreenShare ? 'is-muted' : ''}`}>
                <ParticipantTile trackRef={trackRef} />

                {/* Custom Participant Name & Status Badge */}
                <div className={`absolute bottom-1.5 left-1.5 z-20 flex items-center gap-2 backdrop-blur-md px-2 py-1 rounded-md border pointer-events-none ${isDark ? 'bg-black/55 border-white/5' : 'bg-white/80 border-black/5 shadow-sm'}`}>
                    {!isScreenShare && (
                        <div className={`p-0.5 rounded-sm flex items-center justify-center ${isMicMuted ? 'text-primary' : 'text-green-500'}`}>
                            {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                        </div>
                    )}
                    <span className={`text-[16px] font-semibold truncate max-w-[250px] ${isDark ? 'text-white/90' : 'text-text-main'}`}>
                        {participantName}{isScreenShare ? ' screen share' : ''}
                    </span>
                </div>
            </div>

            {/* Spotlight toggle — z-index increased to stay above video */}
            {onSpotlight && (
                <button
                    onClick={() => onSpotlight(isSpotlit ? null : (trackRef ?? null))}
                    title={isSpotlit ? 'Spotlight entfernen' : 'Spotlight'}
                    className={`
                        absolute top-2 right-2 z-20 p-1.5 rounded-lg backdrop-blur-md
                        transition-all duration-200
                        ${isSpotlit
                            ? 'bg-primary/90 text-white opacity-100 shadow-md'
                            : 'bg-black/40 text-white/70 opacity-100 hover:bg-black/60 hover:text-white'}
                    `}
                >
                    <Maximize className={`w-4 h-4 ${isSpotlit ? 'fill-white' : ''}`} />
                </button>
            )}

            {/* Spotlight badge when pinned */}
            {isSpotlit && (
                <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 bg-primary/90 text-white text-xs font-semibold px-2.5 py-1 rounded-full backdrop-blur-sm pointer-events-none shadow-md">
                    <Maximize className="w-3 h-3 fill-white" />
                    Spotlight
                </div>
            )}

            {/* Audio Controls (Volume & Mute) — Only for remote participants */}
            {trackRef?.participant && !trackRef.participant.isLocal && (
                <div
                    className={`
                        absolute top-2 left-2 z-20 flex items-center p-1.5 rounded-lg backdrop-blur-md shadow-md transition-opacity duration-200
                        ${isDark ? 'bg-black/40' : 'bg-white/60'}
                        ${isSpotlit ? 'top-10' : ''} 
                        opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 group/volume
                    `}
                    onClick={(e) => e.stopPropagation()} /* Prevent triggering Spotlight on click */
                >
                    <button
                        onClick={() => setIsLocallyMuted(!isLocallyMuted)}
                        className={`hover:text-primary transition-colors focus:outline-none shrink-0 ${isDark ? 'text-white' : 'text-text-main'}`}
                        title={isLocallyMuted ? "Unmute locally" : "Mute locally"}
                    >
                        {isLocallyMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>

                    {!isVolumeExpanded && (
                        <button
                            onClick={() => setIsVolumeExpanded(true)}
                            className={`ml-2 sm:hidden shrink-0 ${isDark ? 'text-white/70 hover:text-white' : 'text-text-muted hover:text-text-main'}`}
                            title="Expand volume slider"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    )}

                    <div className={`flex items-center overflow-hidden transition-all duration-300 ${isVolumeExpanded ? 'w-44 ml-2 opacity-100' : 'w-0 opacity-0'} sm:w-0 sm:ml-0 sm:opacity-0 sm:group-hover/volume:w-36 sm:group-hover/volume:ml-2 sm:group-hover/volume:opacity-100 focus-within:w-44 focus-within:ml-2 focus-within:opacity-100`}>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            step="1"
                            value={isLocallyMuted ? 0 : volume}
                            onChange={(e) => {
                                const val = parseInt(e.target.value);
                                setVolume(val);
                                if (val > 0 && isLocallyMuted) setIsLocallyMuted(false);
                            }}
                            className={`w-20 sm:w-24 h-1.5 rounded-full appearance-none cursor-pointer shrink-0 ${isDark ? 'bg-white/30' : 'bg-black/20'}`}
                            style={{
                                background: `linear-gradient(to right, #FF5A5F ${(isLocallyMuted ? 0 : volume)}%, ${isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.1)'} ${(isLocallyMuted ? 0 : volume)}%)`
                            }}
                            title="Adjust volume locally (0-100%)"
                        />
                        <span className={`text-[10px] font-mono w-10 text-right shrink-0 ${isDark ? 'text-white/90' : 'text-text-main'}`}>
                            {isLocallyMuted ? '0%' : `${Math.round(volume)}%`}
                        </span>

                        <div className="flex-1 sm:hidden" />

                        {isVolumeExpanded && (
                            <button
                                onClick={() => setIsVolumeExpanded(false)}
                                className={`pl-2 sm:hidden shrink-0 ${isDark ? 'text-white/70 hover:text-white' : 'text-text-muted hover:text-text-main'}`}
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
type AnyNoiseProcessor = NoiseSuppressionProcessor | NativeNoiseProcessor | FilterNoiseProcessor;

import { GainProcessor } from '@/lib/gain-processor';

function createNoiseProcessor(mode: NoiseSuppressionMode): AnyNoiseProcessor | null {
    switch (mode) {
        case 'rnnoise': return new NoiseSuppressionProcessor();
        case 'native': return new NativeNoiseProcessor();
        case 'filter': return new FilterNoiseProcessor();
        default: return null;
    }
}

function AudioProcessingHook({
    processorRef,
    gainProcessorRef,
    mode,
    gain,
}: {
    processorRef: React.MutableRefObject<AnyNoiseProcessor | null>;
    gainProcessorRef: React.MutableRefObject<GainProcessor | null>;
    mode: NoiseSuppressionMode;
    gain: number;
}) {
    const room = useRoomContext();
    const appliedModeRef = useRef<NoiseSuppressionMode>('off');
    const appliedGainRef = useRef<number>(1.0);
    const originalTrackRef = useRef<MediaStreamTrack | null>(null);

    useEffect(() => {
        const localP = room.localParticipant;

        const applyProcessing = async () => {
            // Find the published mic track
            const micPub = Array.from(localP.audioTrackPublications.values()).find(
                (p) => p.source === Track.Source.Microphone && p.track?.mediaStreamTrack
            );
            if (!micPub?.track?.mediaStreamTrack) return;

            const wasApplied = appliedModeRef.current !== 'off' || appliedGainRef.current !== 1.0;
            const wantsApply = mode !== 'off' || gain !== 1.0;

            // If settings changed while processing is active, tear down the old one first
            if (wasApplied && (mode !== appliedModeRef.current || gain !== appliedGainRef.current)) {
                // Restore original track
                if (originalTrackRef.current) {
                    try {
                        await micPub.track.replaceTrack(originalTrackRef.current);
                    } catch {
                        // Original track might be ended
                    }
                }
                processorRef.current?.destroy();
                processorRef.current = null;
                gainProcessorRef.current?.destroy();
                gainProcessorRef.current = null;
                originalTrackRef.current = null;
                appliedModeRef.current = 'off';
                appliedGainRef.current = 1.0;
            }

            // Apply new processing if needed
            if (wantsApply && (appliedModeRef.current === 'off' && appliedGainRef.current === 1.0)) {
                try {
                    // Store original track for restoration
                    originalTrackRef.current = micPub.track.mediaStreamTrack;

                    let currentStream = new MediaStream([micPub.track.mediaStreamTrack]);

                    // 1. Apply Gain (Before Noise Suppression)
                    if (gain !== 1.0) {
                        const gp = new GainProcessor();
                        currentStream = await gp.process(currentStream, gain);
                        gainProcessorRef.current = gp;
                        appliedGainRef.current = gain;
                    }

                    // 2. Apply Noise Suppression
                    if (mode !== 'off') {
                        const processor = createNoiseProcessor(mode);
                        if (processor) {
                            currentStream = await processor.process(currentStream);
                            processorRef.current = processor;
                            appliedModeRef.current = mode;
                        }
                    }

                    const finalTrack = currentStream.getAudioTracks()[0];
                    if (finalTrack) {
                        await micPub.track.replaceTrack(finalTrack);
                        console.log(`[AudioProcessing] Applied Gain: ${gain}x, Mode: ${mode}`);
                    }
                } catch (err) {
                    console.error('[AudioProcessing] Failed to apply:', err);
                }
            }
        };

        applyProcessing();

        // Listen for new mic track publications
        const handleTrackPublished = () => {
            if ((mode !== 'off' || gain !== 1.0) && appliedModeRef.current === 'off' && appliedGainRef.current === 1.0) {
                setTimeout(applyProcessing, 500);
            }
        };

        localP.on('localTrackPublished', handleTrackPublished);
        return () => {
            localP.off('localTrackPublished', handleTrackPublished);
        };
    }, [room, mode, gain, processorRef, gainProcessorRef]);

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
                processorRef.current.destroy().catch(() => { });
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

// Helper to sync all devices with store
const LiveKitDeviceSync = ({
    audioDeviceId,
    videoDeviceId,
    audioOutputDeviceId
}: {
    audioDeviceId: string | null;
    videoDeviceId: string | null;
    audioOutputDeviceId: string | null;
}) => {
    const room = useRoomContext();

    useEffect(() => {
        // Use 'default' if null, or just don't switch if null and we want browser to decide
        // Most browsers have a 'default' deviceId for audio
        const targetId = audioDeviceId || 'default';
        room.switchActiveDevice('audioinput', targetId).catch(err => {
            console.warn('[LiveKitDeviceSync] Failed to switch audio input:', err);
        });
    }, [room, audioDeviceId]);

    useEffect(() => {
        if (videoDeviceId) {
            room.switchActiveDevice('videoinput', videoDeviceId).catch(err => {
                console.warn('[LiveKitDeviceSync] Failed to switch video input:', err);
            });
        }
    }, [room, videoDeviceId]);

    useEffect(() => {
        const targetId = audioOutputDeviceId || 'default';
        room.switchActiveDevice('audiooutput', targetId).catch(err => {
            console.warn('[LiveKitDeviceSync] Failed to switch audio output:', err);
        });
    }, [room, audioOutputDeviceId]);

    return null;
};

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
    const {
        soundsEnabled, soundVolume, videoQuality, showDevInfo, controlBarVisible, setControlBarVisible,
        autoHideControlBar, noiseSuppressionMode, microphoneGain, screenShareFps,
        virtualBackground, virtualBackgroundImage, blurRadius, theme,
        audioDeviceId, videoDeviceId, audioOutputDeviceId
    } = useSettingsStore();

    const noiseProcessorRef = useRef<AnyNoiseProcessor | null>(null);
    const gainProcessorRef = useRef<GainProcessor | null>(null);
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bgProcessorRef = useRef<any>(null);
    const [showFriendsModal, setShowFriendsModal] = useState(false);
    const [friendsSidebarOpen, setFriendsSidebarOpen] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [settingsTab, setSettingsTab] = useState<'audio-video' | 'quality' | 'interface' | 'sounds' | 'profile' | 'account'>('audio-video');
    const [toastMessage, setToastMessage] = useState<{ id: string; name: string; text: string } | null>(null);
    const toastTimerRef = useRef<NodeJS.Timeout | null>(null);
    const qPreset = VIDEO_PRESETS[videoQuality];


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
            gainProcessorRef.current?.destroy();
            gainProcessorRef.current = null;
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
                options={{
                    videoCaptureDefaults: {
                        deviceId: videoDeviceId || undefined,
                        resolution: { width: qPreset.width, height: qPreset.height, frameRate: qPreset.frameRate },
                    },
                    audioCaptureDefaults: {
                        deviceId: audioDeviceId || undefined,
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
                <LiveKitDeviceSync
                    audioDeviceId={audioDeviceId}
                    videoDeviceId={videoDeviceId}
                    audioOutputDeviceId={audioOutputDeviceId}
                />
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
                <ChevronRotationFix />
                <LiveVideoQualitySync />
                <AudioProcessingHook
                    processorRef={noiseProcessorRef}
                    gainProcessorRef={gainProcessorRef}
                    mode={noiseSuppressionMode}
                    gain={microphoneGain}
                />
                <VirtualBackgroundHook processorRef={bgProcessorRef} bgOption={virtualBackground} bgImage={virtualBackgroundImage} blurRadius={blurRadius} />
                <CustomVideoConference />
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
