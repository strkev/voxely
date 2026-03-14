import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type VideoQuality = '360p' | '720p' | '1080p' | '1440p' | '4K';
export type ScreenShareResolution = '720p' | '1080p' | '1440p' | '4K' | 'Source';
export type ScreenShareFps = 5 | 15 | 30 | 60;

export const VIDEO_PRESETS: Record<VideoQuality, { width: number; height: number; frameRate: number; maxBitrate: number }> = {
    '360p': { width: 640, height: 360, frameRate: 24, maxBitrate: 600_000 },
    '720p': { width: 1280, height: 720, frameRate: 30, maxBitrate: 1_500_000 },
    '1080p': { width: 1920, height: 1080, frameRate: 60, maxBitrate: 4_000_000 },
    '1440p': { width: 2560, height: 1440, frameRate: 60, maxBitrate: 8_000_000 },
    '4K': { width: 3840, height: 2160, frameRate: 60, maxBitrate: 16_000_000 },
};

export const SCREEN_SHARE_RESOLUTIONS: Record<Exclude<ScreenShareResolution, 'Source'>, { width: number; height: number }> = {
    '720p': { width: 1280, height: 720 },
    '1080p': { width: 1920, height: 1080 },
    '1440p': { width: 2560, height: 1440 },
    '4K': { width: 3840, height: 2160 },
};

interface SettingsState {
    soundsEnabled: boolean;
    soundVolume: number; // 0–1
    videoQuality: VideoQuality;
    screenShareResolution: ScreenShareResolution;
    screenShareFps: ScreenShareFps;
    showDevInfo: boolean;
    controlBarVisible: boolean;
    autoHideControlBar: boolean;
    noiseSuppression: boolean;
    virtualBackground: 'none' | 'blur' | 'image';
    virtualBackgroundImage: string | null;
    blurRadius: number;
    theme: 'light' | 'dark' | 'system';
    setSoundsEnabled: (v: boolean) => void;
    setSoundVolume: (v: number) => void;
    setVideoQuality: (v: VideoQuality) => void;
    setScreenShareResolution: (v: ScreenShareResolution) => void;
    setScreenShareFps: (v: ScreenShareFps) => void;
    setShowDevInfo: (v: boolean) => void;
    setControlBarVisible: (v: boolean) => void;
    setAutoHideControlBar: (v: boolean) => void;
    setNoiseSuppression: (v: boolean) => void;
    setVirtualBackground: (v: 'none' | 'blur' | 'image') => void;
    setVirtualBackgroundImage: (v: string | null) => void;
    setBlurRadius: (v: number) => void;
    setTheme: (v: 'light' | 'dark' | 'system') => void;
}

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set) => ({
            soundsEnabled: true,
            soundVolume: 0.8,
            videoQuality: '1080p',
            screenShareResolution: 'Source',
            screenShareFps: 60,
            showDevInfo: false,
            controlBarVisible: true,
            autoHideControlBar: false,
            noiseSuppression: false,
            virtualBackground: 'none',
            virtualBackgroundImage: null,
            blurRadius: 10,
            theme: 'system',
            setSoundsEnabled: (v) => set({ soundsEnabled: v }),
            setSoundVolume: (v) => set({ soundVolume: Math.max(0, Math.min(1, v)) }),
            setVideoQuality: (v) => set({ videoQuality: v }),
            setScreenShareResolution: (v) => set({ screenShareResolution: v }),
            setScreenShareFps: (v) => set({ screenShareFps: v }),
            setShowDevInfo: (v) => set({ showDevInfo: v }),
            setControlBarVisible: (v) => set({ controlBarVisible: v }),
            setAutoHideControlBar: (v) => set({ autoHideControlBar: v }),
            setNoiseSuppression: (v) => set({ noiseSuppression: v }),
            setVirtualBackground: (v) => set({ virtualBackground: v }),
            setVirtualBackgroundImage: (v) => set({ virtualBackgroundImage: v }),
            setBlurRadius: (v) => set({ blurRadius: v }),
            setTheme: (v) => set({ theme: v }),
        }),
        { name: 'user-settings' }
    )
);
