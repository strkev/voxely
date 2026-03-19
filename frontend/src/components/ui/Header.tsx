"use client";

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { useLeaveGuardStore } from '@/store/useLeaveGuardStore';
import { ChevronDown, LogOut, LayoutDashboard, Settings, Users } from 'lucide-react';
import { FriendRequestsModal } from '@/components/FriendRequestsModal';
import { SettingsModal } from '@/components/SettingsModal';
import { useFriendsStore } from '@/store/useFriendsStore';
import { getContrastColor } from '@/lib/colors';
import Image from 'next/image';

export function Header() {
    const user = useAuthStore(s => s.user);
    const logout = useAuthStore(s => s.logout);
    const [mounted, setMounted] = useState(false);
    const [open, setOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const router = useRouter();
    const pathname = usePathname();
    const isInRoom = pathname?.startsWith('/room/');
    const [showFriendsModal, setShowFriendsModal] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const { incomingRequests } = useFriendsStore();
    const leaveGuardActive = useLeaveGuardStore(s => s.active);
    const requestLeave = useLeaveGuardStore(s => s.requestLeave);

    useEffect(() => {
        const t = setTimeout(() => setMounted(true), 0);
        return () => clearTimeout(t);
    }, []);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);


    /** Navigate or show leave confirmation if in a room */
    const navigateOrGuard = (target: string) => {
        if (leaveGuardActive) {
            requestLeave(target);
        } else {
            router.push(target);
        }
    };

    // Get initials for avatar
    const initials = user?.name
        .split(' ')
        .map(w => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2) ?? '?';

    return (
        <>
            <header className="w-full h-16 border-b border-gray-100 bg-[var(--color-surface)] flex items-center justify-between px-3 sm:px-4 z-[60] sticky top-0 shadow-sm">
                {isInRoom ? (
                    <button
                        onClick={() => navigateOrGuard(user ? '/dashboard' : '/')}
                        className="text-xl font-semibold text-text-main flex items-center gap-2"
                    >
                        <Image src="/logo.png" alt="Voxely Logo" width={40} height={40} priority className="w-10 h-10 object-contain logo-dark-mode" />
                        Voxely
                    </button>
                ) : (
                    <Link href={user ? '/dashboard' : '/'} className="text-xl font-semibold text-text-main flex items-center gap-2">
                        <Image src="/logo.png" alt="Voxely Logo" width={40} height={40} priority className="w-10 h-10 object-contain logo-dark-mode" />
                        Voxely
                    </Link>
                )}

                <div className="flex items-center gap-3">
                    {!mounted ? null : user ? (
                        <div className="relative" ref={dropdownRef}>
                            {/* Avatar trigger button */}
                            <button
                                onClick={() => setOpen(prev => !prev)}
                                className="flex items-center gap-2.5 px-3 py-1.5 rounded-full border border-gray-200 bg-surface hover:bg-gray-50 transition-colors shadow-sm group"
                                aria-haspopup="true"
                                aria-expanded={open}
                                data-tutorial="user-dropdown"
                            >
                                <div
                                    className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
                                    style={{
                                        backgroundColor: user?.avatarColor || '#FF5A5F',
                                        color: getContrastColor(user?.avatarColor || '#FF5A5F')
                                    }}
                                >
                                    {initials}
                                </div>
                                <span className="text-sm font-medium text-text-main hidden sm:block max-w-[120px] truncate">
                                    {user.name}
                                </span>
                                <ChevronDown
                                    className={`w-4 h-4 text-text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                                />
                            </button>

                            {/* Dropdown menu */}
                            {open && (
                                <div className="absolute right-0 top-full mt-2 w-56 bg-surface border border-gray-100 rounded-2xl shadow-lg overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                                    {/* User info header */}
                                    <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                                        <div className="flex items-center gap-2.5">
                                            <div
                                                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
                                                style={{
                                                    backgroundColor: user?.avatarColor || '#FF5A5F',
                                                    color: getContrastColor(user?.avatarColor || '#FF5A5F')
                                                }}
                                            >
                                                {initials}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-text-main truncate">{user.name}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Menu items */}
                                    <div className="py-1.5">
                                        <button
                                            onClick={() => { setOpen(false); navigateOrGuard('/dashboard'); }}
                                            className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-text-main hover:bg-gray-50 transition-colors"
                                        >
                                            <LayoutDashboard className="w-4 h-4 text-text-muted" />
                                            Dashboard
                                        </button>

                                        <button
                                            onClick={() => { setOpen(false); setShowSettings(true); }}
                                            className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-text-main hover:bg-gray-50 transition-colors"
                                        >
                                            <Settings className="w-4 h-4 text-text-muted" />
                                            Settings
                                        </button>

                                        <button
                                            onClick={() => { setOpen(false); setShowFriendsModal(true); }}
                                            className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-text-main hover:bg-gray-50 transition-colors"
                                        >
                                            <Users className="w-4 h-4 text-text-muted" />
                                            Add Friends
                                            {incomingRequests.length > 0 && (
                                                <span className="ml-auto min-w-[18px] h-[18px] rounded-full bg-primary text-white text-[0.6rem] font-bold flex items-center justify-center px-1">
                                                    {incomingRequests.length}
                                                </span>
                                            )}
                                        </button>
                                    </div>

                                    {/* Sign out section */}
                                    <div className="border-t border-gray-100 mt-1.5">
                                        <button
                                            onClick={() => { setOpen(false); logout(); router.push('/'); }}
                                            className="flex items-center gap-3 w-full px-4 py-3 text-sm text-primary hover:bg-red-50 transition-colors"
                                        >
                                            <LogOut className="w-4 h-4" />
                                            Sign out
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5 sm:gap-2">
                            <Link
                                href="/login"
                                className="px-3 sm:px-4 py-1.5 rounded-full text-sm font-medium text-text-main hover:bg-gray-100 transition-colors"
                            >
                                Log in
                            </Link>
                            <Link
                                href="/register"
                                className="px-3 sm:px-4 py-1.5 rounded-full text-sm font-medium bg-primary text-white hover:bg-[#E0484D] transition-colors shadow-sm"
                            >
                                Sign up
                            </Link>
                        </div>
                    )}
                </div>
            </header>


            {/* Friend Requests Modal */}
            {showFriendsModal && (
                <FriendRequestsModal onClose={() => setShowFriendsModal(false)} />
            )}

            {/* Unified Settings Modal */}
            {showSettings && (
                <SettingsModal
                    onClose={() => setShowSettings(false)}
                />
            )}
        </>
    );
}