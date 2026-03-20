"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useSettingsStore, type NoiseSuppressionMode } from '@/store/useSettingsStore';
import { resizeImage } from '@/lib/image';
import { SettingsOptionButton } from '@/components/ui/SettingsOptionButton';
import { SettingsSlider } from '@/components/ui/SettingsSlider';
import {
    Mic, Volume2, ImageIcon, CircleSlash, MonitorPlay, Upload, Trash2, Loader2,
    Volume2 as Volume2Icon, AlertCircle,
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

// ─── AudioVideoTab ────────────────────────────────────────────────────────────

interface AudioVideoTabProps {
    audioDevices: MediaDeviceInfo[];
    videoDevices: MediaDeviceInfo[];
    audioOutputDevices: MediaDeviceInfo[];
    activeAudioId: string;
    activeVideoId: string;
    activeAudioOutputId: string;
}

export function AudioVideoTab({
    audioDevices,
    videoDevices,
    audioOutputDevices,
}: AudioVideoTabProps) {
    const isOutputSupported = (() => {
        if (typeof HTMLMediaElement === 'undefined' || !('setSinkId' in HTMLMediaElement.prototype)) return false;
        // LiveKit rule: Safari/iOS based browsers don't support output switching reliably
        const isSafariBased = /Safari/i.test(navigator.userAgent) && !/Chrome/i.test(navigator.userAgent) || /iPhone|iPad|iPod/i.test(navigator.userAgent);
        return !isSafariBased;
    })();
    const {
        noiseSuppressionMode, microphoneGain,
        audioDeviceId, videoDeviceId, audioOutputDeviceId,
        virtualBackground, virtualBackgroundImage, blurRadius,
        setNoiseSuppressionMode, setMicrophoneGain,
        setAudioDeviceId, setVideoDeviceId, setAudioOutputDeviceId,
        setVirtualBackground, setVirtualBackgroundImage, setBlurRadius,
    } = useSettingsStore();

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const dataUrl = await resizeImage(file, 1280, 720);
            setVirtualBackgroundImage(dataUrl);
            setVirtualBackground('image');
        } catch (err) {
            console.error('Failed to resize image:', err);
        }
    };

    return (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Noise Suppression */}
            <div className="space-y-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/5 flex items-center justify-center">
                        <Mic className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-text-main">Noise Suppression</h4>
                        <p className="text-xs text-text-muted">Reduce background noise for crystal clear audio</p>
                    </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                <p className="text-[11px] text-text-muted bg-gray-50 p-3 rounded-xl border border-gray-100 italic">
                    {NOISE_SUPPRESSION_OPTIONS.find(o => o.value === noiseSuppressionMode)?.desc}
                </p>
            </div>

            <div className="h-px bg-gray-100 my-8" />

            {/* Audio Output Settings */}
            <div className="space-y-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/5 flex items-center justify-center">
                        <Volume2 className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-text-main">Speaker Settings</h4>
                        <p className="text-xs text-text-muted">Choose your audio output device</p>
                    </div>
                </div>

                <div className={`bg-gray-50 p-6 rounded-[28px] border border-gray-100 ${!isOutputSupported ? 'opacity-85' : ''}`}>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <label htmlFor="audio-output-select" className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Output Device</label>
                        </div>

                        {!isOutputSupported ? (
                            <div className="flex flex-col gap-2">
                                <div className="w-full bg-gray-100 border border-gray-100 rounded-xl px-4 py-2.5 text-sm font-medium text-text-muted flex items-center gap-2 italic">
                                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-500" />
                                    Not supported in this browser
                                </div>
                            </div>
                        ) : (
                            <select
                                id="audio-output-select"
                                value={audioOutputDeviceId || ''}
                                onChange={(e) => setAudioOutputDeviceId(e.target.value || null)}
                                className="w-full bg-white border border-gray-100 rounded-xl px-4 py-2.5 text-sm font-medium text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none cursor-pointer"
                                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1rem' }}
                            >
                                <option value="">System Default</option>
                                {audioOutputDevices.filter(d => d.deviceId !== 'default').map((device) => (
                                    <option key={device.deviceId} value={device.deviceId}>
                                        {device.label || `Speaker ${device.deviceId.slice(0, 5)}...`}
                                    </option>
                                ))}
                            </select>
                        )}

                        <p className="text-[10px] text-text-muted italic px-1 pt-1">
                            {!isOutputSupported
                                ? "Your browser doesn't allow switching speakers. Please use your system settings."
                                : "Speakers or headphones used for incoming audio."
                            }
                        </p>
                    </div>
                </div>
            </div>

            <div className="h-px bg-gray-100 my-8" />

            {/* Microphone Test & Gain */}
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

                <div className="space-y-6 bg-gray-50 p-6 rounded-[28px] border border-gray-100">
                    {/* Audio Input Selector */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <label htmlFor="audio-input-select" className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Input Device</label>
                        </div>
                        <select
                            id="audio-input-select"
                            value={audioDeviceId || ''}
                            onChange={(e) => setAudioDeviceId(e.target.value || null)}
                            className="w-full bg-white border border-gray-100 rounded-xl px-4 py-2.5 text-sm font-medium text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none cursor-pointer"
                            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1rem' }}
                        >
                            <option value="">System Default</option>
                            {audioDevices.filter(d => d.deviceId !== 'default').map((device) => (
                                <option key={device.deviceId} value={device.deviceId}>
                                    {device.label || `Microphone ${device.deviceId.slice(0, 5)}...`}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="h-px bg-gray-100" />

                    {/* Gain Slider */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Input Gain</label>
                            <span className="text-[11px] font-mono font-bold text-primary bg-white px-2 py-0.5 rounded-lg border border-gray-100 shadow-sm">
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
                            className="px-1"
                        />
                        <p className="text-[10px] text-text-muted italic px-1">
                            Increase this if your voice is too quiet for noise suppression to detect.
                        </p>
                    </div>

                    <div className="h-px bg-gray-100" />

                    {/* Visualizer / Test */}
                    <MicTestSection gain={microphoneGain} audioOutputDeviceId={audioOutputDeviceId} />
                </div>
            </div>

            <div className="h-px bg-gray-100 my-8" />
            {/* Virtual Background */}
            <div className="space-y-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/5 flex items-center justify-center">
                        <ImageIcon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-text-main">Video Settings</h4>
                        <p className="text-xs text-text-muted">Choose your camera and background</p>
                    </div>
                </div>

                <div className="space-y-6 bg-gray-50 p-6 rounded-[28px] border border-gray-100">
                    {/* Video Device Selector */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <label htmlFor="video-input-select" className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Camera</label>
                        </div>
                        <select
                            id="video-input-select"
                            value={videoDeviceId || ''}
                            onChange={(e) => setVideoDeviceId(e.target.value || null)}
                            className="w-full bg-white border border-gray-100 rounded-xl px-4 py-2.5 text-sm font-medium text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none cursor-pointer"
                            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1rem' }}
                        >
                            <option value="">System Default</option>
                            {videoDevices.map((device) => (
                                <option key={device.deviceId} value={device.deviceId}>
                                    {device.label || `Camera ${device.deviceId.slice(0, 5)}...`}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="h-px bg-gray-100" />

                    {/* Virtual Background */}
                    <div className="space-y-3">
                        <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider px-1">Background Effects</label>
                        <div className="grid grid-cols-3 gap-3">
                            <button
                                onClick={() => setVirtualBackground('none')}
                                className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 transition-all ${virtualBackground === 'none'
                                    ? 'border-primary bg-primary/5 text-primary shadow-sm'
                                    : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50 text-text-main'
                                    }`}
                            >
                                <CircleSlash className="w-5 h-5 text-current opacity-70" />
                                <span className="text-[11px] font-bold">None</span>
                            </button>

                            <button
                                onClick={() => setVirtualBackground('blur')}
                                className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 transition-all ${virtualBackground === 'blur'
                                    ? 'border-primary bg-primary/5 text-primary shadow-sm'
                                    : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50 text-text-main'
                                    }`}
                            >
                                <MonitorPlay className="w-5 h-5 text-current opacity-70" />
                                <span className="text-[11px] font-bold">Blur</span>
                            </button>

                            <button
                                onClick={() => setVirtualBackground('image')}
                                className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 transition-all ${virtualBackground === 'image'
                                    ? 'border-primary bg-primary/5 text-primary shadow-sm'
                                    : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50 text-text-main'
                                    }`}
                            >
                                <ImageIcon className="w-5 h-5 text-current opacity-70" />
                                <span className="text-[11px] font-bold">Image</span>
                            </button>
                        </div>

                        {/* Blur Settings */}
                        {virtualBackground === 'blur' && (
                            <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="mb-3 px-1 text-xs font-bold text-text-muted uppercase tracking-wider">
                                    Blur Intensity
                                </div>
                                <SettingsSlider
                                    value={blurRadius}
                                    onChange={setBlurRadius}
                                    min={5}
                                    max={30}
                                    step={1}
                                    label={`${Math.round(((blurRadius - 5) / 25) * 100)}%`}
                                    className="px-0"
                                />
                            </div>
                        )}

                        {/* Image Options */}
                        {virtualBackground === 'image' && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                <input
                                    type="file"
                                    accept="image/*"
                                    ref={fileInputRef}
                                    onChange={handleImageUpload}
                                    className="hidden"
                                />

                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 border-dashed border-gray-200 hover:border-primary hover:bg-primary/5 text-text-muted hover:text-primary transition-all aspect-video group"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                                            <Upload className="w-4 h-4" />
                                        </div>
                                        <span className="text-[10px] font-bold uppercase tracking-wider">Upload Image</span>
                                    </button>

                                    {virtualBackgroundImage && (
                                        <div className={`relative group aspect-video rounded-2xl overflow-hidden border-2 transition-all ${virtualBackground === 'image'
                                            ? 'border-primary shadow-md'
                                            : 'border-transparent hover:border-gray-200'
                                            }`}>
                                            <button
                                                onClick={() => setVirtualBackground('image')}
                                                className="w-full h-full text-left"
                                            >
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={virtualBackgroundImage}
                                                    alt="Custom background"
                                                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                                />
                                                <div className={`absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors ${virtualBackground === 'image' ? 'bg-black/0' : ''}`} />
                                            </button>

                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setVirtualBackgroundImage(null);
                                                    if (virtualBackground === 'image') setVirtualBackground('none');
                                                }}
                                                className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-primary text-white rounded-xl backdrop-blur-md transition-all opacity-0 group-hover:opacity-100"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <p className="text-[10px] text-text-muted text-center italic">Images stay on your device for privacy. Max resolution 720p.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
