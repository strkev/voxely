"use client";

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { useLeaveGuardStore } from '@/store/useLeaveGuardStore';
import { ChevronDown, LogOut, Trash2, LayoutDashboard, Settings, Users } from 'lucide-react';
import { FriendRequestsModal } from '@/components/FriendRequestsModal';
import { UserSettingsModal } from '@/components/UserSettingsModal';
import { useFriendsStore } from '@/store/useFriendsStore';

export function Header() {
    const { user, logout, deleteAccount } = useAuthStore();
    const [mounted, setMounted] = useState(false);
    const [open, setOpen] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const router = useRouter();
    const pathname = usePathname();
    const isInRoom = pathname?.startsWith('/room/');
    const [showFriendsModal, setShowFriendsModal] = useState(false);
    const [showUserSettings, setShowUserSettings] = useState(false);
    const { incomingRequests } = useFriendsStore();
    const { active: leaveGuardActive, requestLeave } = useLeaveGuardStore();

    useEffect(() => {
        setMounted(true);
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

    const handleDeleteAccount = async () => {
        setDeleting(true);
        await deleteAccount();
        setDeleting(false);
        setShowDeleteModal(false);
        router.push('/');
    };

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
            <header className="w-full h-16 border-b border-gray-100 bg-[var(--color-surface)] flex items-center justify-between px-4 sm:px-6 md:px-12 z-40 sticky top-0 shadow-sm">
                {isInRoom ? (
                    <button
                        onClick={() => navigateOrGuard('/')}
                        className="text-xl font-semibold text-text-main flex items-center gap-2"
                    >
                        <img src="/logo.png" alt="Voxely Logo" className="w-10 h-10 object-contain" />
                        Voxely
                    </button>
                ) : (
                    <Link href="/" className="text-xl font-semibold text-text-main flex items-center gap-2">
                        <img src="/logo.png" alt="Voxely Logo" className="w-10 h-10 object-contain" />
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
                            >
                                <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold shrink-0">
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
                                            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold shrink-0">
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

                                        {isInRoom ? (
                                            <button
                                                onClick={() => { setOpen(false); setShowUserSettings(true); }}
                                                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-text-main hover:bg-gray-50 transition-colors"
                                            >
                                                <Settings className="w-4 h-4 text-text-muted" />
                                                Settings
                                            </button>
                                        ) : (
                                            <Link
                                                href="/settings"
                                                onClick={() => setOpen(false)}
                                                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-text-main hover:bg-gray-50 transition-colors"
                                            >
                                                <Settings className="w-4 h-4 text-text-muted" />
                                                Settings
                                            </Link>
                                        )}

                                        <button
                                            onClick={() => { setOpen(false); setShowFriendsModal(true); }}
                                            className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-text-main hover:bg-gray-50 transition-colors"
                                        >
                                            <Users className="w-4 h-4 text-text-muted" />
                                            Friends
                                            {incomingRequests.length > 0 && (
                                                <span className="ml-auto min-w-[18px] h-[18px] rounded-full bg-primary text-white text-[0.6rem] font-bold flex items-center justify-center px-1">
                                                    {incomingRequests.length}
                                                </span>
                                            )}
                                        </button>

                                        <button
                                            onClick={() => { setOpen(false); logout(); router.push('/'); }}
                                            className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-text-main hover:bg-gray-50 transition-colors"
                                        >
                                            <LogOut className="w-4 h-4 text-text-muted" />
                                            Sign out
                                        </button>
                                    </div>

                                    {/* Destructive zone */}
                                    <div className="border-t border-gray-100 py-1.5">
                                        <button
                                            onClick={() => { setOpen(false); setShowDeleteModal(true); }}
                                            className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-primary hover:bg-red-50 transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                            Delete Account
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

            {/* Delete Account Confirmation Modal */}
            {showDeleteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-surface rounded-2xl shadow-xl border border-gray-100 max-w-sm w-full mx-4 p-6">
                        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-50 mx-auto mb-4">
                            <Trash2 className="w-6 h-6 text-primary" />
                        </div>
                        <h2 className="text-xl font-semibold text-text-main text-center mb-2">Delete Account</h2>
                        <p className="text-text-muted text-sm text-center mb-6 leading-relaxed">
                            This will permanently delete your account and all associated data. This action <strong>cannot be undone</strong>.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowDeleteModal(false)}
                                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-text-main hover:bg-gray-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteAccount}
                                disabled={deleting}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-[#E0484D] transition-colors disabled:opacity-60"
                            >
                                {deleting ? 'Deleting...' : 'Yes, Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Friend Requests Modal */}
            {showFriendsModal && (
                <FriendRequestsModal onClose={() => setShowFriendsModal(false)} />
            )}

            {/* User Settings Modal (in-room) */}
            {showUserSettings && (
                <UserSettingsModal onClose={() => setShowUserSettings(false)} />
            )}
        </>
    );
}
