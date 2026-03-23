"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { useTracks, TrackReferenceOrPlaceholder } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { useRoomSounds } from '@/hooks/useRoomSounds';
import { SpotlightableTile } from './SpotlightableTile';

// ─── Unique key for each track (identity + source avoids duplicates on screen share) ──
export function trackKey(track: TrackReferenceOrPlaceholder, fallback: number): string {
    const identity = track.participant?.identity ?? `p-${fallback}`;
    const source = track.source ?? '';
    return `${identity}-${source}`;
}

export function VideoConferenceView() {
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
        
        // IMPORTANT: The spotlightTrack in state might be a stale placeholder. 
        // We must always find the freshest track reference from the live tracks array 
        // so that VideoTrack can auto-attach when the camera is turned on.
        const currentSpotlight = tracks.find(
            t => trackKey(t, -1) === spotKey
        ) || spotlightTrack;

        const otherTracks = tracks.filter(
            t => trackKey(t, -1) !== spotKey
        );

        return (
            <div className="absolute inset-0 pb-[76px] pt-[64px] flex flex-col">
                <div className="flex-1 flex flex-col sm:flex-row gap-1.5 sm:gap-2 p-1.5 sm:p-2 min-h-0">

                    {/* Main pinned tile — grid constrains height like grid mode */}
                    <div className="flex-1 min-w-0 min-h-0 grid grid-cols-1 auto-rows-fr">
                        <SpotlightableTile
                            key={spotKey}
                            trackRef={currentSpotlight}
                            isSpotlit={true}
                            isAnythingSpotlit={true}
                            onSpotlight={handleSpotlight}
                        />
                    </div>

                    {/* Sidebar — other participants */}
                    {otherTracks.length > 0 && (
                        <div className="flex flex-row sm:flex-col gap-1.5 sm:gap-2 w-full sm:w-60 shrink-0 overflow-x-auto sm:overflow-y-auto scrollbar-hide snap-x sm:snap-none snap-mandatory">
                            {otherTracks.map((track, i) => (
                                <div key={trackKey(track, i)} className="aspect-video w-[calc(50%-0.375rem)] sm:w-full shrink-0 snap-start">
                                    <SpotlightableTile
                                        trackRef={track}
                                        isSpotlit={false}
                                        isAnythingSpotlit={true}
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
                        isAnythingSpotlit={false}
                        onSpotlight={handleSpotlight}
                    />
                ))}
            </div>
        </div>
    );
}
