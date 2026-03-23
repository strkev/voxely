"use client";

import { useEffect, useRef } from 'react';
import { useRoomContext } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { useSettingsStore, type NoiseSuppressionMode } from '@/store/useSettingsStore';
import { NoiseSuppressionProcessor } from '@/lib/rnnoise-processor';
import { NativeNoiseProcessor } from '@/lib/native-noise-processor';
import { FilterNoiseProcessor } from '@/lib/filter-noise-processor';
import { GainProcessor } from '@/lib/gain-processor';

type AnyNoiseProcessor = NoiseSuppressionProcessor | NativeNoiseProcessor | FilterNoiseProcessor;

function createNoiseProcessor(mode: NoiseSuppressionMode): AnyNoiseProcessor | null {
    switch (mode) {
        case 'rnnoise': return new NoiseSuppressionProcessor();
        case 'native': return new NativeNoiseProcessor();
        case 'filter': return new FilterNoiseProcessor();
        default: return null;
    }
}

export function useAudioProcessing() {
    const room = useRoomContext();
    const mode = useSettingsStore(s => s.noiseSuppressionMode);
    const gain = useSettingsStore(s => s.microphoneGain);
    
    const processorRef = useRef<AnyNoiseProcessor | null>(null);
    const gainProcessorRef = useRef<GainProcessor | null>(null);
    
    const appliedModeRef = useRef<NoiseSuppressionMode>('off');
    const appliedGainRef = useRef<number>(1.0);
    const processedTrackIdRef = useRef<string | null>(null);
    const originalTrackRef = useRef<MediaStreamTrack | null>(null);

    useEffect(() => {
        const localP = room.localParticipant;

        const applyProcessing = async () => {
            // Find the published mic track
            const micPub = Array.from(localP.audioTrackPublications.values()).find(
                (p) => p.source === Track.Source.Microphone && p.track?.mediaStreamTrack
            );

            const activeTrack = micPub?.track?.mediaStreamTrack;
            const currentTrackId = activeTrack?.id || null;

            if (!currentTrackId) {
                // If track is gone (muted), we MUST reset the applied state so it reapplies when unmuted
                if (appliedModeRef.current !== 'off' || appliedGainRef.current !== 1.0 || processedTrackIdRef.current) {
                    console.log('[AudioProcessing] Track gone or muted, resetting state');
                    appliedModeRef.current = 'off';
                    appliedGainRef.current = 1.0;
                    processedTrackIdRef.current = null;
                    originalTrackRef.current = null;
                    processorRef.current?.destroy();
                    processorRef.current = null;
                    gainProcessorRef.current?.destroy();
                    gainProcessorRef.current = null;
                }
                return;
            }

            // Capture the original, un-processed hardware track if it changed
            if (currentTrackId !== processedTrackIdRef.current) {
                originalTrackRef.current = activeTrack!;
                console.log('[AudioProcessing] Fresh hardware track captured:', currentTrackId);
            }

            const wasApplied = appliedModeRef.current !== 'off' || appliedGainRef.current !== 1.0;
            const wantsApply = mode !== 'off' || gain !== 1.0;

            // If settings changed OR track changed while processing is active, tear down the old one first
            if (wasApplied && (mode !== appliedModeRef.current || gain !== appliedGainRef.current)) {
                console.log('[AudioProcessing] Settings changed, restoring original track and tearing down');
                
                // CRITICAL: We MUST replace the dead processed track back with the original track in LiveKit
                // so the user has sound while we set up the new processor.
                if (originalTrackRef.current && micPub?.track) {
                    try {
                        await micPub.track.replaceTrack(originalTrackRef.current);
                    } catch (e) {
                        console.warn('[AudioProcessing] Failed to restore original track during teardown:', e);
                    }
                }

                processorRef.current?.destroy();
                processorRef.current = null;
                gainProcessorRef.current?.destroy();
                gainProcessorRef.current = null;
                
                processedTrackIdRef.current = originalTrackRef.current?.id || null;
                appliedModeRef.current = 'off';
                appliedGainRef.current = 1.0;
            }

            // Apply new processing if needed
            if (wantsApply && appliedModeRef.current === 'off' && appliedGainRef.current === 1.0) {
                try {
                    console.log('[AudioProcessing] Applying to track:', originalTrackRef.current?.id);
                    const sourceTrack = originalTrackRef.current!;

                    let currentStream = new MediaStream([sourceTrack]);

                    // 1. Apply Gain
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
                    if (finalTrack && micPub!.track) {
                        await micPub!.track.replaceTrack(finalTrack);
                        processedTrackIdRef.current = finalTrack.id;
                        console.info(`[AudioProcessing] Done. Hardware ID: ${sourceTrack.id}, Processed ID: ${finalTrack.id}`);
                    }
                } catch (err) {
                    console.error('[AudioProcessing] Failed to apply:', err);
                }
            } else if (!wantsApply && currentTrackId !== processedTrackIdRef.current) {
                // If we don't apply anything, just track the current hardware ID
                processedTrackIdRef.current = currentTrackId;
            }
        };

        applyProcessing();

        // Listen for new mic track publications or unmuting
        const handleTrackPublished = () => {
            console.log('[AudioProcessing] localTrackPublished/unmuted detected');
            setTimeout(applyProcessing, 300);
        };

        localP.on('localTrackPublished', handleTrackPublished);
        localP.on('trackSubscribed', handleTrackPublished); // Sometimes useful for sync
        
        return () => {
            localP.off('localTrackPublished', handleTrackPublished);
            localP.off('trackSubscribed', handleTrackPublished);
        };
    }, [room, mode, gain]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            processorRef.current?.destroy();
            gainProcessorRef.current?.destroy();
        };
    }, []);

}
