"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useSettingsStore, type NoiseSuppressionMode } from '@/store/useSettingsStore';
import { SettingsOptionButton } from '@/components/ui/SettingsOptionButton';
import { SettingsSlider } from '@/components/ui/SettingsSlider';
import { SettingsSelect } from '@/components/ui/SettingsSelect';
import { SettingsToggle } from '@/components/ui/SettingsToggle';
import {
    Mic, Volume2, Volume2 as Volume2Icon, AlertCircle, Loader2,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const NOISE_SUPPRESSION_OPTIONS: { value: NoiseSuppressionMode; label: string; desc: string }[] = [
    { value: 'off', label: 'Off', desc: 'No background noise reduction' },
    { value: 'rnnoise', label: 'RNNoise', desc: 'AI-powered (best quality, slight latency)' },
    { value: 'native', label: 'Native', desc: 'Browser built-in (zero latency)' },
    { value: 'filter', label: 'Filter', desc: 'Bandpass filter (removes rumble & hiss)' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function VolumeMeter({ level }: { level: number }) {
    return (
        <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden flex gap-0.5 p-0.5">
            {[...Array(20)].map((_, i) => {
                const isActive = (i / 20) < level;
                let colorClass = "bg-green-500";
                if (i > 14) colorClass = "bg-yellow-500";
                if (i > 17) colorClass = "bg-red-500";

                return (
                    <div
                        key={i}
                        className={`flex-1 rounded-sm transition-all duration-75 ${isActive ? colorClass : 'bg-gray-100'}`}
                        style={{ opacity: isActive ? 1 : 0.3 }}
                    />
                );
            })}
        </div>
    );
}

function MicTestSection({ gain, audioOutputDeviceId }: { gain: number; audioOutputDeviceId: string | null }) {
    const [isTesting, setIsTesting] = useState(false);
    const [level, setLevel] = useState(0);
    const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);

    const audioCtxRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const gainNodeRef = useRef<GainNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const playAudioRef = useRef<HTMLAudioElement | null>(null);

    // Sync gain live
    useEffect(() => {
        if (gainNodeRef.current) {
            gainNodeRef.current.gain.setTargetAtTime(gain, 0, 0.05);
        }
    }, [gain]);

    const stopTest = () => {
        setIsTesting(false);
        setLevel(0);
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        if (audioCtxRef.current) {
            audioCtxRef.current.close();
            audioCtxRef.current = null;
        }
    };

    const stopPlayback = () => {
        if (playAudioRef.current) {
            playAudioRef.current.pause();
            playAudioRef.current.currentTime = 0;
        }
        setIsPlaying(false);
    };

    const startTest = async () => {
        try {
            stopPlayback();
            setRecordedUrl(null);
            chunksRef.current = [];

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            const audioCtx = new AudioContextClass();
            audioCtxRef.current = audioCtx;

            const source = audioCtx.createMediaStreamSource(stream);
            const gainNode = audioCtx.createGain();
            gainNode.gain.value = gain;
            gainNodeRef.current = gainNode;

            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            analyserRef.current = analyser;

            const destination = audioCtx.createMediaStreamDestination();

            source.connect(gainNode);
            gainNode.connect(analyser);
            gainNode.connect(destination);

            streamRef.current = stream;
            setIsTesting(true);

            // Determine supported mime type
            const mimeType = MediaRecorder.isTypeSupported('audio/webm')
                ? 'audio/webm'
                : MediaRecorder.isTypeSupported('audio/mp4')
                    ? 'audio/mp4'
                    : 'audio/aac';

            console.log(`[MicTest] Using mimeType: ${mimeType}`);

            // Set up recording of the AMPLIFIED stream
            const mediaRecorder = new MediaRecorder(destination.stream, { mimeType });
            mediaRecorderRef.current = mediaRecorder;
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };
            mediaRecorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: mimeType });
                const url = URL.createObjectURL(blob);
                setRecordedUrl(url);
            };
            mediaRecorder.start();

            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            const update = () => {
                if (!analyserRef.current) return;
                analyserRef.current.getByteFrequencyData(dataArray);

                let sum = 0;
                for (let i = 0; i < bufferLength; i++) {
                    sum += dataArray[i];
                }
                const average = sum / bufferLength;
                setLevel(Math.min(1, average / 100));
                animationFrameRef.current = requestAnimationFrame(update);
            };

            update();
        } catch (err) {
            console.error('Failed to start mic test:', err);
        }
    };

    const handlePlay = () => {
        if (!recordedUrl || !playAudioRef.current) return;

        // Apply sink ID if supported (Chrome, Edge, etc.)
        if ('setSinkId' in HTMLMediaElement.prototype && audioOutputDeviceId) {
            playAudioRef.current.setSinkId(audioOutputDeviceId).catch((err: unknown) => {
                console.warn('[MicTest] Failed to set sink ID:', err);
            });
        }

        setIsPlaying(true);
        playAudioRef.current.currentTime = 0;
        playAudioRef.current.play().catch(err => {
            console.error('Playback failed:', err);
            setIsPlaying(false);
        });
    };

    useEffect(() => {
        return () => {
            stopTest();
            if (recordedUrl) URL.revokeObjectURL(recordedUrl);
        };
    }, [recordedUrl]);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Test Microphone</span>
                <div className="flex gap-2">
                    {recordedUrl && !isTesting && (
                        <button
                            onClick={isPlaying ? stopPlayback : handlePlay}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm ${isPlaying
                                ? 'bg-gray-100 text-gray-600'
                                : 'bg-green-50 text-green-600 hover:bg-green-100'
                                }`}
                        >
                            {isPlaying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Volume2Icon className="w-3 h-3" />}
                            {isPlaying ? 'Stop' : 'Play'}
                        </button>
                    )}
                    <button
                        onClick={isTesting ? stopTest : startTest}
                        className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${isTesting
                            ? 'bg-red-50 text-red-600 hover:bg-red-100'
                            : 'bg-primary text-white shadow-sm hover:bg-[#E0484D]'
                            }`}
                    >
                        {isTesting ? 'Stop' : 'Start'}
                    </button>
                </div>
                {/* Always render but with null src if empty */}
                <audio
                    key={recordedUrl || 'empty'}
                    ref={playAudioRef}
                    src={recordedUrl || undefined}
                    onEnded={() => setIsPlaying(false)}
                    className="hidden"
                />
            </div>
            <div className={`space-y-2 transition-all duration-300 ${isTesting ? 'opacity-100 translate-y-0' : 'opacity-40 -translate-y-1 pointer-events-none'}`}>
                <VolumeMeter level={level} />
                <div className="flex justify-between text-[10px] text-text-muted font-medium px-0.5">
                    <span>Silent</span>
                    <span>Optimized</span>
                    <span>Clips</span>
                </div>
            </div>
        </div>
    );
}

// ─── AudioTab ────────────────────────────────────────────────────────────

interface AudioTabProps {
    audioDevices: MediaDeviceInfo[];
    audioOutputDevices: MediaDeviceInfo[];
}

export function AudioTab({
    audioDevices,
    audioOutputDevices,
}: AudioTabProps) {
    const isOutputSupported = (() => {
        if (typeof HTMLMediaElement === 'undefined' || !('setSinkId' in HTMLMediaElement.prototype)) return false;
        // LiveKit rule: Safari/iOS based browsers don't support output switching reliably
        const isSafariBased = /Safari/i.test(navigator.userAgent) && !/Chrome/i.test(navigator.userAgent) || /iPhone|iPad|iPod/i.test(navigator.userAgent);
        return !isSafariBased;
    })();

    const {
        noiseSuppressionMode, microphoneGain,
        audioDeviceId, audioOutputDeviceId, joinUnmuted,
        setNoiseSuppressionMode, setMicrophoneGain,
        setAudioDeviceId, setAudioOutputDeviceId, setJoinUnmuted,
    } = useSettingsStore();

    return (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-10">
            {/* Audio Output Settings */}
            <div className="space-y-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/5 flex items-center justify-center">
                        <Volume2 className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-text-main">Speaker Settings</h4>
                        <p className="text-xs text-text-muted">Choose your audio output device</p>
                    </div>
                </div>

                <div className="space-y-3 pl-1">
                    <div className="flex items-center justify-between">
                        <label htmlFor="audio-output-select" className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Output Device</label>
                    </div>

                    {!isOutputSupported ? (
                        <div className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 text-sm font-medium text-text-muted flex items-center gap-2 italic">
                            <AlertCircle className="w-4 h-4 shrink-0 text-amber-500" />
                            Not supported in this browser
                        </div>
                    ) : (
                        <SettingsSelect
                            value={audioOutputDeviceId}
                            onChange={(val) => setAudioOutputDeviceId(val || null)}
                            placeholder="System Default"
                            options={audioOutputDevices.filter(d => d.deviceId !== 'default').map(d => ({
                                value: d.deviceId,
                                label: d.label || `Speaker ${d.deviceId.slice(0, 5)}...`
                            }))}
                        />
                    )}
                    <p className="text-[10px] text-text-muted italic pt-1">
                        {!isOutputSupported
                            ? "Your browser doesn't allow switching speakers. Please use your system settings."
                            : "Speakers or headphones used for incoming audio."
                        }
                    </p>
                </div>
            </div>

            <div className="h-px bg-gray-100 my-4" />

            {/* Microphone Settings */}
            <div className="space-y-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/5 flex items-center justify-center">
                        <Mic className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-text-main">Microphone Settings</h4>
                        <p className="text-xs text-text-muted">Test your input and adjust volume</p>
                    </div>
                </div>

                <div className="space-y-6 pl-1">
                    {/* Device Selection FIRST */}
                    <div className="space-y-3">
                        <label htmlFor="audio-input-select" className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Input Device</label>
                        <SettingsSelect
                            value={audioDeviceId}
                            onChange={(val) => setAudioDeviceId(val || null)}
                            placeholder="System Default"
                            options={audioDevices.filter(d => d.deviceId !== 'default').map(d => ({
                                value: d.deviceId,
                                label: d.label || `Microphone ${d.deviceId.slice(0, 5)}...`
                            }))}
                        />
                    </div>

                    <div className="space-y-3 pt-2">
                        <SettingsToggle
                            label="Join Unmuted"
                            description="Enable your microphone when joining a room"
                            value={joinUnmuted}
                            onChange={() => setJoinUnmuted(!joinUnmuted)}
                        />
                    </div>

                    {/* Noise Suppression */}
                    <div className="space-y-4">
                        <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Noise Suppression</label>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                            {NOISE_SUPPRESSION_OPTIONS.map(opt => (
                                <SettingsOptionButton
                                    key={opt.value}
                                    active={noiseSuppressionMode === opt.value}
                                    onClick={() => setNoiseSuppressionMode(opt.value)}
                                >
                                    {opt.label}
                                </SettingsOptionButton>
                            ))}
                        </div>
                        <p className="text-[10px] text-text-muted italic">
                            {NOISE_SUPPRESSION_OPTIONS.find(o => o.value === noiseSuppressionMode)?.desc}
                        </p>
                    </div>

                    {/* Gain Slider */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Input Gain</label>
                            <span className="text-[11px] font-mono font-bold text-primary px-2 py-0.5">
                                {microphoneGain.toFixed(1)}x
                            </span>
                        </div>
                        <SettingsSlider
                            value={microphoneGain * 10}
                            onChange={(v) => setMicrophoneGain(v / 10)}
                            min={0}
                            max={50}
                            step={1}
                            leftIcon={Mic}
                        />
                    </div>

                    <div className="h-px bg-gray-100" />

                    {/* Visualizer / Test */}
                    <MicTestSection gain={microphoneGain} audioOutputDeviceId={audioOutputDeviceId} />
                </div>
            </div>
        </div>
    );
}
