"use client";

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTutorialStore } from '@/store/useTutorialStore';

export function TutorialSpotlight() {
    const { isActive, currentStep, steps, endTutorial } = useTutorialStore();
    const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        // Use a minor delay to avoid the 'setState synchronously within an effect' warning
        // which can happen during hydration or rapid state changes.
        const timer = setTimeout(() => setMounted(true), 0);
        return () => clearTimeout(timer);
    }, []);

    // Auto-end tutorial if screen becomes too small
    useEffect(() => {
        if (!isActive) return;

        const handleResize = () => {
            if (window.innerWidth < 768) {
                endTutorial();
            }
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [isActive, endTutorial]);

    useEffect(() => {
        if (!isActive || !mounted) return;

        const updateRect = () => {
            const selector = steps[currentStep]?.targetSelector;
            if (!selector) return;

            const element = document.querySelector(selector);
            if (element) {
                setTargetRect(element.getBoundingClientRect());
            } else {
                setTargetRect(null);
            }
        };

        updateRect();

        // Use a small timeout to ensure layout has settled
        const timeoutId = setTimeout(updateRect, 100);

        window.addEventListener('resize', updateRect);
        window.addEventListener('scroll', updateRect, true);

        return () => {
            clearTimeout(timeoutId);
            window.removeEventListener('resize', updateRect);
            window.removeEventListener('scroll', updateRect, true);
        };
    }, [currentStep, isActive, steps, mounted]);

    if (!isActive || !mounted) return null;

    // Don't show on small screens (mobile)
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
        return null;
    }

    const hole = targetRect ? {
        x: targetRect.left,
        y: targetRect.top,
        width: targetRect.width,
        height: targetRect.height,
        borderRadius: 24,
    } : null;

    return createPortal(
        <div className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden">
            {/* Dark Overlay with Highlight Hole */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
                <defs>
                    <mask id="spotlight-mask">
                        <rect x="0" y="0" width="100%" height="100%" fill="white" />
                        {hole && (
                            <rect
                                x={hole.x}
                                y={hole.y}
                                width={hole.width}
                                height={hole.height}
                                rx={hole.borderRadius}
                                ry={hole.borderRadius}
                                fill="black"
                            />
                        )}
                    </mask>
                </defs>
                <rect
                    x="0"
                    y="0"
                    width="100%"
                    height="100%"
                    fill="rgba(0, 0, 0, 0.65)"
                    mask="url(#spotlight-mask)"
                    className="backdrop-blur-[2px]"
                />
            </svg>

            {/* Visual Border for the Spotlight */}
            <AnimatePresence>
                {hole && (
                    <motion.div
                        key={`border-${currentStep}`}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{
                            opacity: 1,
                            scale: 1,
                            x: hole.x,
                            y: hole.y,
                            width: hole.width,
                            height: hole.height,
                        }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="absolute border-[3px] border-primary rounded-[24px] pointer-events-none shadow-[0_0_0_5000px_rgba(0,0,0,0.05),0_0_30px_rgba(255,90,95,0.4)]"
                        style={{ position: 'absolute' }}
                    />
                )}
            </AnimatePresence>

            {/* Click to dismiss helper (full screen invisible layer) */}
            <div
                className="absolute inset-0 pointer-events-auto"
                onClick={(e) => {
                    // Only dismiss if clicking the dark area, not the hole
                    if (hole) {
                        const { clientX, clientY } = e;
                        const inHole =
                            clientX >= hole.x &&
                            clientX <= hole.x + hole.width &&
                            clientY >= hole.y &&
                            clientY <= hole.y + hole.height;

                        if (!inHole) {
                            // Optionally end tutorial on outside click
                        }
                    }
                }}
            />
        </div>,
        document.body
    );
}
