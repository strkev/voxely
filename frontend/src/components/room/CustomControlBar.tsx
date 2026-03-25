"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useTrackToggle, useMediaDeviceSelect } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { Mic, MicOff, Video, VideoOff, MonitorUp, MonitorOff, ChevronDown, Check } from 'lucide-react';
import { useSettingsStore } from '@/store/useSettingsStore';

// --- Hilfskomponente für das Dropdown-Menü der Geräteauswahl ---
function DeviceMenu({ 
    kind, 
    onClose,
    isDark
}: { 
    kind: 'audioinput' | 'videoinput';
    onClose: () => void;
    isDark: boolean;
}) {
    const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({ kind });
    const setAudioDeviceId = useSettingsStore(state => state.setAudioDeviceId);
    const setVideoDeviceId = useSettingsStore(state => state.setVideoDeviceId);

    return (
        <div 
            className={`
                z-[100] border rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-2
                fixed bottom-[90px] left-1/2 -translate-x-1/2 w-[calc(100vw-2rem)] max-w-xs
                sm:absolute sm:bottom-full sm:left-auto sm:right-0 sm:translate-x-0 sm:mb-2 sm:w-60 sm:max-w-none
                ${isDark ? 'bg-[#222222] border-white/10' : 'bg-white border-gray-200'}
            `}
        >
            <div className="py-1 max-h-60 overflow-y-auto scrollbar-hide">
                {devices.length === 0 ? (
                    <div className={`px-5 py-4 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Keine Geräte gefunden</div>
                ) : (
                    <>
                        {devices.filter(d => d.deviceId !== 'default').map((device) => (
                            <button
                                key={device.deviceId}
                                onClick={() => {
                                    setActiveMediaDevice(device.deviceId);
                                    if (kind === 'audioinput') {
                                        setAudioDeviceId(device.deviceId);
                                    } else if (kind === 'videoinput') {
                                        setVideoDeviceId(device.deviceId);
                                    }
                                    onClose();
                                }}
                                className={`w-full text-left px-5 py-3 text-sm flex items-center justify-between transition-colors ${isDark ? 'hover:bg-white/5 text-gray-200' : 'hover:bg-gray-50 text-gray-900'}`}
                            >
                                <span className="truncate pr-3">{device.label || 'Unbekanntes Gerät'}</span>
                                {activeDeviceId === device.deviceId && (
                                    <Check className="w-5 h-5 text-primary shrink-0" />
                                )}
                            </button>
                        ))}
                    </>
                )}
            </div>
        </div>
    );
}

// --- Hauptkomponente ---
export function CustomControlBar({ isDark }: { isDark: boolean }) {
    const [openMenu, setOpenMenu] = useState<'mic' | 'cam' | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // LiveKit Hooks für das Ein-/Ausschalten der Tracks
    const { toggle: toggleMic, enabled: isMicEnabled } = useTrackToggle({ source: Track.Source.Microphone });
    const { toggle: toggleCam, enabled: isCamEnabled } = useTrackToggle({ source: Track.Source.Camera });
    const { toggle: toggleScreen, enabled: isScreenShareEnabled } = useTrackToggle({ source: Track.Source.ScreenShare });


    // Schließt das Menü, wenn man außerhalb klickt
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setOpenMenu(null);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div 
            ref={containerRef}
            // Äußerer Container (Die Pill-Form)
            className={`flex items-center gap-3 p-2 rounded-full backdrop-blur-md shadow-lg transition-colors duration-300 ${isDark ? 'bg-[#1A1A1A]/90' : 'bg-[#F2F2F2]/90'}`}
        >
            
            {/* --- Mikrofon Gruppe --- */}
            <div className={`relative flex items-stretch border rounded-full transition-colors shadow-sm ${isDark ? 'bg-[#2C2C2C] border-white/5' : 'bg-white border-gray-200'}`}>
                <button
                    onClick={() => toggleMic()}
                    className={`flex items-center gap-2.5 px-4 sm:px-5 py-2.5 text-sm font-medium rounded-l-full transition-colors ${isDark ? 'text-gray-200 hover:bg-white/5' : 'text-gray-900 hover:bg-gray-50'}`}
                >
                    {isMicEnabled ? <Mic className="w-5 h-5 shrink-0" /> : <MicOff className="w-5 h-5 shrink-0 text-red-500" />}
                    <span className="hidden sm:inline">Microphone</span>
                </button>
                <div className={`w-[1px] my-1.5 ${isDark ? 'bg-white/10' : 'bg-gray-200'}`} /> {/* Trennlinie */}
                <button
                    onClick={() => setOpenMenu(openMenu === 'mic' ? null : 'mic')}
                    className={`px-2.5 sm:px-3 rounded-r-full transition-colors flex items-center justify-center ${isDark ? 'hover:bg-white/5 text-gray-400' : 'hover:bg-gray-50 text-gray-600'}`}
                >
                    <ChevronDown className={`w-4 h-4 transition-transform duration-200 shrink-0 ${openMenu === 'mic' ? 'rotate-180' : ''}`} />
                </button>
                
                {openMenu === 'mic' && (
                    <DeviceMenu kind="audioinput" onClose={() => setOpenMenu(null)} isDark={isDark} />
                )}
            </div>

            {/* --- Kamera Gruppe --- */}
            <div className={`relative flex items-stretch border rounded-full transition-colors shadow-sm ${isDark ? 'bg-[#2C2C2C] border-white/5' : 'bg-white border-gray-200'}`}>
                <button
                    onClick={() => toggleCam()}
                    className={`flex items-center gap-2.5 px-4 sm:px-5 py-2.5 text-sm font-medium rounded-l-full transition-colors ${isDark ? 'text-gray-200 hover:bg-white/5' : 'text-gray-900 hover:bg-gray-50'}`}
                >
                    {isCamEnabled ? <Video className="w-5 h-5 shrink-0" /> : <VideoOff className="w-5 h-5 shrink-0 text-red-500" />}
                    <span className="hidden sm:inline">Camera</span>
                </button>
                <div className={`w-[1px] my-1.5 ${isDark ? 'bg-white/10' : 'bg-gray-200'}`} /> {/* Trennlinie */}
                <button
                    onClick={() => setOpenMenu(openMenu === 'cam' ? null : 'cam')}
                    className={`px-2.5 sm:px-3 rounded-r-full transition-colors flex items-center justify-center ${isDark ? 'hover:bg-white/5 text-gray-400' : 'hover:bg-gray-50 text-gray-600'}`}
                >
                    <ChevronDown className={`w-4 h-4 transition-transform duration-200 shrink-0 ${openMenu === 'cam' ? 'rotate-180' : ''}`} />
                </button>

                {openMenu === 'cam' && (
                    <DeviceMenu kind="videoinput" onClose={() => setOpenMenu(null)} isDark={isDark} />
                )}
            </div>

            {/* --- Screen Share Button --- */}
            <button
                onClick={() => toggleScreen()}
                className={`hidden sm:flex items-center gap-2.5 px-4 sm:px-5 py-2.5 text-sm font-medium rounded-full transition-colors shadow-sm whitespace-nowrap ${
                    isScreenShareEnabled 
                    ? 'bg-primary border border-primary text-white hover:bg-[#E0484D] hover:border-[#E0484D]' // Aktivierter Zustand
                    : isDark 
                        ? 'bg-[#2C2C2C] border border-white/5 text-gray-200 hover:bg-white/5'
                        : 'bg-white text-gray-900 border border-gray-200 hover:bg-gray-50'
                }`}
            >
                {isScreenShareEnabled ? <MonitorOff className="w-5 h-5 shrink-0" /> : <MonitorUp className="w-5 h-5 shrink-0" />}
                <span className="hidden sm:inline">Share screen</span>
            </button>

        </div>
    );
}
