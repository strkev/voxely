"use client";

import { useAudioProcessing } from '@/hooks/useAudioProcessing';
import { useVirtualBackground } from '@/hooks/useVirtualBackground';
import { useVideoQualitySync } from '@/hooks/useVideoQualitySync';
import { useDeviceSync } from '@/hooks/useDeviceSync';

export function RoomEffects() {
    useAudioProcessing();
    useVirtualBackground();
    useVideoQualitySync();
    useDeviceSync();

    return null;
}
