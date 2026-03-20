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
    const originalTrackRef = useRef<MediaStreamTrack | null>(null);

    useEffect(() => {
        const localP = room.localParticipant;

        const applyProcessing = async () => {
            // Find the published mic track
            const micPub = Array.from(localP.audioTrackPublications.values()).find(
                (p) => p.source === Track.Source.Microphone && p.track?.mediaStreamTrack
            );
            if (!micPub?.track?.mediaStreamTrack) {
                // If track is gone (muted), we MUST reset the applied state so it reapplies when unmuted
                if (appliedModeRef.current !== 'off' || appliedGainRef.current !== 1.0) {
                    console.log('[AudioProcessing] Track gone (muted), resetting applied state');
                    appliedModeRef.current = 'off';
                    appliedGainRef.current = 1.0;
                    originalTrackRef.current = null;
                    if (processorRef.current) {
                        processorRef.current.destroy();
                        processorRef.current = null;
                    }
                    if (gainProcessorRef.current) {
                        gainProcessorRef.current.destroy();
                        gainProcessorRef.current = null;
                    }
                }
                return;
            }

            const wasApplied = appliedModeRef.current !== 'off' || appliedGainRef.current !== 1.0;
            const wantsApply = mode !== 'off' || gain !== 1.0;

            // If settings changed while processing is active, tear down the old one first
            if (wasApplied && (mode !== appliedModeRef.current || gain !== appliedGainRef.current)) {
                console.log('[AudioProcessing] Settings changed, tearing down old processors');
                // Restore original track before destroying processors
                if (originalTrackRef.current && micPub.track) {
                    try {
                        await micPub.track.replaceTrack(originalTrackRef.current);
                    } catch (err) {
                        console.warn('[AudioProcessing] Failed to restore original track:', err);
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
                    console.log('[AudioProcessing] Applying new processing to track:', micPub.track.sid);
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
                    if (finalTrack && micPub.track) {
                        await micPub.track.replaceTrack(finalTrack);
                        console.info(`[AudioProcessing] Applied Gain: ${gain}x, Mode: ${mode}`);
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
    }, [room, mode, gain]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            processorRef.current?.destroy();
            gainProcessorRef.current?.destroy();
        };
    }, []);

}
