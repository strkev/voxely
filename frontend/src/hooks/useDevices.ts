"use client";

import { useState, useEffect } from 'react';
import {
    useMaybeRoomContext,
    useMediaDeviceSelect,
} from '@livekit/components-react';
import { useSettingsStore } from '@/store/useSettingsStore';

export interface DevicesResult {
    audioDevices: MediaDeviceInfo[];
    videoDevices: MediaDeviceInfo[];
    audioOutputDevices: MediaDeviceInfo[];
    activeAudioId: string;
    activeVideoId: string;
    activeAudioOutputId: string;
}

/**
 * Encapsulates device enumeration logic.
 * - When inside a LiveKit Room context, delegates to `useMediaDeviceSelect`.
 * - Otherwise, falls back to `navigator.mediaDevices.enumerateDevices()`.
 *
 * Includes an `isMounted` guard so async results never set state after unmount.
 */
export function useDevices(): DevicesResult {
    const room = useMaybeRoomContext() || null;
    const { audioDeviceId, videoDeviceId, audioOutputDeviceId } = useSettingsStore();

    // LiveKit hooks (always called — rules of hooks)
    const { devices: lkAudioDevices, activeDeviceId: lkActiveAudioId } =
        useMediaDeviceSelect({ kind: 'audioinput', room: room || undefined });
    const { devices: lkVideoDevices, activeDeviceId: lkActiveVideoId } =
        useMediaDeviceSelect({ kind: 'videoinput', room: room || undefined });
    const { devices: lkAudioOutputDevices, activeDeviceId: lkActiveAudioOutputId } =
        useMediaDeviceSelect({ kind: 'audiooutput', room: room || undefined });

    // Fallback device lists (used when no room is connected)
    const [fallbackAudioDevices, setFallbackAudioDevices] = useState<MediaDeviceInfo[]>([]);
    const [fallbackVideoDevices, setFallbackVideoDevices] = useState<MediaDeviceInfo[]>([]);
    const [fallbackAudioOutputDevices, setFallbackAudioOutputDevices] = useState<MediaDeviceInfo[]>([]);

    useEffect(() => {
        if (room) return; // LiveKit manages devices when in a room

        let isMounted = true;

        const updateDevices = async () => {
            try {
                let devices = await navigator.mediaDevices.enumerateDevices();

                // If labels are empty, permissions haven't been granted yet.
                // Request a temporary stream to trigger the browser permission prompt.
                const hasLabels = devices.some(d => d.label);
                if (!hasLabels && navigator.mediaDevices.getUserMedia) {
                    try {
                        const hasAudio = devices.some(d => d.kind === 'audioinput');
                        const hasVideo = devices.some(d => d.kind === 'videoinput');

                        if (hasAudio) {
                            try {
                                const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                                audioStream.getTracks().forEach(t => t.stop());
                            } catch (e) {
                                console.warn('useDevices: Audio permission denied or failed', e);
                            }
                        }

                        if (hasVideo) {
                            try {
                                const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
                                videoStream.getTracks().forEach(t => t.stop());
                            } catch (e) {
                                console.warn('useDevices: Video permission denied or failed', e);
                            }
                        }

                        // Refresh device list now that labels should be available
                        devices = await navigator.mediaDevices.enumerateDevices();
                    } catch (e) {
                        console.warn('useDevices: Individual permission requests failed', e);
                    }
                }

                if (!isMounted) return; // Don't set state if unmounted

                setFallbackAudioDevices(devices.filter(d => d.kind === 'audioinput'));
                setFallbackVideoDevices(devices.filter(d => d.kind === 'videoinput'));
                setFallbackAudioOutputDevices(devices.filter(d => d.kind === 'audiooutput'));
            } catch (err) {
                console.error('useDevices: Error enumerating devices:', err);
            }
        };

        updateDevices();
        navigator.mediaDevices.addEventListener('devicechange', updateDevices);

        return () => {
            isMounted = false;
            navigator.mediaDevices.removeEventListener('devicechange', updateDevices);
        };
    }, [room]);

    return {
        audioDevices: room ? lkAudioDevices : fallbackAudioDevices,
        videoDevices: room ? lkVideoDevices : fallbackVideoDevices,
        audioOutputDevices: room ? lkAudioOutputDevices : fallbackAudioOutputDevices,
        activeAudioId: room ? lkActiveAudioId : (audioDeviceId || ''),
        activeVideoId: room ? lkActiveVideoId : (videoDeviceId || ''),
        activeAudioOutputId: room ? lkActiveAudioOutputId : (audioOutputDeviceId || ''),
    };
}
