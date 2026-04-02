import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRoomContext } from '@livekit/components-react';
import { X, ArrowUp, ArrowDown } from 'lucide-react';
import { useSettingsStore } from '@/store/useSettingsStore';

interface StatsState {
    sentBytes: number;
    receivedBytes: number;
    sentRate: string;
    receivedRate: string;
}

export function DevInfoOverlay() {
    const room = useRoomContext();
    const setShowDevInfo = useSettingsStore(s => s.setShowDevInfo);

    const [stats, setStats] = useState<StatsState>({
        sentBytes: 0,
        receivedBytes: 0,
        sentRate: '0 kbps',
        receivedRate: '0 kbps'
    });

    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        const t = setTimeout(() => setMounted(true), 0);
        return () => clearTimeout(t);
    }, []);

    const lastStatsRef = useRef<{ sent: number; received: number; time: number } | null>(null);

    useEffect(() => {
        const update = async () => {
            let totalSent = 0;
            let totalReceived = 0;

            const localTracks = Array.from(room.localParticipant.trackPublications.values());
            for (const pub of localTracks) {
                if (pub.track) {
                    try {
                        const report = await pub.track.getRTCStatsReport();
                        report?.forEach(stat => {
                            if (stat.type === 'outbound-rtp' && stat.bytesSent) {
                                totalSent += stat.bytesSent;
                            }
                        });
                    } catch { /* ignore */ }
                }
            }

            const remoteParticipants = Array.from(room.remoteParticipants.values());
            for (const p of remoteParticipants) {
                const tracks = Array.from(p.trackPublications.values());
                for (const pub of tracks) {
                    if (pub.track) {
                        try {
                            const report = await pub.track.getRTCStatsReport();
                            report?.forEach(stat => {
                                if (stat.type === 'inbound-rtp' && stat.bytesReceived) {
                                    totalReceived += stat.bytesReceived;
                                }
                            });
                        } catch { /* ignore */ }
                    }
                }
            }

            const now = Date.now();

            if (lastStatsRef.current) {
                const elapsedSeconds = (now - lastStatsRef.current.time) / 1000;
                if (elapsedSeconds > 0) {
                    const sentDiff = Math.max(0, totalSent - lastStatsRef.current.sent);
                    const receivedDiff = Math.max(0, totalReceived - lastStatsRef.current.received);

                    const sentBitrate = Math.round((sentDiff * 8) / (elapsedSeconds * 1000));
                    const receivedBitrate = Math.round((receivedDiff * 8) / (elapsedSeconds * 1000));

                    setStats({
                        sentBytes: totalSent,
                        receivedBytes: totalReceived,
                        sentRate: sentBitrate >= 1000 ? `${(sentBitrate / 1000).toFixed(1)} Mbps` : `${sentBitrate} kbps`,
                        receivedRate: receivedBitrate >= 1000 ? `${(receivedBitrate / 1000).toFixed(1)} Mbps` : `${receivedBitrate} kbps`
                    });
                }
            } else {
                setStats(prev => ({ ...prev, sentBytes: totalSent, receivedBytes: totalReceived }));
            }

            lastStatsRef.current = { sent: totalSent, received: totalReceived, time: now };
        };

        const interval = setInterval(update, 2000);
        update();
        return () => clearInterval(interval);
    }, [room]);

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    if (!mounted || typeof document === 'undefined') return null;

    return createPortal(
        <div
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[900] flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-900/90 backdrop-blur-xl border border-white/10 text-white shadow-2xl transition-all cursor-default"
            style={{ userSelect: 'none' }}
        >
            <div className="flex items-center gap-3 text-[11px] font-medium font-mono ml-1">
                <div className="flex items-center gap-1.5 group">
                    <ArrowUp className="w-3 h-3 text-green-400/80" />
                    <span className="text-white/80">{stats.sentRate}</span>
                    <span className="text-[9px] text-white/30 hidden sm:inline">({formatBytes(stats.sentBytes)})</span>
                </div>

                <div className="w-px h-3 bg-white/10" />

                <div className="flex items-center gap-1.5 group">
                    <ArrowDown className="w-3 h-3 text-blue-400/80" />
                    <span className="text-white/80">{stats.receivedRate}</span>
                    <span className="text-[9px] text-white/30 hidden sm:inline">({formatBytes(stats.receivedBytes)})</span>
                </div>
            </div>

            <button
                onClick={() => setShowDevInfo(false)}
                className="ml-1 p-1 hover:bg-white/10 rounded-full transition-colors text-white/40 hover:text-white"
                title="Close stats"
            >
                <X className="w-3.5 h-3.5" />
            </button>
        </div>,
        document.body
    );
}
