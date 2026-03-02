"use client";

import { useEffect, useRef } from 'react';
import { useLocalParticipant, useParticipants } from '@livekit/components-react';
import { playSound } from '@/lib/sounds';
import { useSettingsStore } from '@/store/useSettingsStore';

/**
 * Hook that listens to LiveKit room events and plays UI sounds accordingly.
 * Must be used inside a <LiveKitRoom> component tree.
 */
export function useRoomSounds() {
    const { soundsEnabled, soundVolume } = useSettingsStore();
    const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
    const participants = useParticipants();

    // Refs to track previous state (prevent playing sound on initial mount)
    const prevMic = useRef<boolean | null>(null);
    const prevCamera = useRef<boolean | null>(null);
    const prevScreenShare = useRef<boolean | null>(null);
    const prevParticipantCount = useRef<number | null>(null);
    const isFirstMount = useRef(true);

    const play = (name: Parameters<typeof playSound>[0]) => {
        if (soundsEnabled) playSound(name, soundVolume);
    };

    // Play join sound once when the hook first mounts (we just joined)
    useEffect(() => {
        if (isFirstMount.current) {
            isFirstMount.current = false;
            play('join');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Microphone toggle
    useEffect(() => {
        if (prevMic.current === null) {
            prevMic.current = isMicrophoneEnabled;
            return;
        }
        if (isMicrophoneEnabled !== prevMic.current) {
            play(isMicrophoneEnabled ? 'unmute' : 'mute');
            prevMic.current = isMicrophoneEnabled;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isMicrophoneEnabled]);

    // Camera toggle
    useEffect(() => {
        if (prevCamera.current === null) {
            prevCamera.current = isCameraEnabled;
            return;
        }
        if (isCameraEnabled !== prevCamera.current) {
            play(isCameraEnabled ? 'cameraOn' : 'cameraOff');
            prevCamera.current = isCameraEnabled;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isCameraEnabled]);

    // Screen share toggle — watch local participant's screen share publication
    useEffect(() => {
        if (!localParticipant) return;
        const isSharing = localParticipant.isScreenShareEnabled;

        if (prevScreenShare.current === null) {
            prevScreenShare.current = isSharing;
            return;
        }
        if (isSharing !== prevScreenShare.current) {
            play(isSharing ? 'screenShareOn' : 'screenShareOff');
            prevScreenShare.current = isSharing;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [localParticipant?.isScreenShareEnabled]);

    // Other participants joining / leaving
    useEffect(() => {
        const count = participants.length;
        if (prevParticipantCount.current === null) {
            prevParticipantCount.current = count;
            return;
        }
        if (count > prevParticipantCount.current) {
            play('join');
        } else if (count < prevParticipantCount.current) {
            play('leave');
        }
        prevParticipantCount.current = count;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [participants.length]);
}
