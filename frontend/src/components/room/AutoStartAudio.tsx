"use client";

import React, { useState, useEffect } from 'react';
import { useRoomContext } from '@livekit/components-react';
import { RoomEvent } from 'livekit-client';
import { Volume2 } from 'lucide-react';

export function AutoStartAudio() {
    const room = useRoomContext();
    const [isAudioAllowed, setIsAudioAllowed] = useState(true);
    const [isBusy, setIsBusy] = useState(false);

    useEffect(() => {
        const handleAudioStatusChanged = (playing: boolean) => {
            console.log('[AutoStartAudio] status changed, playing:', playing);
            setIsAudioAllowed(playing);
            if (playing) setIsBusy(false);
        };

        room.on(RoomEvent.AudioPlaybackStatusChanged, handleAudioStatusChanged);

        // Initial check/start
        room.startAudio().then(() => {
            setIsAudioAllowed(true);
        }).catch(() => {
            console.warn('[AutoStartAudio] initial playback blocked');
            setIsAudioAllowed(false);
        });

        return () => {
            room.off(RoomEvent.AudioPlaybackStatusChanged, handleAudioStatusChanged);
        };
    }, [room]);

    useEffect(() => {
        if (isAudioAllowed || isBusy) return;

        const handleInteraction = async (e: Event) => {
            if (isAudioAllowed || isBusy) return;
            
            console.log(`[AutoStartAudio] Interaction (${e.type}) detected, starting audio...`);
            setIsBusy(true);
            try {
                await room.startAudio();
                setIsAudioAllowed(true);
                setIsBusy(false);
            } catch (err) {
                console.error('[AutoStartAudio] startAudio failed:', err);
                // Allow retry after a short delay
                setTimeout(() => setIsBusy(false), 1000);
            }
        };

        // pointerdown is better than mousedown/touchstart as it handles both without double-firing
        const events = ['pointerdown', 'keydown'];
        events.forEach(e => window.addEventListener(e, handleInteraction, { capture: true }));

        return () => {
            events.forEach(e => window.removeEventListener(e, handleInteraction, { capture: true }));
        };
    }, [isAudioAllowed, isBusy, room]);

    if (isAudioAllowed) return null;

    return (
        <div className="fixed inset-0 z-[950] flex items-center justify-center bg-black/40 backdrop-blur-md transition-opacity animate-in fade-in duration-300">
            <div className="bg-gray-900/90 backdrop-blur-xl p-8 rounded-[32px] shadow-2xl border border-white/10 flex flex-col items-center gap-6 max-w-sm text-center mx-4">
                <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center animate-pulse">
                    <Volume2 className="w-10 h-10 text-primary" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-white mb-2">Audio Required</h2>
                    <p className="text-white/70 text-sm leading-relaxed">
                        To hear others in the room, please click the button below to activate audio.
                    </p>
                </div>
                <button
                    disabled={isBusy}
                    onClick={async (e) => {
                        e.stopPropagation();
                        if (isBusy) return;
                        setIsBusy(true);
                        try {
                            await room.startAudio();
                            setIsAudioAllowed(true);
                        } catch (err) {
                            console.error(err);
                            setIsBusy(false);
                        }
                    }}
                    className="w-full flex items-center justify-center gap-2 bg-primary text-white px-8 py-4 rounded-2xl font-bold shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                >
                    {isBusy ? 'Activating...' : 'Activate Audio'}
                </button>
            </div>
        </div>
    );
}
