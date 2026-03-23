"use client";

import { useEffect, useRef } from 'react';
import { useRoomContext } from '@livekit/components-react';
import { Track, LocalTrackPublication } from 'livekit-client';
import { useSettingsStore } from '@/store/useSettingsStore';

export function useDeviceSync() {
    const room = useRoomContext();
    const audioDeviceId = useSettingsStore(s => s.audioDeviceId);
    const videoDeviceId = useSettingsStore(s => s.videoDeviceId);
    const audioOutputDeviceId = useSettingsStore(s => s.audioOutputDeviceId);

    // Track state to avoid redundant switches
    const lastAudioId = useRef<string | null | undefined>(undefined);
    const lastVideoId = useRef<string | null | undefined>(undefined);
    const lastOutputId = useRef<string | null | undefined>(undefined);

    useEffect(() => {
        const sync = async () => {
            if (audioDeviceId === lastAudioId.current) return;
            
            console.log('[LiveKitDeviceSync] Switching audio input to:', audioDeviceId || 'default');
            try {
                await room.switchActiveDevice('audioinput', audioDeviceId || '');
                lastAudioId.current = audioDeviceId;
            } catch (err) {
                console.warn('[LiveKitDeviceSync] Failed to switch audio input:', err);
            }
        };

        sync();
        
        // Also sync on new track publications (e.g. after unmuting)
        const handleTrackPublished = (pub: LocalTrackPublication) => {
            if (pub.source === Track.Source.Microphone) sync();
        };
        room.localParticipant.on('localTrackPublished', handleTrackPublished);
        return () => {
            room.localParticipant.off('localTrackPublished', handleTrackPublished);
        };
    }, [room, audioDeviceId]);

    useEffect(() => {
        const sync = async () => {
            if (videoDeviceId === lastVideoId.current) return;

            console.log('[LiveKitDeviceSync] Switching video input to:', videoDeviceId || 'default');
            try {
                await room.switchActiveDevice('videoinput', videoDeviceId || '');
                lastVideoId.current = videoDeviceId;
            } catch (err) {
                console.warn('[LiveKitDeviceSync] Failed to switch video input:', err);
            }
        };

        sync();
        const handleTrackPublished = (pub: LocalTrackPublication) => {
            if (pub.source === Track.Source.Camera) sync();
        };
        room.localParticipant.on('localTrackPublished', handleTrackPublished);
        return () => {
            room.localParticipant.off('localTrackPublished', handleTrackPublished);
        };
    }, [room, videoDeviceId]);

    useEffect(() => {
        if (audioOutputDeviceId === lastOutputId.current) return;

        const isSafariBased = /Safari/i.test(navigator.userAgent) && !/Chrome/i.test(navigator.userAgent) || /iPhone|iPad|iPod/i.test(navigator.userAgent);
        const supportsOutputSwitching = typeof HTMLMediaElement !== 'undefined' && ('setSinkId' in HTMLMediaElement.prototype) && !isSafariBased;

        if (!supportsOutputSwitching) {
            console.log('[LiveKitDeviceSync] Output switching not supported in this browser');
            return;
        }

        const targetId = audioOutputDeviceId || 'default';
        console.log('[LiveKitDeviceSync] Switching audio output to:', targetId);
        
        room.switchActiveDevice('audiooutput', targetId).then(() => {
            lastOutputId.current = audioOutputDeviceId;
        }).catch(err => {
            console.warn('[LiveKitDeviceSync] Failed to switch audio output:', err);
        });
    }, [room, audioOutputDeviceId]);

    return null;
}
