"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuthStore } from '@/store/useAuthStore';
import { useFriendsStore, Friend } from '@/store/useFriendsStore';
import { FriendsSidebar } from '@/components/FriendsSidebar';
import { FriendRequestsModal } from '@/components/FriendRequestsModal';
import { RoomInviteBanner } from '@/components/RoomInviteBanner';
import { useFriendsSocket } from '@/hooks/useFriendsSocket';
import { getContrastColor } from '@/lib/colors';
import { Users, ShieldCheck, Clock, Video, DoorOpen } from 'lucide-react';

export default function DashboardPage() {
    const [joinRoomId, setJoinRoomId] = useState('');
    const [mounted, setMounted] = useState(false);
    const [showFriendsModal, setShowFriendsModal] = useState(false);
    const [mobileFriendsOpen, setMobileFriendsOpen] = useState(false);

    const { user, token, isLoading } = useAuthStore();
    const router = useRouter();
    const { friends, onlineUserIds, openRooms } = useFriendsStore();

    // Connect friends socket for online presence & invitations
    useFriendsSocket(token);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMounted(true);
    }, []);

    useEffect(() => {
        if (mounted && !isLoading && !user) {
            router.push('/login?redirect=' + encodeURIComponent(window.location.pathname));
        }
    }, [user, router, mounted, isLoading]);

    // Don't render until mounted and auth check is done
    if (!mounted || isLoading) return (
        <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-3 border-gray-200 border-t-primary rounded-full animate-spin" />
        </div>
    );
    if (!user) return null;

    const handleCreateRoom = (e: React.FormEvent) => {
        e.preventDefault();

        // Generate a random room slug without requiring user input
        const randomNumbers = Math.floor(10000 + Math.random() * 90000); // 5 digit number
        const slug = `room-${randomNumbers}`;
        router.push(`/room/${slug}`);
    };

    const handleJoinRoom = (e: React.FormEvent) => {
        e.preventDefault();
        if (!joinRoomId.trim()) return;
        router.push(`/room/${joinRoomId.trim()}`);
    };

    const onlineFriends = friends.filter((friend: Friend) => onlineUserIds.has(friend.id));
    const getInitials = (name: string) => name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);

    return (
        <div className="flex flex-1 h-[calc(100vh-64px)]">
            {/* Friends Sidebar – hidden on mobile by default, toggled via button */}
            <div className={`hidden sm:block`}>
                <FriendsSidebar onOpenRequests={() => setShowFriendsModal(true)} />
            </div>

            {/* Mobile Friends Sidebar Overlay */}
            {mobileFriendsOpen && (
                <div className="fixed inset-0 z-40 sm:hidden" onClick={() => setMobileFriendsOpen(false)}>
                    <div className="absolute inset-0 bg-black/20" />
                    <div className="absolute top-16 left-0 bottom-0 [&_.friends-sidebar]:!static [&_.friends-sidebar]:!h-full" onClick={e => e.stopPropagation()}>
                        <FriendsSidebar
                            onOpenRequests={() => setShowFriendsModal(true)}
                            onClose={() => setMobileFriendsOpen(false)}
                        />
                    </div>
                </div>
            )}

            {/* Mobile Friends Toggle */}
            <button
                onClick={() => setMobileFriendsOpen(o => !o)}
                className="fixed bottom-4 right-4 z-30 sm:hidden flex items-center gap-1.5 bg-white/90 backdrop-blur-md border border-gray-200 rounded-full px-3.5 py-2.5 text-xs font-medium text-text-main shadow-lg hover:bg-white transition-all"
                aria-label="Toggle friends sidebar"
            >
                <Users className="w-4 h-4" />
                Friends
            </button>

            <div className="flex-1 w-full max-w-5xl mx-auto p-4 sm:p-6 md:p-12 lg:p-16 overflow-y-auto">
                <div className="mb-8 sm:mb-12 animate-slide-up">
                    <h1 className="text-2xl sm:text-3xl font-semibold text-text-main mb-2">Welcome, {user.name}</h1>
                    <p className="text-text-muted">Create a new space or join an existing one to start chatting.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                    {/* Create Room Card */}
                    <div className="bg-surface p-5 sm:p-8 rounded-video shadow-flat border border-gray-100 flex flex-col h-full animate-slide-up animation-delay-100">
                        <div className="mb-6">
                            <h2 className="text-xl font-medium text-text-main mb-2">Create a Space</h2>
                            <p className="text-sm text-text-muted">Start a secure real-time channel for your friends or team.</p>
                        </div>

                        <form onSubmit={handleCreateRoom} className="mt-auto flex flex-col justify-end">
                            {/* Feature highlights replacing the old input space */}
                            <div className="hidden sm:flex flex-col gap-2.5 mb-5 mt-2">
                                <div className="flex items-center gap-2 text-sm text-text-muted">
                                    <Video className="w-4 h-4 text-primary opacity-80" />
                                    <span>HD Video & Audio</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-text-muted">
                                    <ShieldCheck className="w-4 h-4 text-primary opacity-80" />
                                    <span>End-to-end Encrypted</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-text-muted">
                                    <Clock className="w-4 h-4 text-primary opacity-80" />
                                    <span>No Time Limits</span>
                                </div>
                            </div>
                            <Button type="submit" variant="primary" className="w-full h-14 sm:h-12 mt-auto transition-transform hover:scale-[1.02] active:scale-[0.98]">
                                Create and Join
                            </Button>
                        </form>
                    </div>

                    {/* Join Room Card */}
                    <div className="bg-surface p-5 sm:p-8 rounded-video shadow-flat border border-gray-100 flex flex-col h-full animate-slide-up animation-delay-200">
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
                            <Button type="submit" variant="outline" className="w-full h-14 sm:h-12 transition-transform hover:scale-[1.02] active:scale-[0.98]">
                                Join Space
                            </Button>
                        </form>
                    </div>

                </div>

                {/* Active Friends' Rooms Widget */}
                <div className="mt-8 sm:mt-12 animate-slide-up animation-delay-300">
                    <h2 className="text-xl font-medium text-text-main mb-4 flex items-center gap-2">
                        <DoorOpen className="w-5 h-5 text-primary" />
                        Active Friends&apos; Rooms
                    </h2>

                    {openRooms.length === 0 ? (
                        <div className="bg-surface border border-gray-100 rounded-2xl p-8 sm:p-10 text-center flex flex-col items-center justify-center min-h-[160px] shadow-flat">
                            <DoorOpen className="w-8 h-8 text-text-muted opacity-30 mb-3" />
                            <p className="text-text-muted text-sm max-w-sm">
                                None of your friends have their rooms open. Wait for someone to open their space or invite them directly!
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {openRooms.map(room => {
                                const participantFriends = room.participants
                                    .map(fid => friends.find(f => f.id === fid))
                                    .filter(Boolean) as Friend[];

                                return (
                                    <div key={room.roomId} className="bg-surface border border-gray-100 p-5 rounded-2xl flex flex-col gap-4 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 shadow-flat">
                                        <div className="flex items-start justify-between">
                                            <div className="min-w-0">
                                                <h3 className="font-semibold text-text-main truncate text-lg">{room.roomName}</h3>
                                                <p className="text-sm text-text-muted truncate mt-0.5">
                                                    {room.totalParticipantCount} person{room.totalParticipantCount !== 1 ? 's' : ''} here
                                                </p>
                                            </div>
                                            <Button 
                                                variant="primary" 
                                                size="sm" 
                                                className="shrink-0"
                                                onClick={() => router.push(`/room/${room.roomId}`)}
                                            >
                                                Join
                                            </Button>
                                        </div>
                                        <div className="flex -space-x-2 overflow-hidden items-center mt-auto">
                                            {participantFriends.slice(0, 5).map(f => (
                                                <div 
                                                    key={f.id} 
                                                    className="shrink-0 relative flex h-8 w-8 rounded-full items-center justify-center text-xs font-bold"
                                                    style={{ backgroundColor: f.avatarColor || '#FF5A5F', color: getContrastColor(f.avatarColor || '#FF5A5F') }}
                                                    title={f.name}
                                                >
                                                    {getInitials(f.name)}
                                                </div>
                                            ))}
                                            {participantFriends.length > 5 && (
                                                <div className="shrink-0 relative flex h-8 w-8 rounded-full bg-gray-100 items-center justify-center text-xs font-bold text-gray-600 border border-gray-200">
                                                    +{participantFriends.length - 5}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Room Invite Banner */}
            <RoomInviteBanner />

            {/* Friend Requests Modal */}
            {showFriendsModal && (
                <FriendRequestsModal onClose={() => setShowFriendsModal(false)} />
            )}
        </div>
    );
}
