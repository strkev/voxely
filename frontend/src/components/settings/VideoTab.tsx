"use client";

import React, { useRef } from 'react';
import { useSettingsStore, QUALITY_OPTIONS, type VideoQuality } from '@/store/useSettingsStore';
import { SettingsOptionButton } from '@/components/ui/SettingsOptionButton';
import { SettingsSlider } from '@/components/ui/SettingsSlider';
import { SettingsSelect } from '@/components/ui/SettingsSelect';
import { resizeImage } from '@/lib/image';
import {
    ImageIcon, CircleSlash, MonitorPlay, Upload, Trash2,
} from 'lucide-react';

interface VideoTabProps {
    videoDevices: MediaDeviceInfo[];
}

export function VideoTab({
    videoDevices,
}: VideoTabProps) {
    const {
        videoDeviceId, videoQuality,
        virtualBackground, virtualBackgroundImage, blurRadius,
        setVideoDeviceId, setVideoQuality,
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
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-10">
            {/* Camera Settings Group */}
            <div className="space-y-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/5 flex items-center justify-center">
                        <MonitorPlay className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-text-main">Camera</h4>
                        <p className="text-xs text-text-muted">Choose your device and quality</p>
                    </div>
                </div>

                <div className="space-y-6 pl-1">
                    {/* Device Selection FIRST */}
                    <div className="space-y-3">
                        <label htmlFor="video-input-select" className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Camera Device</label>
                        <SettingsSelect
                            value={videoDeviceId}
                            onChange={(val) => setVideoDeviceId(val || null)}
                            placeholder="System Default"
                            options={videoDevices.filter(d => d.deviceId !== 'default').map(d => ({
                                value: d.deviceId,
                                label: d.label || `Camera ${d.deviceId.slice(0, 5)}...`
                            }))}
                        />
                    </div>

                    {/* Camera Quality SECOND */}
                    <div className="space-y-4">
                        <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Camera Quality</label>
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
                </div>
            </div>

            <div className="h-px bg-gray-100 my-4" />

            {/* Background Effects Group */}
            <div className="space-y-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/5 flex items-center justify-center">
                        <ImageIcon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-text-main">Effects</h4>
                        <p className="text-xs text-text-muted">Personalize your video stream</p>
                    </div>
                </div>

                <div className="space-y-6 pl-1">
                    <div className="space-y-3">
                        <div className="grid grid-cols-3 gap-2 bg-gray-50 p-1.5 rounded-[20px] border border-gray-100">
                            {[
                                { id: 'none', label: 'None', icon: CircleSlash },
                                { id: 'blur', label: 'Blur', icon: MonitorPlay },
                                { id: 'image', label: 'Image', icon: ImageIcon },
                            ].map((effect) => {
                                const isActive = virtualBackground === effect.id;
                                const Icon = effect.icon;
                                return (
                                    <button
                                        key={effect.id}
                                        onClick={() => setVirtualBackground(effect.id as 'none' | 'blur' | 'image')}
                                        className={`flex flex-col items-center justify-center gap-1.5 py-4 rounded-[16px] transition-all ${isActive
                                            ? 'bg-white text-primary shadow-sm'
                                            : 'text-text-muted hover:text-text-main'
                                            }`}
                                    >
                                        <Icon className={`w-5 h-5 transition-transform duration-300 ${isActive ? 'scale-110' : 'opacity-70'}`} />
                                        <span className="text-[10px] font-bold">{effect.label}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Blur Intensity Slider */}
                        {virtualBackground === 'blur' && (
                            <div className="pt-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-3 px-1">Blur Intensity</p>
                                <SettingsSlider
                                    value={blurRadius}
                                    onChange={setBlurRadius}
                                    min={5}
                                    max={30}
                                    step={1}
                                    label={`${Math.round(((blurRadius - 5) / 25) * 100)}%`}
                                />
                            </div>
                        )}

                        {/* Image Upload Area */}
                        {virtualBackground === 'image' && (
                            <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-200">
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
                                        className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 border-dashed border-gray-100 hover:border-primary hover:bg-primary/5 text-text-muted hover:text-primary transition-all aspect-video group"
                                    >
                                        <Upload className="w-5 h-5 opacity-50 group-hover:opacity-100 transition-opacity" />
                                        <span className="text-[10px] font-bold uppercase tracking-widest">Upload Image</span>
                                    </button>

                                    {virtualBackgroundImage && (
                                        <div className="relative group aspect-video rounded-2xl overflow-hidden border border-gray-100">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={virtualBackgroundImage}
                                                alt="Custom background"
                                                className="absolute inset-0 w-full h-full object-cover"
                                            />
                                            <div className="absolute inset-0 bg-black/5" />
                                            <button
                                                onClick={() => setVirtualBackgroundImage(null)}
                                                className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-primary text-white rounded-xl backdrop-blur-md transition-all opacity-0 group-hover:opacity-100"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
