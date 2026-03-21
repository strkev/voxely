"use client";

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
    ParticipantTile,
    useIsSpeaking,
    useIsMuted,
    TrackReferenceOrPlaceholder,
} from '@livekit/components-react';
import { Track, RemoteAudioTrack, RemoteTrackPublication } from 'livekit-client';
import {
    Mic,
    MicOff,
    Maximize,
    EyeOff,
    Expand,
    Shrink,
    Play,
    Volume2,
    VolumeX
} from 'lucide-react';
import { VolumeModal } from './VolumeModal';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useFriendsStore } from '@/store/useFriendsStore';
import { getContrastColor } from '@/lib/colors';

interface SpotlightableTileProps {
    trackRef?: TrackReferenceOrPlaceholder;
    isSpotlit?: boolean;
    isAnythingSpotlit?: boolean;
    onSpotlight?: (t: TrackReferenceOrPlaceholder | null) => void;
}

export function SpotlightableTile({
    trackRef,
    isSpotlit = false,
    onSpotlight,
}: SpotlightableTileProps) {
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

    const participantVolumes = useSettingsStore(s => s.participantVolumes);
    const setParticipantVolume = useSettingsStore(s => s.setParticipantVolume);
    const volumeKey = `${trackRef?.participant?.identity ?? ''}-${trackRef?.source ?? ''}`;

    // Source of truth from store
    const volume = participantVolumes[volumeKey] ?? 100;

    const [isLocallyMuted, setIsLocallyMuted] = useState(false);
    const [isWatching, setIsWatching] = useState(true);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [showVolumeModal, setShowVolumeModal] = useState(false);

    // Sync volume via LiveKit's built-in setVolume (0-1 range)
    useEffect(() => {
        const participant = trackRef?.participant;
        if (!participant || participant.isLocal) return;

        const targetVol = (isLocallyMuted || !isWatching) ? 0 : (volume / 100);
        // If this is a screen share tile, we only want to control the screen share audio
        const targetSource = isScreenShare ? Track.Source.ScreenShareAudio : Track.Source.Microphone;

        const sync = () => {
            const pubs = Array.from(participant.audioTrackPublications.values());
            pubs.forEach(pub => {
                const track = pub.track;
                if (!track || pub.source !== targetSource) return;
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
    }, [volume, isLocallyMuted, trackRef?.participant, isWatching, isScreenShare]);

    // Handle FullScreen changes
    useEffect(() => {
        const handleFSChange = () => {
            setIsFullScreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFSChange);
        return () => document.removeEventListener('fullscreenchange', handleFSChange);
    }, []);

    const toggleFullScreen = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (!containerRef.current) return;
        if (!document.fullscreenElement) {
            containerRef.current.requestFullscreen().catch(err => {
                console.warn(`Error attempting to enable full-screen mode: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    }, []);

    // Bandwidth saving: Toggle subscription
    useEffect(() => {
        const pub = trackRef?.publication;
        if (!pub || pub.isLocal || !(pub instanceof RemoteTrackPublication)) return;

        pub.setSubscribed(isWatching);
    }, [isWatching, trackRef?.publication]);

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
            ref={containerRef}
            className={`relative w-full h-full group rounded-[16px] transition-shadow duration-200 ${isScreenShare ? 'lk-screen-share-tile' : ''} ${isFullScreen ? 'bg-black rounded-none flex items-center justify-center' : ''}`}
            style={{
                containerType: 'inline-size',
                '--user-color': userColor
            } as React.CSSProperties}
        >
            {/* HINTERGRUND-AVATAR: Liegt unter dem Video (z-0). 
                Wird als Fallback gerendert. */}
            {(isCameraTrack || !isWatching) && (
                <div className={`absolute inset-0 flex items-center justify-center z-0 rounded-[16px] overflow-hidden ${isDark ? 'bg-[#111]' : 'bg-app-surface'} ${isFullScreen ? 'rounded-none' : ''}`}>
                    <div
                        className={`w-[32%] max-w-[120px] min-w-[40px] aspect-square rounded-full flex items-center justify-center font-bold shadow-md transition-all duration-500 ${isSpeaking ? 'avatar-speaking' : ''} pointer-events-none`}
                        style={{
                            fontSize: 'clamp(18px, 12cqw, 54px)',
                            backgroundColor: userColor,
                            color: getContrastColor(userColor)
                        }}
                    >
                        {initial}
                    </div>

                    {!isWatching && isScreenShare && (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 bg-black/40 backdrop-blur-md rounded-[16px]">
                            <h3 className="text-white text-xl font-bold tracking-tight drop-shadow-md mb-1">{participantName}</h3>

                            <button
                                onClick={(e) => { e.stopPropagation(); setIsWatching(true); }}
                                className="shrink-0 flex items-center gap-2 bg-white/90 hover:bg-white border border-[rgba(220,220,220,0.85)] hover:border-primary/40 text-text-main hover:text-primary rounded-2xl px-6 py-2.5 text-sm font-medium transition-all duration-150 backdrop-blur-md shadow-sm pointer-events-auto"
                            >
                                <Play className="w-4 h-4 fill-current" />
                                <span>Zuschauen</span>
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* LIVEKIT TILE: Wird in z-10 gewrappt. */}
            {isWatching && (
                <div className={`relative w-full h-full z-10 lk-custom-tile-wrapper ${isTrackMuted && !isScreenShare ? 'is-muted' : ''} ${isFullScreen ? 'flex items-center justify-center w-full max-w-full max-h-full' : ''}`}>
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
            )}

            {/* Top Right Action Buttons — Only visible when watching */}
            {/* Action Bar (Top Right) — Only visible when watching and not focusing another track */}
            {(
                <div className={`absolute top-2 right-2 z-30 flex flex-row gap-0.5 p-1 items-center bg-black/60 backdrop-blur-md border border-white/10 rounded-xl shadow-xl transition-all duration-300 ${isFullScreen ? 'top-4 right-4 p-1.5 gap-1' : ''} opacity-100 sm:opacity-90 sm:hover:opacity-100`}>
                    {/* Spotlight toggle */}
                    {onSpotlight && !isFullScreen && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onSpotlight(isSpotlit ? null : (trackRef ?? null)); }}
                            title={isSpotlit ? 'Remove Spotlight' : 'Spotlight'}
                            className={`p-1.5 rounded-lg transition-all duration-150 ${isSpotlit ? 'bg-primary text-white shadow-sm' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
                        >
                            <Maximize className={`w-4 h-4 ${isSpotlit ? 'fill-white' : ''}`} />
                        </button>
                    )}

                    {/* FullScreen toggle */}
                    <button
                        onClick={toggleFullScreen}
                        title={isFullScreen ? 'Exit Full Screen' : 'Full Screen'}
                        className={`p-1.5 rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition-all duration-150 ${!isSpotlit ? 'max-sm:hidden' : ''}`}
                    >
                        {isFullScreen ? <Shrink className="w-4 h-4" /> : <Expand className="w-4 h-4" />}
                    </button>

                    {/* Stop Watching toggle (only for remote screen shares) */}
                    {isScreenShare && !trackRef?.participant?.isLocal && !isFullScreen && (
                        <button
                            onClick={(e) => { e.stopPropagation(); setIsWatching(false); }}
                            title="Stop Watching"
                            className={`p-1.5 rounded-lg text-white/70 hover:bg-red-500/20 hover:text-red-400 transition-all duration-150 ${!isSpotlit ? 'max-sm:hidden' : ''}`}
                        >
                            <EyeOff className="w-4 h-4" />
                        </button>
                    )}
                </div>
            )}

            {/* Spotlight badge when pinned */}
            {isSpotlit && !isFullScreen && (
                <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 bg-primary/90 text-white text-xs font-semibold px-2.5 py-1 rounded-full backdrop-blur-sm pointer-events-none shadow-md">
                    <Maximize className="w-3 h-3 fill-white" />
                    Spotlight
                </div>
            )}

            {/* Audio Controls (Volume & Mute) — Only for remote participants */}
            {trackRef?.participant && !trackRef.participant.isLocal && isWatching && !isFullScreen && (
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
                        onClick={() => setShowVolumeModal(true)}
                        className={`hover:text-primary transition-colors focus:outline-none shrink-0 ${isDark ? 'text-white' : 'text-text-main'}`}
                        title={isLocallyMuted || volume === 0 ? "Adjust Volume (Currently Muted)" : "Adjust Volume"}
                    >
                        {isLocallyMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                </div>
            )}

            {/* Volume Modal (Unified for Desktop/Mobile) */}
            <VolumeModal
                isOpen={showVolumeModal}
                onClose={() => setShowVolumeModal(false)}
                volume={volume}
                onVolumeChange={(val) => {
                    setParticipantVolume(volumeKey, val);
                    if (val > 0 && isLocallyMuted) setIsLocallyMuted(false);
                    if (val === 0 && !isLocallyMuted) setIsLocallyMuted(true);
                }}
                participantName={participantName}
            />
        </div>
    );
}
