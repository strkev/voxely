"use client";

import { useSettingsStore } from '@/store/useSettingsStore';
import { playSound, type SoundName } from '@/lib/sounds';
import { SettingsToggle } from '@/components/ui/SettingsToggle';
import { SettingsSlider } from '@/components/ui/SettingsSlider';
import { SettingsOptionButton } from '@/components/ui/SettingsOptionButton';
import { Bell, VolumeX, Volume2 } from 'lucide-react';

const SOUND_LABELS: { key: SoundName; label: string }[] = [
    { key: 'join', label: 'Join' },
    { key: 'leave', label: 'Leave' },
    { key: 'mute', label: 'Mute' },
    { key: 'unmute', label: 'Unmute' },
    { key: 'cameraOn', label: 'Camera On' },
    { key: 'cameraOff', label: 'Camera Off' },
    { key: 'screenShareOn', label: 'Screen Share On' },
    { key: 'screenShareOff', label: 'Screen Share Off' },
];

export function SoundsTab() {
    const {
        soundsEnabled, soundVolume,
        setSoundsEnabled, setSoundVolume,
    } = useSettingsStore();

    return (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-8">
            <SettingsToggle
                label="Enable Interface Sounds"
                description="Play subtle sounds for UI interactions"
                value={soundsEnabled}
                onChange={() => setSoundsEnabled(!soundsEnabled)}
                icon={Bell}
            />
            <div className={`space-y-8 transition-all ${soundsEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none grayscale'}`}>
                <div className="space-y-4">
                    <div className="flex items-center justify-between px-1">
                        <h4 className="text-xs font-bold text-text-muted uppercase tracking-widest">Master Volume</h4>
                    </div>
                    <SettingsSlider
                        value={soundVolume}
                        onChange={setSoundVolume}
                        leftIcon={VolumeX}
                        rightIcon={Volume2}
                        label={`${Math.round(soundVolume)}%`}
                        className="px-1"
                    />
                </div>
                <div className="space-y-4">
                    <h4 className="text-xs font-bold text-text-muted uppercase tracking-widest px-1">Test Sounds</h4>
                    <div className="grid grid-cols-2 gap-2">
                        {SOUND_LABELS.map(({ key, label }) => (
                            <SettingsOptionButton
                                key={key}
                                onClick={() => playSound(key, soundVolume)}
                                className="flex items-center gap-2 px-4 py-3 text-[11px]"
                            >
                                <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                                {label}
                            </SettingsOptionButton>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
