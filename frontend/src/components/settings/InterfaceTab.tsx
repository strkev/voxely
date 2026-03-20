"use client";

import { useSettingsStore } from '@/store/useSettingsStore';
import { SettingsToggle } from '@/components/ui/SettingsToggle';
import { Palette, Sun, Moon, Monitor } from 'lucide-react';

export function InterfaceTab() {
    const {
        autoHideControlBar, showDevInfo, theme,
        setAutoHideControlBar, setShowDevInfo, setTheme,
    } = useSettingsStore();

    return (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
            <div className="space-y-3">
                <SettingsToggle
                    label="Auto-hide Controls"
                    description="Hide UI after 4 seconds of inactivity"
                    value={autoHideControlBar}
                    onChange={() => setAutoHideControlBar(!autoHideControlBar)}
                />
                <SettingsToggle
                    label="Developer Overlay"
                    description="Show bitrate, resolution, and FPS"
                    value={showDevInfo}
                    onChange={() => setShowDevInfo(!showDevInfo)}
                />
            </div>

            <div className="h-px bg-gray-100 my-4" />

            <div className="space-y-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/5 flex items-center justify-center">
                        <Palette className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-text-main">Appearance</h4>
                        <p className="text-xs text-text-muted">Choose your preferred theme</p>
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-2 bg-gray-50 p-1.5 rounded-[20px] border border-gray-100">
                    {(['light', 'dark', 'system'] as const).map((value) => {
                        const options = {
                            light: { icon: Sun, label: 'Light' },
                            dark: { icon: Moon, label: 'Dark' },
                            system: { icon: Monitor, label: 'System' }
                        };
                        const { icon: Icon, label } = options[value];
                        const isActive = theme === value;
                        return (
                            <button
                                key={value}
                                onClick={() => setTheme(value)}
                                className={`flex items-center justify-center gap-2 py-3 rounded-[16px] text-xs font-bold transition-all ${isActive
                                    ? 'bg-white text-primary shadow-sm'
                                    : 'text-text-muted hover:text-text-main'
                                    }`}
                            >
                                <Icon className="w-4 h-4" />
                                {label}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
