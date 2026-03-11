import React, { useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Image as ImageIcon, CircleSlash, MonitorPlay, Upload, Trash2 } from 'lucide-react';
import { useSettingsStore } from '@/store/useSettingsStore';

export function VirtualBackgroundModal({ onClose }: { onClose: () => void }) {
    const { virtualBackground, virtualBackgroundImage, blurRadius, setVirtualBackground, setVirtualBackgroundImage, setBlurRadius } = useSettingsStore();
    const backdropRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Lock body scroll
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

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

    if (typeof document === 'undefined') return null;

    return createPortal(
        <div
            ref={backdropRef}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
        >
            <div className="bg-surface rounded-2xl shadow-xl border border-gray-100 w-full max-w-lg mx-4 overflow-hidden flex flex-col max-h-[85vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-surface z-10 shrink-0">
                    <div className="flex items-center gap-2">
                        <ImageIcon className="w-5 h-5 text-text-main" />
                        <h2 className="text-base font-semibold text-text-main">Virtual Background</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-gray-100 transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-5 overflow-y-auto space-y-6">
                    {/* Standard Options */}
                    <div>
                        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Effects</h3>
                        <div className="grid grid-cols-3 gap-3">
                            <button
                                onClick={() => setVirtualBackground('none')}
                                className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all ${
                                    virtualBackground === 'none' 
                                        ? 'border-primary bg-primary/5 text-primary' 
                                        : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50 text-text-main'
                                }`}
                            >
                                <CircleSlash className="w-6 h-6" />
                                <span className="text-sm font-medium">None</span>
                            </button>

                            <button
                                onClick={() => setVirtualBackground('blur')}
                                className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all ${
                                    virtualBackground === 'blur' 
                                        ? 'border-primary bg-primary/5 text-primary' 
                                        : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50 text-text-main'
                                }`}
                            >
                                <MonitorPlay className="w-6 h-6" />
                                <span className="text-sm font-medium">Blur</span>
                            </button>

                            <button
                                onClick={() => setVirtualBackground('image')}
                                className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all ${
                                    virtualBackground === 'image' 
                                        ? 'border-primary bg-primary/5 text-primary' 
                                        : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50 text-text-main'
                                }`}
                            >
                                <ImageIcon className="w-6 h-6" />
                                <span className="text-sm font-medium">Image</span>
                            </button>
                        </div>
                    </div>

                    {/* Blur Settings */}
                    {virtualBackground === 'blur' && (
                        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-text-main">Blur Intensity</span>
                                <span className="text-xs font-mono text-text-muted">{Math.round(((blurRadius - 5) / 25) * 100)}%</span>
                            </div>
                            <input
                                type="range"
                                min="5"
                                max="30"
                                step="1"
                                value={blurRadius}
                                onChange={(e) => setBlurRadius(Number(e.target.value))}
                                className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary transition-all"
                                style={{
                                    background: `linear-gradient(to right, #FF5A5F 0%, #FF5A5F ${((blurRadius - 5) / 25) * 100}%, #e5e7eb ${((blurRadius - 5) / 25) * 100}%, #e5e7eb 100%)`
                                }}
                            />
                        </div>
                    )}

                    {/* Image Options */}
                    {virtualBackground === 'image' && (
                        <div>
                            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Custom Background</h3>
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
                                    className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-gray-300 hover:border-primary hover:bg-primary/5 text-text-muted hover:text-primary transition-all aspect-video"
                                >
                                    <Upload className="w-6 h-6" />
                                    <span className="text-sm font-medium">Upload Image</span>
                                </button>

                                {virtualBackgroundImage && (
                                    <div className={`relative group aspect-video rounded-xl overflow-hidden border-2 transition-all ${
                                        virtualBackground === 'image'
                                            ? 'border-primary ring-2 ring-primary/20' 
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
                                        
                                        {virtualBackground === 'image' && (
                                            <div className="absolute top-2 left-2 bg-primary text-white rounded-full p-1 shadow-md pointer-events-none">
                                                <div className="w-2 h-2 rounded-full bg-white" />
                                            </div>
                                        )}

                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setVirtualBackgroundImage(null);
                                            }}
                                            className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-red-500 text-white rounded-lg backdrop-blur-sm transition-colors opacity-0 group-hover:opacity-100"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                )}
                            </div>
                            <p className="text-[10px] text-text-muted mt-2">Images stay on your device for privacy. Max resolution 720p.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
