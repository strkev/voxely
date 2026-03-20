"use client";

import { useSettingsStore, QUALITY_OPTIONS, SCREEN_RES_OPTIONS, SCREEN_FPS_OPTIONS, type VideoQuality, type ScreenShareResolution, type ScreenShareFps } from '@/store/useSettingsStore';
import { SettingsOptionButton } from '@/components/ui/SettingsOptionButton';
import { Monitor, ScreenShare } from 'lucide-react';

export function QualityTab() {
    const {
        videoQuality, screenShareResolution, screenShareFps,
        setVideoQuality, setScreenShareResolution, setScreenShareFps,
    } = useSettingsStore();

    return (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-10">
            <div className="space-y-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/5 flex items-center justify-center">
                        <Monitor className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-text-main">Camera Quality</h4>
                        <p className="text-xs text-text-muted">Balance performance and visual clarity</p>
                    </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                    {QUALITY_OPTIONS.map((q: VideoQuality) => (
                        <SettingsOptionButton
                            key={q}
                            className="flex-1 min-w-[70px]"
                            active={videoQuality === q}
                            onClick={() => setVideoQuality(q)}
                        >
                            {q}
                        </SettingsOptionButton>
                    ))}
                </div>
            </div>

            <div className="h-px bg-gray-100" />

            <div className="space-y-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/5 flex items-center justify-center">
                        <ScreenShare className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-text-main">Screen Share Quality</h4>
                        <p className="text-xs text-text-muted">Optimize for readability or smoothness</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <p className="text-[11px] font-bold text-text-muted uppercase tracking-widest pl-1">Resolution</p>
                    <div className="flex gap-2 flex-wrap">
                        {SCREEN_RES_OPTIONS.map((r: ScreenShareResolution) => (
                            <SettingsOptionButton
                                key={r}
                                active={screenShareResolution === r}
                                onClick={() => setScreenShareResolution(r)}
                                className="flex-1 min-w-[70px]"
                            >
                                {r}
                            </SettingsOptionButton>
                        ))}
                    </div>
                </div>

                <div className="space-y-4">
                    <p className="text-[11px] font-bold text-text-muted uppercase tracking-widest pl-1">Frame Rate</p>
                    <div className="grid grid-cols-4 gap-2">
                        {SCREEN_FPS_OPTIONS.map((f: ScreenShareFps) => (
                            <SettingsOptionButton
                                key={f}
                                active={screenShareFps === f}
                                onClick={() => setScreenShareFps(f)}
                                className="flex-1 min-w-[70px]"
                            >
                                {f} fps
                            </SettingsOptionButton>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
