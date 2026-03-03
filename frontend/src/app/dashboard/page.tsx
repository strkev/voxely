"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuthStore } from '@/store/useAuthStore';

export default function DashboardPage() {
    const [roomName, setRoomName] = useState('');
    const [joinRoomId, setJoinRoomId] = useState('');
    const [mounted, setMounted] = useState(false);

    const { user } = useAuthStore();
    const router = useRouter();

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMounted(true);
    }, []);

    useEffect(() => {
        if (mounted && !user) {
            router.push('/login?redirect=' + encodeURIComponent(window.location.pathname));
        }
    }, [user, router, mounted]);

    // Don't render until mounted and user is available
    if (!mounted || !user) return null;

    const handleCreateRoom = (e: React.FormEvent) => {
        e.preventDefault();
        if (!roomName.trim()) return;

        // In a real app we would create the room in the DB first and get an ID.
        // For this MVP, let's use a URL-friendly slug based on the room name (plus a random suffix)
        const slug = roomName.trim().toLowerCase().replace(/\s+/g, '-') + '-' + Math.floor(Math.random() * 10000);
        router.push(`/room/${slug}`);
    };

    const handleJoinRoom = (e: React.FormEvent) => {
        e.preventDefault();
        if (!joinRoomId.trim()) return;
        router.push(`/room/${joinRoomId.trim()}`);
    };

    return (
        <div className="flex-1 w-full max-w-5xl mx-auto p-4 sm:p-6 md:p-12 lg:p-16">
            <div className="mb-8 sm:mb-12">
                <h1 className="text-2xl sm:text-3xl font-semibold text-text-main mb-2">Welcome, {user.name}</h1>
                <p className="text-text-muted">Create a new space or join an existing one to start chatting.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                {/* Create Room Card */}
                <div className="bg-surface p-5 sm:p-8 rounded-video shadow-flat border border-gray-100 flex flex-col h-full">
                    <div className="mb-6">
                        <h2 className="text-xl font-medium text-text-main mb-2">Create a Space</h2>
                        <p className="text-sm text-text-muted">Start a secure real-time channel for your friends or team.</p>
                    </div>

                    <form onSubmit={handleCreateRoom} className="mt-auto space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-text-main mb-1.5 ml-1">Room Name</label>
                            <Input
                                type="text"
                                placeholder="E.g., Design Sync"
                                value={roomName}
                                onChange={(e) => setRoomName(e.target.value)}
                                required
                            />
                        </div>
                        <Button type="submit" variant="primary" className="w-full h-14 sm:h-12">
                            Create and Join
                        </Button>
                    </form>
                </div>

                {/* Join Room Card */}
                <div className="bg-surface p-5 sm:p-8 rounded-video shadow-flat border border-gray-100 flex flex-col h-full">
                    <div className="mb-6">
                        <h2 className="text-xl font-medium text-text-main mb-2">Join a Space</h2>
                        <p className="text-sm text-text-muted">Have a room code? Enter it below to join the conversation.</p>
                    </div>

                    <form onSubmit={handleJoinRoom} className="mt-auto space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-text-main mb-1.5 ml-1">Room Code or Slug</label>
                            <Input
                                type="text"
                                placeholder="E.g., design-sync-1234"
                                value={joinRoomId}
                                onChange={(e) => setJoinRoomId(e.target.value)}
                                required
                            />
                            <p className="text-xs text-text-muted mt-1.5 ml-1">Ask the room creator to share the link or code with you.</p>
                        </div>
                        <Button type="submit" variant="secondary" className="w-full h-14 sm:h-12">
                            Join Space
                        </Button>
                    </form>
                </div>

            </div>
        </div>
    );
}
