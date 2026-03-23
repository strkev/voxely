import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type VideoQuality = '360p' | '720p' | '1080p' | '1440p' | '4K';
export type ScreenShareResolution = '720p' | '1080p' | '1440p' | '4K' | 'Source';
export type ScreenShareFps = 5 | 15 | 30 | 60;
export type NoiseSuppressionMode = 'off' | 'rnnoise' | 'native' | 'filter';

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

export const QUALITY_OPTIONS: VideoQuality[] = ['360p', '720p', '1080p', '1440p', '4K'];
export const SCREEN_RES_OPTIONS: ScreenShareResolution[] = ['720p', '1080p', '1440p', '4K', 'Source'];
export const SCREEN_FPS_OPTIONS: ScreenShareFps[] = [5, 15, 30, 60];

interface SettingsState {
    soundsEnabled: boolean;
    soundVolume: number; // 0–1
    videoQuality: VideoQuality;
    screenShareResolution: ScreenShareResolution;
    screenShareFps: ScreenShareFps;
    showDevInfo: boolean;
    controlBarVisible: boolean;
    autoHideControlBar: boolean;
    noiseSuppressionMode: NoiseSuppressionMode;
    virtualBackground: 'none' | 'blur' | 'image';
    virtualBackgroundImage: string | null;
    blurRadius: number;
    theme: 'light' | 'dark' | 'system';
    microphoneGain: number;
    audioDeviceId: string | null;
    videoDeviceId: string | null;
    audioOutputDeviceId: string | null;
    participantVolumes: Record<string, number>;
    hiddenTracks: Record<string, boolean>;
    hydrated: boolean;
    setHydrated: (v: boolean) => void;
    setSoundsEnabled: (v: boolean) => void;
    setSoundVolume: (v: number) => void;
    setVideoQuality: (v: VideoQuality) => void;
    setScreenShareResolution: (v: ScreenShareResolution) => void;
    setScreenShareFps: (v: ScreenShareFps) => void;
    setShowDevInfo: (v: boolean) => void;
    setControlBarVisible: (v: boolean) => void;
    setAutoHideControlBar: (v: boolean) => void;
    setNoiseSuppressionMode: (v: NoiseSuppressionMode) => void;
    setVirtualBackground: (v: 'none' | 'blur' | 'image') => void;
    setVirtualBackgroundImage: (v: string | null) => void;
    setBlurRadius: (v: number) => void;
    setTheme: (v: 'light' | 'dark' | 'system') => void;
    setMicrophoneGain: (v: number) => void;
    setAudioDeviceId: (v: string | null) => void;
    setVideoDeviceId: (v: string | null) => void;
    setAudioOutputDeviceId: (v: string | null) => void;
    setParticipantVolume: (key: string, volume: number) => void;
    toggleHiddenTrack: (key: string, isHidden: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set) => ({
            soundsEnabled: true,
            soundVolume: 100,
            videoQuality: '1080p',
            screenShareResolution: 'Source',
            screenShareFps: 60,
            showDevInfo: false,
            controlBarVisible: true,
            autoHideControlBar: false,
            noiseSuppressionMode: 'off',
            virtualBackground: 'none',
            virtualBackgroundImage: null,
            blurRadius: 10,
            theme: 'system',
            microphoneGain: 1.0,
            audioDeviceId: null,
            videoDeviceId: null,
            audioOutputDeviceId: null,
            participantVolumes: {},
            hiddenTracks: {},
            hydrated: false,
            setHydrated: (v) => set({ hydrated: v }),
            setSoundsEnabled: (v) => set({ soundsEnabled: v }),
            setSoundVolume: (v) => set({ soundVolume: Math.max(0, Math.min(100, v)) }),
            setVideoQuality: (v) => set({ videoQuality: v }),
            setScreenShareResolution: (v) => set({ screenShareResolution: v }),
            setScreenShareFps: (v) => set({ screenShareFps: v }),
            setShowDevInfo: (v) => set({ showDevInfo: v }),
            setControlBarVisible: (v) => set({ controlBarVisible: v }),
            setAutoHideControlBar: (v) => set({ autoHideControlBar: v }),
            setNoiseSuppressionMode: (v) => set({ noiseSuppressionMode: v }),
            setVirtualBackground: (v) => set({ virtualBackground: v }),
            setVirtualBackgroundImage: (v) => set({ virtualBackgroundImage: v }),
            setBlurRadius: (v) => set({ blurRadius: v }),
            setTheme: (v) => set({ theme: v }),
            setMicrophoneGain: (v) => set({ microphoneGain: Math.max(0, Math.min(5, v)) }),
            setAudioDeviceId: (v) => set({ audioDeviceId: v }),
            setVideoDeviceId: (v) => set({ videoDeviceId: v }),
            setAudioOutputDeviceId: (v) => set({ audioOutputDeviceId: v }),
            setParticipantVolume: (key, v) => set((s: SettingsState) => ({
                participantVolumes: { ...s.participantVolumes, [key]: v }
            })),
            toggleHiddenTrack: (key: string, isHidden: boolean) => set((s: SettingsState) => ({
                hiddenTracks: { ...s.hiddenTracks, [key]: isHidden }
            })),
        }),
        { 
            name: 'user-settings',
            onRehydrateStorage: () => (state) => {
                state?.setHydrated(true);
            }
        }
    )
);
