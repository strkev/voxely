"use client";

import { useEffect } from 'react';
import { useRoomContext } from '@livekit/components-react';
import { Track, LocalTrack } from 'livekit-client';
import { useSettingsStore } from '@/store/useSettingsStore';

export function useDeviceSync() {
    const room = useRoomContext();
    const audioDeviceId = useSettingsStore(s => s.audioDeviceId);
    const videoDeviceId = useSettingsStore(s => s.videoDeviceId);
    const audioOutputDeviceId = useSettingsStore(s => s.audioOutputDeviceId);

    useEffect(() => {
        const sync = async () => {
            const lp = room.localParticipant;
            const micPub = Array.from(lp.audioTrackPublications.values()).find(p => p.source === Track.Source.Microphone);

            if (!audioDeviceId) {
                // If System Default (null), restart the track with no deviceId constraint
                if (micPub?.track) {
                    try {
                        await (micPub.track as LocalTrack).restartTrack({ deviceId: undefined });
                    } catch (err) {
                        console.warn('[LiveKitDeviceSync] Failed to restart audio to default:', err);
                    }
                }
                return;
            }

            // Explicit device selection
            room.switchActiveDevice('audioinput', audioDeviceId).catch(err => {
                if (lp.isMicrophoneEnabled) {
                    console.warn('[LiveKitDeviceSync] Failed to switch audio input:', err);
                }
            });
        };

        sync();

        room.localParticipant.on('localTrackPublished', sync);
        return () => {
            room.localParticipant.off('localTrackPublished', sync);
        };
    }, [room, audioDeviceId]);

    useEffect(() => {
        const sync = async () => {
            const lp = room.localParticipant;
            const camPub = Array.from(lp.videoTrackPublications.values()).find(p => p.source === Track.Source.Camera);

            if (!videoDeviceId) {
                if (camPub?.track) {
                    try {
                        await (camPub.track as LocalTrack).restartTrack({ deviceId: undefined });
                    } catch (err) {
                        console.warn('[LiveKitDeviceSync] Failed to restart video to default:', err);
                    }
                }
                return;
            }

            room.switchActiveDevice('videoinput', videoDeviceId).catch(err => {
                if (lp.isCameraEnabled) {
                    console.warn('[LiveKitDeviceSync] Failed to switch video input:', err);
                }
            });
        };

        sync();
        room.localParticipant.on('localTrackPublished', sync);
        return () => {
            room.localParticipant.off('localTrackPublished', sync);
        };
    }, [room, videoDeviceId]);

    useEffect(() => {
        const isSafariBased = /Safari/i.test(navigator.userAgent) && !/Chrome/i.test(navigator.userAgent) || /iPhone|iPad|iPod/i.test(navigator.userAgent);
        const supportsOutputSwitching = typeof HTMLMediaElement !== 'undefined' && ('setSinkId' in HTMLMediaElement.prototype) && !isSafariBased;

        if (!supportsOutputSwitching) return;

        const targetId = audioOutputDeviceId || 'default';
        room.switchActiveDevice('audiooutput', targetId).catch(err => {
            console.warn('[LiveKitDeviceSync] Failed to switch audio output:', err);
        });
    }, [room, audioOutputDeviceId]);

    return null;
}
