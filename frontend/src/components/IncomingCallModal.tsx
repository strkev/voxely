"use client";

import React, { useEffect } from 'react';
import { useFriendsStore } from '@/store/useFriendsStore';
import { useFriends } from '@/components/FriendsProvider';
import { useSettingsStore } from '@/store/useSettingsStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff } from 'lucide-react';
import { playSound } from '@/lib/sounds';

export const IncomingCallModal: React.FC = () => {
    const { soundVolume, soundsEnabled } = useSettingsStore();
    const { incomingCall, outgoingCall, clearOutgoingCall } = useFriendsStore();
    const { respondToCall, terminateCall } = useFriends();

    // Play ringing sound
    useEffect(() => {
        if (!soundsEnabled || (!incomingCall && !outgoingCall)) return;

        // Try to resume context if suspended
        const ac = typeof window !== 'undefined' ? (window as unknown as { AudioContext: typeof AudioContext; webkitAudioContext: typeof AudioContext }).AudioContext || (window as unknown as { AudioContext: typeof AudioContext; webkitAudioContext: typeof AudioContext }).webkitAudioContext : null;
        if (ac) {
            import('@/lib/sounds').then(({ getSharedAudioContext }) => {
                getSharedAudioContext();
            });
        }

        // Play immediate
        playSound('call', soundVolume);

        // Repeat every 2.5 seconds
        const interval = setInterval(() => {
            playSound('call', soundVolume);
        }, 2000);

        return () => clearInterval(interval);
    }, [incomingCall, outgoingCall, soundsEnabled, soundVolume]);

    if (!incomingCall && !outgoingCall) return null;

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <AnimatePresence mode="wait">
                {incomingCall && (
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="bg-[#1e1f22] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-white/10"
                    >
                        <div className="p-8 flex flex-col items-center">
                            {/* Animated Avatar */}
                            <div className="relative mb-6">
                                <motion.div
                                    animate={{
                                        scale: [1, 1.2, 1],
                                        opacity: [0.3, 0.6, 0.3],
                                    }}
                                    transition={{
                                        duration: 2,
                                        repeat: Infinity,
                                        ease: "easeInOut"
                                    }}
                                    className="absolute inset-0 rounded-full"
                                    style={{ backgroundColor: incomingCall.caller.avatarColor }}
                                />
                                <div 
                                    className="relative w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold text-white shadow-xl border-4 border-[#1e1f22]"
                                    style={{ backgroundColor: incomingCall.caller.avatarColor }}
                                >
                                    {incomingCall.caller.name.charAt(0).toUpperCase()}
                                </div>
                            </div>

                            <h2 className="text-2xl font-bold text-white mb-1 text-center">
                                {incomingCall.participants.length + 1 > 1 
                                    ? `${incomingCall.participants.length + 1} in room` 
                                    : "Waiting for you"}
                            </h2>
                            <p className="text-gray-400 text-center mb-6">
                                {incomingCall.caller.name} is inviting you
                            </p>

                            <p className="text-gray-400 text-center mb-8">
                                {incomingCall.participants.length + 1 > 1 
                                    ? "Would you like to join the room?" 
                                    : "Would you like to join?"}
                            </p>

                            <div className="flex gap-4 w-full">
                                <button
                                    onClick={() => respondToCall(incomingCall.caller.id, false)}
                                    className="flex-1 flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white font-semibold py-4 rounded-xl transition-all active:scale-95 shadow-lg shadow-red-500/20"
                                >
                                    <PhoneOff size={24} />
                                    Decline
                                </button>
                                <button
                                    onClick={() => respondToCall(incomingCall.caller.id, true)}
                                    className="flex-1 flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-semibold py-4 rounded-xl transition-all active:scale-95 shadow-lg shadow-green-500/20"
                                >
                                    <Phone size={24} />
                                    Accept
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}

                {outgoingCall && !incomingCall && (
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="bg-[#1e1f22] w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden border border-white/10"
                    >
                        <div className="pt-14 pb-10 px-8 flex flex-col items-center">
                            <div className="relative mb-6">
                                <motion.div
                                    animate={{
                                        scale: [1, 1.2, 1],
                                        opacity: [0.1, 0.2, 0.1],
                                    }}
                                    transition={{
                                        duration: 2,
                                        repeat: Infinity,
                                        ease: "easeInOut"
                                    }}
                                    className="absolute -inset-4 bg-blue-500/20 rounded-full"
                                />
                                <div className="w-20 h-20 bg-blue-500 rounded-full flex items-center justify-center text-white shadow-xl ring-4 ring-[#1e1f22]">
                                    <Phone size={32} />
                                </div>
                            </div>

                            <h2 className="text-xl font-bold text-white mb-6 text-center">
                                Calling...
                            </h2>

                            <button
                                onClick={() => {
                                    terminateCall(outgoingCall.recipientId);
                                    clearOutgoingCall();
                                }}
                                className="w-full flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-4 rounded-xl transition-all active:scale-95 border border-white/5"
                            >
                                <PhoneOff size={20} />
                                Cancel
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
