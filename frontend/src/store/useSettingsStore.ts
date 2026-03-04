import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type VideoQuality = '360p' | '720p' | '1080p' | '1440p' | '4K';

export const VIDEO_PRESETS: Record<VideoQuality, { width: number; height: number; frameRate: number; maxBitrate: number }> = {
    '360p': { width: 640, height: 360, frameRate: 24, maxBitrate: 600_000 },
    '720p': { width: 1280, height: 720, frameRate: 30, maxBitrate: 1_500_000 },
    '1080p': { width: 1920, height: 1080, frameRate: 60, maxBitrate: 4_000_000 },
    '1440p': { width: 2560, height: 1440, frameRate: 60, maxBitrate: 8_000_000 },
    '4K': { width: 3840, height: 2160, frameRate: 60, maxBitrate: 16_000_000 },
};

interface SettingsState {
    soundsEnabled: boolean;
    soundVolume: number; // 0–1
    videoQuality: VideoQuality;
    showDevInfo: boolean;
    controlBarVisible: boolean;
    autoHideControlBar: boolean;
    noiseSuppression: boolean;
    setSoundsEnabled: (v: boolean) => void;
    setSoundVolume: (v: number) => void;
    setVideoQuality: (v: VideoQuality) => void;
    setShowDevInfo: (v: boolean) => void;
    setControlBarVisible: (v: boolean) => void;
    setAutoHideControlBar: (v: boolean) => void;
    setNoiseSuppression: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set) => ({
            soundsEnabled: true,
            soundVolume: 0.8,
            videoQuality: '1080p',
            showDevInfo: false,
            controlBarVisible: true,
            autoHideControlBar: false,
            noiseSuppression: false,
            setSoundsEnabled: (v) => set({ soundsEnabled: v }),
            setSoundVolume: (v) => set({ soundVolume: Math.max(0, Math.min(1, v)) }),
            setVideoQuality: (v) => set({ videoQuality: v }),
            setShowDevInfo: (v) => set({ showDevInfo: v }),
            setControlBarVisible: (v) => set({ controlBarVisible: v }),
            setAutoHideControlBar: (v) => set({ autoHideControlBar: v }),
            setNoiseSuppression: (v) => set({ noiseSuppression: v }),
        }),
        { name: 'user-settings' }
    )
);
