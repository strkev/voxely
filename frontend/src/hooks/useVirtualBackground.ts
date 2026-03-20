"use client";

import { useEffect, useRef } from 'react';
import { useRoomContext } from '@livekit/components-react';
import { Track, LocalTrackPublication } from 'livekit-client';
import { useSettingsStore } from '@/store/useSettingsStore';

export function useVirtualBackground() {
    const room = useRoomContext();
    const bgOption = useSettingsStore(s => s.virtualBackground);
    const bgImage = useSettingsStore(s => s.virtualBackgroundImage);
    const blurRadius = useSettingsStore(s => s.blurRadius);
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const processorRef = useRef<any>(null);
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
                if (lastTrackSidRef.current !== undefined) {
                    console.log('[VirtualBackground] Track gone or not live, resetting state');
                    lastTrackSidRef.current = undefined;
                }
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
    }, [room, bgOption, bgImage, blurRadius]);

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
    }, []);

}
