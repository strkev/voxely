"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mascot } from '@/components/voxy';
import { Lock } from 'lucide-react';
import { useConnectionState } from '@livekit/components-react';
import { ConnectionState } from 'livekit-client';

/**
 * Full-screen overlay that shows the Voxy "locking" mascot animation
 * while the room connection + E2EE encryption is being established.
 *
 * Place this INSIDE `<LiveKitRoom>` so that it has access to room context.
 */
export function SecurityCheckOverlay() {
    const connectionState = useConnectionState();

    // E2EE is configured at the room-options level before connect (key + worker).
    // The connection itself establishes the secure context.
    // We treat "connected" as ready to avoid race conditions with track publications.
    const isConnected = connectionState === ConnectionState.Connected;
    const isReady = isConnected;

    const [show, setShow] = useState(true);

    // Once ready, keep overlay visible briefly so the user sees the "100%" bar,
    // then fade out gracefully.
    useEffect(() => {
        if (isReady) {
            const timer = setTimeout(() => {
                setShow(false);
            }, 1600);
            return () => clearTimeout(timer);
        }
    }, [isReady]);

    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.8, ease: "easeInOut" } }}
                    className="fixed inset-0 z-[10000] flex items-center justify-center bg-[#1e1f22]/80 backdrop-blur-md"
                >
                    <motion.div
                        initial={{ scale: 0.9, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 1.1, y: -20, opacity: 0 }}
                        transition={{ type: "spring", damping: 20, stiffness: 200 }}
                        className="flex flex-col items-center gap-6"
                    >
                        {/* Mascot with pulsing glow */}
                        <div className="relative">
                            <Mascot state="locking" trigger="always" className="scale-125" />
                            <motion.div
                                animate={{
                                    opacity: [0.5, 1, 0.5],
                                    scale: [1, 1.05, 1]
                                }}
                                transition={{ duration: 2, repeat: Infinity }}
                                className="absolute -inset-4 bg-primary/10 blur-2xl rounded-full -z-10"
                            />
                        </div>

                        {/* Status text */}
                        <div className="flex flex-col items-center gap-2 text-center">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.3 }}
                                className="flex items-center gap-2 text-primary font-bold tracking-widest uppercase text-xs"
                            >
                                <Lock className="w-3 h-3" />
                                End-to-End Encryption
                            </motion.div>
                            <motion.h2
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.4 }}
                                className="text-2xl font-bold text-white"
                            >
                                {isReady ? 'Connection secured!' : 'Securing your connection...'}
                            </motion.h2>
                            <motion.p
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.5 }}
                                className="text-text-muted text-sm max-w-[280px]"
                            >
                                Voxy is establishing a private tunnel for your conversation.
                            </motion.p>
                        </div>

                        {/* Progress bar */}
                        <div className="w-64 h-1.5 bg-white/5 rounded-full overflow-hidden mt-2">
                            <motion.div
                                initial={{ width: "0%" }}
                                animate={{ width: isReady ? "100%" : "70%" }}
                                transition={{
                                    duration: isReady ? 0.5 : 4,
                                    ease: isReady ? "easeOut" : "linear"
                                }}
                                className="h-full bg-primary shadow-[0_0_10px_rgba(255,90,95,0.5)] rounded-full"
                            />
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
