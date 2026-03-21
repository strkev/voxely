"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Volume2, VolumeX } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface VolumeModalProps {
    isOpen: boolean;
    onClose: () => void;
    volume: number;
    onVolumeChange: (volume: number) => void;
    participantName: string;
}

export function VolumeModal({
    isOpen,
    onClose,
    volume,
    onVolumeChange,
    participantName,
}: VolumeModalProps) {
    const sliderRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [localDragVolume, setLocalDragVolume] = useState<number | null>(null);
    const currentVolume = localDragVolume !== null ? localDragVolume : volume;

    const lastUpdateRef = useRef<number>(0);

    const handleUpdateVolume = useCallback((clientY: number) => {
        if (!sliderRef.current) return;
        const rect = sliderRef.current.getBoundingClientRect();
        const height = rect.height;
        const y = clientY - rect.top;
        // Invert Y because 0% is bottom, 100% is top
        let percentage = 100 - (y / height) * 100;
        percentage = Math.max(0, Math.min(100, Math.round(percentage)));
        setLocalDragVolume(percentage);
        
        // Throttle store updates to ~30fps for performance
        const now = Date.now();
        if (now - lastUpdateRef.current > 32) {
            onVolumeChange(percentage);
            lastUpdateRef.current = now;
        }
    }, [onVolumeChange]);

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        handleUpdateVolume(e.clientY);
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        setIsDragging(true);
        handleUpdateVolume(e.touches[0].clientY);
    };

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => handleUpdateVolume(e.clientY);
        const handleTouchMove = (e: TouchEvent) => handleUpdateVolume(e.touches[0].clientY);
        const handleEnd = () => {
            setIsDragging(false);
            setLocalDragVolume(null);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleEnd);
        window.addEventListener('touchmove', handleTouchMove);
        window.addEventListener('touchend', handleEnd);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleEnd);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', handleEnd);
        };
    }, [isDragging, handleUpdateVolume]);

    if (typeof document === 'undefined') return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[1001] flex items-center justify-center p-6">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        className="relative z-10 w-full max-w-[280px] flex flex-col items-center gap-8 select-none"
                    >
                        {/* Header Info */}
                        <div className="text-center space-y-2 pointer-events-none">
                            <h2 className="text-4xl font-bold text-white tracking-tight">
                                {currentVolume} <span className="text-white/40 font-light">%</span>
                            </h2>
                            <p className="text-white/60 text-sm font-medium uppercase tracking-wider">
                                {participantName}
                            </p>
                        </div>

                        <div
                            ref={sliderRef}
                            onMouseDown={handleMouseDown}
                            onTouchStart={handleTouchStart}
                            className={`relative w-32 h-64 bg-white/10 rounded-[40px] overflow-hidden touch-none shadow-2xl border border-white/5 active:scale-[0.98] transition-all duration-200 ${isDragging ? 'cursor-ns-resize' : 'cursor-pointer'}`}
                        >
                            {/* The Fill Background */}
                            <motion.div
                                className="absolute bottom-0 left-0 right-0 bg-[#FF5A5F]"
                                style={{ height: `${currentVolume}%` }}
                            />
                            
                            {/* Glass Effect Overlay */}
                            <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />

                            {/* Icons inside slider */}
                            <div className="absolute inset-0 flex flex-col items-center justify-between p-8 pointer-events-none">
                                <Volume2 className={`w-8 h-8 transition-colors duration-300 ${currentVolume > 50 ? 'text-white' : 'text-white/40'}`} />
                                <VolumeX className={`w-8 h-8 transition-colors duration-300 ${currentVolume === 0 ? 'text-white' : 'text-white/40'}`} />
                            </div>

                        </div>

                        {/* Close Button */}
                        <button
                            onClick={onClose}
                            className="p-4 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all duration-200 hover:scale-110 active:scale-95 shadow-lg border border-white/10"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}
