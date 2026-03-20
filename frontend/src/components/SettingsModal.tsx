"use client";

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    useRoomContext,
    useMediaDeviceSelect,
} from '@livekit/components-react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { useSettingsStore, QUALITY_OPTIONS, SCREEN_RES_OPTIONS, SCREEN_FPS_OPTIONS, type VideoQuality, type ScreenShareResolution, type ScreenShareFps, type NoiseSuppressionMode } from '@/store/useSettingsStore';
import { playSound, type SoundName } from '@/lib/sounds';
import { PRESET_COLORS, getContrastColor } from '@/lib/colors';
import {
    X, Settings, Mic, Monitor, Palette, Bell, User, Lock, Trash2,
    ChevronDown, VolumeX, Volume2, ImageIcon, Check, Pencil, Loader2,
    Sun, Moon, ScreenShare, CircleSlash, MonitorPlay, Upload
} from 'lucide-react';
import { Room } from 'livekit-client';
import { SettingsNavButton } from '@/components/ui/SettingsNavButton';
import { SettingsOptionButton } from '@/components/ui/SettingsOptionButton';
import { SettingsToggle } from '@/components/ui/SettingsToggle';
import { SettingsSlider } from '@/components/ui/SettingsSlider';

type TabId = 'audio-video' | 'quality' | 'interface' | 'sounds' | 'profile' | 'account';

const NOISE_SUPPRESSION_OPTIONS: { value: NoiseSuppressionMode; label: string; desc: string }[] = [
    { value: 'off', label: 'Off', desc: 'No background noise reduction' },
    { value: 'rnnoise', label: 'RNNoise', desc: 'AI-powered (best quality, slight latency)' },
    { value: 'native', label: 'Native', desc: 'Browser built-in (zero latency)' },
    { value: 'filter', label: 'Filter', desc: 'Bandpass filter (removes rumble & hiss)' },
];

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

interface SettingsModalProps {
    onClose: () => void;
    defaultTab?: TabId;
}

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

function MicTestSection({ gain }: { gain: number }) {
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

            const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
                            {isPlaying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Volume2 className="w-3 h-3" />}
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
                {/* Always render but with null src if empty to avoid nextjs warning, and use a key to force re-render when url changes */}
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

export function SettingsModal({ onClose, defaultTab }: SettingsModalProps) {
    const router = useRouter();
    const { user, token, setAuth, deleteAccount } = useAuthStore();
    const {
        soundsEnabled, soundVolume, videoQuality, showDevInfo, autoHideControlBar, noiseSuppressionMode, microphoneGain,
        audioDeviceId, videoDeviceId,
        screenShareResolution, screenShareFps, virtualBackground, virtualBackgroundImage, blurRadius, theme,
        setSoundsEnabled, setSoundVolume, setVideoQuality, setShowDevInfo, setAutoHideControlBar, setNoiseSuppressionMode, setMicrophoneGain,
        setAudioDeviceId, setVideoDeviceId,
        setScreenShareResolution, setScreenShareFps, setVirtualBackground, setVirtualBackgroundImage, setBlurRadius, setTheme,
    } = useSettingsStore();

    // Fallback device list state
    const [fallbackAudioDevices, setFallbackAudioDevices] = useState<MediaDeviceInfo[]>([]);
    const [fallbackVideoDevices, setFallbackVideoDevices] = useState<MediaDeviceInfo[]>([]);

    // Safely try to get LiveKit context
    let room: Room | null = null;
    let lkAudioDevices: MediaDeviceInfo[] = [];
    let lkVideoDevices: MediaDeviceInfo[] = [];
    let lkActiveAudioId: string | undefined;
    let lkActiveVideoId: string | undefined;

    try {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        room = useRoomContext();
        // eslint-disable-next-line react-hooks/rules-of-hooks
        const { devices: aDevices, activeDeviceId: aId } = useMediaDeviceSelect({ kind: 'audioinput' });
        // eslint-disable-next-line react-hooks/rules-of-hooks
        const { devices: vDevices, activeDeviceId: vId } = useMediaDeviceSelect({ kind: 'videoinput' });
        lkAudioDevices = aDevices;
        lkVideoDevices = vDevices;
        lkActiveAudioId = aId;
        lkActiveVideoId = vId;
    } catch {
        // No LiveKit context
    }

    // Effect for fallback device enumeration
    useEffect(() => {
        if (!room) {
            const updateDevices = async () => {
                try {
                    let devices = await navigator.mediaDevices.enumerateDevices();

                    // If labels are empty, it's likely permissions haven't been granted.
                    // Requesting a temporary stream will trigger the browser permission prompt
                    // and then populate the device labels.
                    const hasLabels = devices.some(d => d.label);
                    if (!hasLabels && typeof navigator !== 'undefined' && navigator.mediaDevices.getUserMedia) {
                        try {
                            const hasAudio = devices.some(d => d.kind === 'audioinput');
                            const hasVideo = devices.some(d => d.kind === 'videoinput');

                            if (hasAudio) {
                                try {
                                    const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                                    audioStream.getTracks().forEach(t => t.stop());
                                } catch (e) {
                                    console.warn('SettingsModal: Audio permission denied or failed', e);
                                }
                            }

                            if (hasVideo) {
                                try {
                                    const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
                                    videoStream.getTracks().forEach(t => t.stop());
                                } catch (e) {
                                    console.warn('SettingsModal: Video permission denied or failed', e);
                                }
                            }

                            // Refresh device list now that labels should be available
                            devices = await navigator.mediaDevices.enumerateDevices();
                        } catch (e) {
                            console.warn('SettingsModal: Individual permission requests failed', e);
                        }
                    }

                    setFallbackAudioDevices(devices.filter(d => d.kind === 'audioinput'));
                    setFallbackVideoDevices(devices.filter(d => d.kind === 'videoinput'));
                } catch (err) {
                    console.error('SettingsModal: Error enumerating devices:', err);
                }
            };
            updateDevices();
            navigator.mediaDevices.addEventListener('devicechange', updateDevices);
            return () => navigator.mediaDevices.removeEventListener('devicechange', updateDevices);
        }
    }, [room]);

    const audioDevices = room ? lkAudioDevices : fallbackAudioDevices;
    const videoDevices = room ? lkVideoDevices : fallbackVideoDevices;
    const activeAudioId = room ? lkActiveAudioId : audioDeviceId;
    const activeVideoId = room ? lkActiveVideoId : videoDeviceId;

    const handleAudioDeviceChange = async (deviceId: string) => {
        setAudioDeviceId(deviceId);
        if (room) {
            await room.switchActiveDevice('audioinput', deviceId);
        }
    };

    const handleVideoDeviceChange = async (deviceId: string) => {
        setVideoDeviceId(deviceId);
        if (room) {
            await room.switchActiveDevice('videoinput', deviceId);
        }
    };

    const [activeTab, setActiveTab] = useState<TabId>(defaultTab || 'audio-video');
    const [isNavExpanded, setIsNavExpanded] = useState(false);
    const backdropRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Profile Edit State
    const [editName, setEditName] = useState(user?.name || '');
    const [editColor, setEditColor] = useState(user?.avatarColor || '#FF5A5F');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [profileLoading, setProfileLoading] = useState(false);
    const [profileError, setProfileError] = useState('');
    const [profileSuccess, setProfileSuccess] = useState('');

    // Delete Modal State
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleting, setDeleting] = useState(false);

    // Lock body scroll
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    // Escape key to close
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    if (!user || typeof document === 'undefined') return null;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

    const handleProfileUpdate = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        setProfileLoading(true);
        setProfileError('');
        setProfileSuccess('');

        const body: Record<string, string> = {};
        if (editName !== user.name) body.name = editName;
        if (newPassword) body.newPassword = newPassword;
        if (currentPassword) body.currentPassword = currentPassword;
        if (editColor !== (user.avatarColor || '#FF5A5F')) body.avatarColor = editColor;

        if (Object.keys(body).length === 0 || (Object.keys(body).length === 1 && body.currentPassword)) {
            setProfileError('No changes to save');
            setProfileLoading(false);
            return;
        }

        try {
            const res = await fetch(`${apiUrl}/api/auth/me`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                credentials: 'include',
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Update failed');

            setAuth(data.user, token!);
            setProfileSuccess('Profile updated successfully');
            setCurrentPassword('');
            setNewPassword('');
        } catch (err: unknown) {
            setProfileError(err instanceof Error ? err.message : 'Error');
        } finally {
            setProfileLoading(false);
        }
    };

    const handleDeleteAccount = async () => {
        setDeleting(true);
        await deleteAccount();
        setDeleting(false);
        setShowDeleteModal(false);
        onClose();
        router.push('/');
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Max resolution 1280x720
                const MAX_WIDTH = 1280;
                const MAX_HEIGHT = 720;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = Math.round(width);
                canvas.height = Math.round(height);
                const ctx = canvas.getContext('2d');
                if (!ctx) return;

                ctx.drawImage(img, 0, 0, width, height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.85); // Compress as JPEG
                setVirtualBackgroundImage(dataUrl);
                setVirtualBackground('image');
            };
            img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
    };

    const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
        { id: 'audio-video', label: 'Audio & Video', icon: Mic },
        { id: 'quality', label: 'Stream Quality', icon: Monitor },
        { id: 'interface', label: 'Interface', icon: Palette },
        { id: 'sounds', label: 'Sounds', icon: Bell },
        { id: 'profile', label: 'My Profile', icon: User },
        { id: 'account', label: 'Account', icon: Lock },
    ];

    return createPortal(
        <>
            <div
                ref={backdropRef}
                className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
                onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
            >
                <div className="bg-surface rounded-3xl shadow-2xl border border-white/10 w-full max-w-4xl flex flex-col md:flex-row overflow-hidden h-[600px] max-h-[90vh]">
                    {/* Sidebar Navigation */}
                    <div className={`w-full md:w-64 bg-gray-50 border-b md:border-b-0 md:border-r border-gray-100 flex flex-col shrink-0 transition-all duration-300 ${isNavExpanded ? 'h-auto' : 'h-auto md:h-full'}`}>
                        <div className="p-6 md:p-8 flex items-center justify-between">
                            <h2 className="text-xl font-bold text-text-main flex items-center gap-2">
                                <Settings className="w-5 h-5 text-primary" />
                                <span className="md:inline">Settings</span>
                            </h2>
                            {/* Close Button on Mobile (Upper Right) */}
                            <button
                                onClick={onClose}
                                className="md:hidden p-2 rounded-xl text-text-muted hover:bg-gray-100 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Navigation - Hidden on mobile if not expanded */}
                        <nav className={`flex-1 px-4 pt-2 pb-6 space-y-1 overflow-y-auto hidden md:block`}>
                            {tabs.map((tab) => (
                                <SettingsNavButton
                                    key={tab.id}
                                    isActive={activeTab === tab.id}
                                    onClick={() => {
                                        setActiveTab(tab.id);
                                        setIsNavExpanded(false);
                                    }}
                                    icon={tab.icon}
                                    label={tab.label}
                                />
                            ))}
                        </nav>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 flex flex-col min-w-0 bg-white min-h-0">
                        <div className="flex flex-col border-b border-gray-50 shrink-0">
                            <div className="flex items-center justify-between px-6 md:px-8 py-4 md:py-6">
                                <h3 className="text-base font-bold text-text-main">
                                    {tabs.find(t => t.id === activeTab)?.label}
                                </h3>
                                <div className="flex items-center gap-2">
                                    {/* Mobile Expand Toggle */}
                                    <button
                                        onClick={() => setIsNavExpanded(!isNavExpanded)}
                                        className="md:hidden p-2 rounded-xl text-primary hover:bg-primary/5 transition-all"
                                    >
                                        <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${isNavExpanded ? 'rotate-180' : 'rotate-0'}`} />
                                    </button>
                                    {/* Desktop Close Button */}
                                    <button
                                        onClick={onClose}
                                        className="hidden md:block p-2 rounded-xl text-text-muted hover:text-text-main hover:bg-gray-100 transition-colors"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            {/* Mobile Navigation List (Expands under active tab) */}
                            {isNavExpanded && (
                                <nav className="md:hidden px-4 pt-1 pb-4 space-y-1 animate-in slide-in-from-top-2 duration-200">
                                    {tabs.map((tab) => (
                                        <SettingsNavButton
                                            key={tab.id}
                                            isActive={activeTab === tab.id}
                                            onClick={() => {
                                                setActiveTab(tab.id);
                                                setIsNavExpanded(false);
                                            }}
                                            icon={tab.icon}
                                            label={tab.label}
                                        />
                                    ))}
                                </nav>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 scroll-smooth overscroll-contain">
                            {/* Audio & Video */}
                            {activeTab === 'audio-video' && (
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
                                            {/* Audio Device Selector */}
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between px-1">
                                                    <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Input Device</label>
                                                </div>
                                                <select
                                                    value={activeAudioId || ''}
                                                    onChange={(e) => handleAudioDeviceChange(e.target.value)}
                                                    className="w-full bg-white border border-gray-100 rounded-xl px-4 py-2.5 text-sm font-medium text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none cursor-pointer"
                                                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1rem' }}
                                                >
                                                    {audioDevices.map((device) => (
                                                        <option key={device.deviceId} value={device.deviceId}>
                                                            {device.label || `Microphone ${device.deviceId.slice(0, 5)}...`}
                                                        </option>
                                                    ))}
                                                    {audioDevices.length === 0 && <option disabled>No microphones found</option>}
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
                                            <MicTestSection gain={microphoneGain} />
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
                                                    <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Camera</label>
                                                </div>
                                                <select
                                                    value={activeVideoId || ''}
                                                    onChange={(e) => handleVideoDeviceChange(e.target.value)}
                                                    className="w-full bg-white border border-gray-100 rounded-xl px-4 py-2.5 text-sm font-medium text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none cursor-pointer"
                                                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1rem' }}
                                                >
                                                    {videoDevices.map((device) => (
                                                        <option key={device.deviceId} value={device.deviceId}>
                                                            {device.label || `Camera ${device.deviceId.slice(0, 5)}...`}
                                                        </option>
                                                    ))}
                                                    {videoDevices.length === 0 && <option disabled>No cameras found</option>}
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
                                                            : 'border-gray-50 hover:border-gray-200 hover:bg-gray-50 text-text-main'
                                                            }`}
                                                    >
                                                        <CircleSlash className="w-5 h-5 text-current opacity-70" />
                                                        <span className="text-[11px] font-bold">None</span>
                                                    </button>

                                                    <button
                                                        onClick={() => setVirtualBackground('blur')}
                                                        className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 transition-all ${virtualBackground === 'blur'
                                                            ? 'border-primary bg-primary/5 text-primary shadow-sm'
                                                            : 'border-gray-50 hover:border-gray-200 hover:bg-gray-50 text-text-main'
                                                            }`}
                                                    >
                                                        <MonitorPlay className="w-5 h-5 text-current opacity-70" />
                                                        <span className="text-[11px] font-bold">Blur</span>
                                                    </button>

                                                    <button
                                                        onClick={() => setVirtualBackground('image')}
                                                        className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 transition-all ${virtualBackground === 'image'
                                                            ? 'border-primary bg-primary/5 text-primary shadow-sm'
                                                            : 'border-gray-50 hover:border-gray-200 hover:bg-gray-50 text-text-main'
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
                            )}

                            {/* Quality */}
                            {activeTab === 'quality' && (
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
                            )}

                            {/* Interface */}
                            {activeTab === 'interface' && (
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
                            )}

                            {/* Sounds */}
                            {activeTab === 'sounds' && (
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
                            )}

                            {/* My Profile */}
                            {activeTab === 'profile' && (
                                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    <form onSubmit={handleProfileUpdate} className="space-y-8">
                                        {profileError && <div className="p-3 bg-red-50 text-red-600 rounded-2xl text-xs text-center">{profileError}</div>}
                                        {profileSuccess && <div className="p-3 bg-green-50 text-green-600 rounded-2xl text-xs text-center flex items-center justify-center gap-2"><Check className="w-4 h-4" />{profileSuccess}</div>}

                                        <div className="space-y-6">
                                            <div className="flex items-center gap-4">
                                                <div
                                                    className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold shadow-lg shadow-black/5"
                                                    style={{ backgroundColor: editColor, color: getContrastColor(editColor) }}
                                                >
                                                    {editName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                                                </div>
                                                <div className="flex-1">
                                                    <label className="block text-xs font-bold text-text-muted uppercase tracking-widest mb-2 px-1">Username</label>
                                                    <div className="relative group">
                                                        <Pencil className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted group-focus-within:text-primary transition-colors" />
                                                        <input
                                                            type="text"
                                                            value={editName}
                                                            onChange={(e) => { setEditName(e.target.value); setProfileSuccess(''); }}
                                                            className="w-full h-12 pl-11 pr-4 rounded-2xl border border-gray-100 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm font-semibold"
                                                            required
                                                            maxLength={50}
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="h-px bg-gray-50" />

                                            <div className="space-y-4">
                                                <label className="block text-xs font-bold text-text-muted uppercase tracking-widest px-1">Profile Color</label>
                                                <div className="flex flex-wrap gap-2 px-1">
                                                    {PRESET_COLORS.map((color) => (
                                                        <button
                                                            key={color}
                                                            type="button"
                                                            onClick={() => { setEditColor(color); setProfileSuccess(''); }}
                                                            className={`w-10 h-10 rounded-xl cursor-pointer flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 border-2 ${editColor.toUpperCase() === color.toUpperCase() ? 'border-primary shadow-md ring-2 ring-primary/10' : 'border-transparent'}`}
                                                            style={{ backgroundColor: color }}
                                                        >
                                                            {editColor.toUpperCase() === color.toUpperCase() && <Check className="w-5 h-5" style={{ color: getContrastColor(color) }} />}
                                                        </button>
                                                    ))}
                                                    <div
                                                        className={`relative w-10 h-10 rounded-full cursor-pointer flex items-center justify-center border-2 border-[var(--color-surface)] shadow-sm overflow-hidden transition-all duration-200 ${!PRESET_COLORS.map(c => c.toUpperCase()).includes(editColor.toUpperCase()) ? 'ring-2 ring-primary ring-offset-1 ring-offset-[var(--color-surface)]' : ''
                                                            }`}
                                                        style={{
                                                            background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)',
                                                        }}
                                                        title="Custom Color"
                                                    >
                                                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none transition-colors duration-200"
                                                            style={{
                                                                backgroundColor: !PRESET_COLORS.map(c => c.toUpperCase()).includes(editColor.toUpperCase()) ? editColor : 'transparent'
                                                            }}
                                                        >
                                                            {!PRESET_COLORS.map(c => c.toUpperCase()).includes(editColor.toUpperCase()) ? (
                                                                <Check
                                                                    className="w-5 h-5 drop-shadow-sm"
                                                                    style={{ color: getContrastColor(editColor) }}
                                                                />
                                                            ) : (
                                                                <Palette className="w-4 h-4 text-gray-500" />
                                                            )}
                                                        </div>
                                                        <input
                                                            type="color"
                                                            value={editColor}
                                                            onChange={(e) => { setEditColor(e.target.value.toUpperCase()); setProfileSuccess(''); }}
                                                            className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <button
                                            type="submit"
                                            disabled={profileLoading}
                                            className="w-full h-12 rounded-2xl bg-primary text-white text-sm font-bold shadow-lg shadow-primary/20 hover:bg-[#E0484D] active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                                        >
                                            {profileLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Save Profile Changes'}
                                        </button>
                                    </form>
                                </div>
                            )}

                            {/* Account & Security */}
                            {activeTab === 'account' && (
                                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-8">
                                    <div className="space-y-6">
                                        <h4 className="text-xs font-bold text-text-muted uppercase tracking-widest px-1">Password & Security</h4>
                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <label className="text-[11px] font-bold text-text-muted ml-1">New Password</label>
                                                <input
                                                    type="password"
                                                    value={newPassword}
                                                    onChange={(e) => {
                                                        setNewPassword(e.target.value);
                                                        setProfileSuccess('');
                                                        setProfileError('');
                                                    }}
                                                    placeholder="••••••••"
                                                    className="w-full h-12 px-4 rounded-2xl border border-gray-100 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm font-semibold"
                                                />
                                            </div>
                                            {newPassword.length > 0 && (
                                                <>
                                                    <div className="space-y-2">
                                                        <label className="text-[11px] font-bold text-primary ml-1">Current Password Required</label>
                                                        <input
                                                            type="password"
                                                            value={currentPassword}
                                                            onChange={(e) => {
                                                                setCurrentPassword(e.target.value);
                                                                setProfileSuccess('');
                                                                setProfileError('');
                                                            }}
                                                            placeholder="Enter current password to continue"
                                                            className="w-full h-12 px-4 rounded-2xl border border-primary/20 bg-primary/5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm font-semibold"
                                                            required
                                                        />
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={(e) => handleProfileUpdate(e)}
                                                        disabled={profileLoading || !currentPassword}
                                                        className="w-full h-12 mt-4 rounded-2xl bg-primary text-white text-sm font-bold shadow-lg shadow-primary/20 hover:bg-[#E0484D] active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                                                    >
                                                        {profileLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Save New Password'}
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {(profileError || profileSuccess) && (
                                        <div className="space-y-4">
                                            {profileError && <div className="p-3 bg-red-50 text-red-600 rounded-2xl text-xs text-center">{profileError}</div>}
                                            {profileSuccess && <div className="p-3 bg-green-50 text-green-600 rounded-2xl text-xs text-center flex items-center justify-center gap-2"><Check className="w-4 h-4" />{profileSuccess}</div>}
                                        </div>
                                    )}

                                    <div className="h-px bg-gray-50" />

                                    <div className="space-y-4">
                                        <h4 className="text-xs font-bold text-text-muted uppercase tracking-widest px-1">Account Actions</h4>
                                        <div className="group relative p-6 bg-red-50/50 dark:bg-red-400/5 rounded-[28px] border border-red-100 dark:border-red-500/20 backdrop-blur-sm transition-all hover:bg-red-50 dark:hover:bg-red-500/10 overflow-hidden">
                                            {/* Decorative background element */}
                                            <div className="absolute -right-6 -top-6 w-24 h-24 bg-red-500/5 dark:bg-white/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500 pointer-events-none" />

                                            <div className="relative space-y-5">
                                                <div className="flex items-start gap-4">
                                                    <div className="w-10 h-10 rounded-2xl bg-white dark:bg-red-500/10 flex items-center justify-center shadow-sm border border-red-50 dark:border-red-500/20 shrink-0">
                                                        <Trash2 className="w-5 h-5 text-red-500 transition-transform group-hover:rotate-12" />
                                                    </div>
                                                    <div>
                                                        <h5 className="text-sm font-bold text-red-600 dark:text-white-400">Delete Account</h5>
                                                        <p className="text-xs text-white-500/70 dark:text-white-400/60 mt-1 leading-relaxed max-w-[340px]">
                                                            Permanently remove your account and all associated data. This action is irreversible.
                                                        </p>
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={() => setShowDeleteModal(true)}
                                                    className="w-full h-12 rounded-2xl bg-white dark:bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-bold shadow-sm border border-red-100 dark:border-red-500/20 hover:border-red-600 dark:hover:border-red-500 hover:shadow-lg hover:shadow-red-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 group/btn"
                                                >
                                                    Delete My Account
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Delete Account Confirmation */}
            {showDeleteModal && (
                <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="bg-surface rounded-[32px] shadow-2xl border border-white/10 max-w-sm w-full p-8 animate-in zoom-in duration-300 relative overflow-hidden">
                        {/* Decorative background element */}
                        <div className="absolute -right-12 -top-12 w-48 h-48 bg-red-500/5 dark:bg-red-500/10 rounded-full blur-3xl pointer-events-none" />

                        <div className="relative">
                            <div className="flex items-center justify-center w-20 h-20 rounded-[24px] bg-red-50 dark:bg-red-500/10 mx-auto mb-6 shadow-sm border border-red-100 dark:border-red-500/20">
                                <Trash2 className="w-10 h-10 text-red-500 transition-transform hover:scale-110 duration-300" />
                            </div>
                            <h2 className="text-2xl font-bold text-text-main text-center mb-3">Wait! Are you sure?</h2>
                            <p className="text-text-muted text-sm text-center mb-8 leading-relaxed">
                                This will permanently delete your account and all associated data. This action <strong>cannot be undone</strong>.
                            </p>
                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={handleDeleteAccount}
                                    disabled={deleting}
                                    className="w-full py-4 rounded-2xl bg-red-600 dark:bg-red-500 text-white text-sm font-bold shadow-lg shadow-red-500/20 hover:bg-[#E0484D] dark:hover:bg-red-400 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                                >
                                    {deleting ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                                        <>
                                            <Trash2 className="w-4 h-4" />
                                            Yes, Delete My Account
                                        </>
                                    )}
                                </button>
                                <button
                                    onClick={() => setShowDeleteModal(false)}
                                    className="w-full py-4 rounded-2xl border border-gray-100 dark:border-white/10 text-sm font-bold text-text-muted hover:text-text-main hover:bg-gray-50 dark:hover:bg-white/5 transition-all"
                                >
                                    Nevermind, keep it
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>,
        document.body
    );
}
