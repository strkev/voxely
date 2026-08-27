"use client";

import { useEffect, useRef } from 'react';
import { useRoomContext } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { useSettingsStore, VIDEO_PRESETS } from '@/store/useSettingsStore';

export function useVideoQualitySync() {
    const room = useRoomContext();
    const videoQuality = useSettingsStore(s => s.videoQuality);
    const screenShareResolution = useSettingsStore(s => s.screenShareResolution);
    const screenShareFps = useSettingsStore(s => s.screenShareFps);

    const prevVideoQualityRef = useRef(videoQuality);
    const prevScreenResRef = useRef(screenShareResolution);
    const prevScreenFpsRef = useRef(screenShareFps);

    useEffect(() => {
        if (prevVideoQualityRef.current === videoQuality) return;
        prevVideoQualityRef.current = videoQuality;

        const localP = room.localParticipant;
        const qPreset = VIDEO_PRESETS[videoQuality];

        const cameraPubs = Array.from(localP.videoTrackPublications.values()).filter(
            p => p.source === Track.Source.Camera && p.track
        );

        for (const pub of cameraPubs) {
            if (!pub.track) continue;
            pub.track.restartTrack({
                width: qPreset.width,
                height: qPreset.height,
                frameRate: qPreset.frameRate,
            }).catch(err => console.warn('[LiveQualitySync] Failed to restart camera track:', err));
        }
    }, [room, videoQuality]);

    useEffect(() => {
        prevScreenResRef.current = screenShareResolution;
    }, [screenShareResolution]);

    useEffect(() => {
        prevScreenFpsRef.current = screenShareFps;
    }, [screenShareFps]);

    return null;
}
