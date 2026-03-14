"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useAuthStore } from '@/store/useAuthStore';
import { playSound } from '@/lib/sounds';
import { PRESET_COLORS, getContrastColor } from '@/lib/colors';
import { useFriendsSocket } from '@/hooks/useFriendsSocket';
import { Volume2, VolumeX, Bell, ChevronLeft, Trash2, Pencil, Loader2, Check, Moon, Palette, Sun, Monitor } from 'lucide-react';

type SoundKey = 'join' | 'leave' | 'mute' | 'unmute' | 'cameraOn' | 'cameraOff' | 'screenShareOn' | 'screenShareOff';

const SOUND_LABELS: { key: SoundKey; label: string; description: string }[] = [
    { key: 'join', label: 'Join', description: 'Played when someone joins the room' },
    { key: 'leave', label: 'Leave', description: 'Played when someone leaves the room' },
    { key: 'mute', label: 'Mute', description: 'Played when muting the microphone' },
    { key: 'unmute', label: 'Unmute', description: 'Played when unmuting the microphone' },
    { key: 'cameraOn', label: 'Camera On', description: 'Played when turning on the camera' },
    { key: 'cameraOff', label: 'Camera Off', description: 'Played when turning off the camera' },
    { key: 'screenShareOn', label: 'Screen Share On', description: 'Played when starting screen share' },
    { key: 'screenShareOff', label: 'Screen Share Off', description: 'Played when stopping screen share' },
];


export default function SettingsPage() {
    const { user, token, setAuth, deleteAccount } = useAuthStore();
    const { soundsEnabled, soundVolume, setSoundsEnabled, setSoundVolume, theme, setTheme } = useSettingsStore();
    const [mounted, setMounted] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const router = useRouter();

    useFriendsSocket(token);

    // Edit profile state
    const [editColor, setEditColor] = useState('#FF5A5F');
    const [editName, setEditName] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [profileLoading, setProfileLoading] = useState(false);
    const [profileError, setProfileError] = useState('');
    const [profileSuccess, setProfileSuccess] = useState('');

    useEffect(() => { setMounted(true); }, []);
    useEffect(() => {
        if (user) {
            setEditName(user.name);
            setEditColor(user.avatarColor || '#FF5A5F');
        }
    }, [user]);

    if (!mounted || !user) return null;

    const initials = user.name
        .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

    const handleProfileUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        setProfileLoading(true);
        setProfileError('');
        setProfileSuccess('');

        const body: Record<string, string> = {};
        if (editName !== user.name) body.name = editName;
        if (newPassword) body.newPassword = newPassword;
        if (currentPassword) body.currentPassword = currentPassword;
        if (editColor !== (user.avatarColor || '#FF5A5F')) body.avatarColor = editColor;
        if (Object.keys(body).length === 0 || (Object.keys(body).length === 1 && body.currentPassword)) {
            setProfileError('No changes to save');
            setProfileLoading(false);
            return;
        }

        try {
            const res = await fetch(`${apiUrl}/api/auth/me`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                credentials: 'include',
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Update failed');

            setAuth(data.user, token!);
            setProfileSuccess('Profile updated successfully');
            setCurrentPassword('');
            setNewPassword('');
        } catch (err: unknown) {
            setProfileError(err instanceof Error ? err.message : 'Error');
        } finally {
            setProfileLoading(false);
        }
    };

    const handleDeleteAccount = async () => {
        setDeleting(true);
        await deleteAccount();
        setDeleting(false);
        setShowDeleteModal(false);
        router.push('/');
    };

    const needsCurrentPassword = newPassword.length > 0;
    return (
        <>
            <div className="flex-1 w-full max-w-2xl mx-auto px-4 py-10 sm:py-16">
                {/* Back button */}
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-main transition-colors mb-8"
                >
                    <ChevronLeft className="w-4 h-4" />
                    Back
                </button>

                {/* Profile card */}
                <div className="bg-surface border border-gray-100 rounded-2xl p-4 sm:p-6 shadow-flat mb-6 flex items-center gap-3 sm:gap-4 transition-colors">
                    <div
                        className="w-11 h-11 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-lg sm:text-xl font-bold shrink-0 shadow-sm transition-colors duration-300"
                        style={{
                            backgroundColor: editColor,
                            color: getContrastColor(editColor)
                        }}
                    >
                        {initials}
                    </div>
                    <div>
                        <p className="text-lg font-semibold text-text-main">{editName || user.name}</p>
                        <p className="text-xs text-text-muted mt-0.5">Personalize your appearance</p>
                    </div>
                </div>

                {/* Edit Profile */}
                <div className="bg-surface border border-gray-100 rounded-2xl shadow-flat overflow-hidden mb-6">
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
                        <Pencil className="w-4 h-4 text-text-muted" />
                        <h2 className="text-sm font-semibold text-text-main">Edit Profile</h2>
                    </div>

                    <form onSubmit={handleProfileUpdate} className="px-6 py-5 space-y-4">
                        {profileError && (
                            <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm text-center">
                                {profileError}
                            </div>
                        )}
                        {profileSuccess && (
                            <div className="p-3 bg-green-50 text-green-600 rounded-xl text-sm text-center flex items-center justify-center gap-1.5">
                                <Check className="w-4 h-4" />
                                {profileSuccess}
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-text-main mb-1.5 ml-1">Username</label>
                            <input
                                type="text"
                                value={editName}
                                onChange={(e) => { setEditName(e.target.value); setProfileSuccess(''); }}
                                className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-white text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                required
                                maxLength={50}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-text-main mb-1.5 ml-1">
                                New Password <span className="text-text-muted font-normal">(leave empty to keep current)</span>
                            </label>
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => { setNewPassword(e.target.value); setProfileSuccess(''); }}
                                placeholder="••••••••"
                                className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-white text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                minLength={8}
                            />
                        </div>

                        {needsCurrentPassword && (
                            <div>
                                <label className="block text-sm font-medium text-text-main mb-1.5 ml-1">
                                    Current Password <span className="text-primary">*</span>
                                </label>
                                <input
                                    type="password"
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    placeholder="Required to change password"
                                    className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-white text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                    required
                                />
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-medium text-text-main mb-2 ml-1">Profile Color</label>
                            <div className="flex flex-wrap items-center gap-3 sm:gap-4 px-1 py-1">
                                {PRESET_COLORS.map((color) => (
                                    <button
                                        key={color}
                                        type="button"
                                        onClick={() => {
                                            setEditColor(color);
                                            setProfileSuccess('');
                                        }}
                                        className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full cursor-pointer flex items-center justify-center group relative border-2 border-[var(--color-surface)] shadow-sm transition-all duration-200 ${editColor.toUpperCase() === color.toUpperCase() ? 'ring-2 ring-primary ring-offset-1 ring-offset-[var(--color-surface)]' : ''
                                            }`}
                                        style={{ backgroundColor: color }}
                                        title={color}
                                    >
                                        {/* Selection indicator */}
                                        {editColor.toUpperCase() === color.toUpperCase() && (
                                            <Check
                                                className="w-5 h-5 drop-shadow-sm"
                                                style={{ color: getContrastColor(color) }}
                                            />
                                        )}
                                    </button>
                                ))}

                                {/* Custom Color Picker Input */}
                                <div
                                    className={`relative w-11 h-11 sm:w-12 sm:h-12 rounded-full cursor-pointer flex items-center justify-center border-2 border-[var(--color-surface)] shadow-sm overflow-hidden transition-all duration-200 ${!PRESET_COLORS.map(c => c.toUpperCase()).includes(editColor.toUpperCase()) ? 'ring-2 ring-primary ring-offset-1 ring-offset-[var(--color-surface)]' : ''
                                        }`}
                                    style={{
                                        background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)',
                                    }}
                                    title="Custom Color"
                                >
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none transition-colors duration-200"
                                        style={{
                                            backgroundColor: !PRESET_COLORS.map(c => c.toUpperCase()).includes(editColor.toUpperCase()) ? editColor : 'transparent'
                                        }}
                                    >
                                        {!PRESET_COLORS.map(c => c.toUpperCase()).includes(editColor.toUpperCase()) ? (
                                            <Check
                                                className="w-5 h-5 drop-shadow-sm"
                                                style={{ color: getContrastColor(editColor) }}
                                            />
                                        ) : (
                                            <Palette className="w-5 h-5 text-gray-500" />
                                        )}
                                    </div>
                                    <input
                                        type="color"
                                        value={editColor}
                                        onChange={(e) => { setEditColor(e.target.value.toUpperCase()); setProfileSuccess(''); }}
                                        className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                                    />
                                </div>
                            </div>

                            <div className="mt-3 ml-1">
                                <span className="text-xs font-mono text-text-muted uppercase bg-gray-50 px-2.5 py-1 rounded-md border border-gray-100">
                                    {editColor}
                                </span>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={profileLoading}
                            className="w-full h-11 rounded-xl bg-primary text-white text-sm font-medium hover:bg-[#E0484D] transition-colors disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
                        >
                            {profileLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
                        </button>
                    </form>
                </div>

                {/* Sound Settings */}
                <div className="bg-surface border border-gray-100 rounded-2xl shadow-flat overflow-hidden mb-6">
                    {/* Section header */}
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Bell className="w-4 h-4 text-text-muted" />
                            <h2 className="text-sm font-semibold text-text-main">Sound Effects</h2>
                        </div>
                        {/* Master toggle */}
                        <button
                            onClick={() => setSoundsEnabled(!soundsEnabled)}
                            className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${soundsEnabled ? 'bg-primary' : 'bg-gray-200'
                                }`}
                            aria-label="Toggle sound effects"
                        >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${soundsEnabled ? 'translate-x-5' : 'translate-x-0'
                                }`} />
                        </button>
                    </div>

                    {/* Volume slider */}
                    <div className={`px-6 py-4 border-b border-gray-100 transition-opacity ${soundsEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                        <div className="flex items-center gap-3">
                            <VolumeX className="w-4 h-4 text-text-muted shrink-0" />
                            <input
                                type="range"
                                min={0}
                                max={1}
                                step={0.01}
                                value={soundVolume}
                                onChange={(e) => setSoundVolume(parseFloat(e.target.value))}
                                className="flex-1 h-1.5 rounded-full accent-primary cursor-pointer"
                                aria-label="Sound volume"
                            />
                            <Volume2 className="w-4 h-4 text-text-muted shrink-0" />
                            <span className="text-xs font-mono text-text-muted w-8 text-right">
                                {Math.round(soundVolume * 100)}%
                            </span>
                        </div>
                    </div>

                    {/* Individual sound previews */}
                    <div className={`divide-y divide-gray-50 transition-opacity ${soundsEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                        {SOUND_LABELS.map(({ key, label, description }) => (
                            <div key={key} className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5">
                                <div>
                                    <p className="text-sm font-medium text-text-main">{label}</p>
                                    <p className="text-xs text-text-muted mt-0.5">{description}</p>
                                </div>
                                <button
                                    onClick={() => playSound(key, soundVolume)}
                                    className="text-xs font-medium text-primary border border-primary/20 bg-primary/5 hover:bg-primary/10 px-3 py-1.5 rounded-full transition-colors"
                                >
                                    Preview
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
                {/* Appearance / Theme */}
                <div className="bg-surface border border-gray-100 rounded-2xl shadow-flat overflow-hidden mb-6">
                    <div className="px-6 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Palette className="w-4 h-4 text-text-muted" />
                            <span className="text-sm font-semibold text-text-main">Appearance</span>
                        </div>
                        <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-200 gap-1">
                            {(['light', 'dark', 'system'] as const).map((value) => {
                                const options = {
                                    light: { icon: Sun, label: 'Light' },
                                    dark: { icon: Moon, label: 'Dark' },
                                    system: { icon: Monitor, label: 'System' }
                                };
                                const { icon: Icon, label } = options[value];
                                const isActive = theme === value;
                                return (
                                    <button
                                        key={value}
                                        onClick={() => setTheme(value)}
                                        className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs font-medium transition-all ${isActive
                                                ? 'bg-white text-primary shadow-sm ring-1 ring-black/5'
                                                : 'text-text-muted hover:text-text-main'
                                            }`}
                                        title={`${label} Mode`}
                                    >
                                        <Icon className="w-4 h-4" />
                                        <span className="hidden sm:inline-block">{label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Account Management */}
                <div className="bg-surface border border-gray-100 rounded-2xl shadow-flat overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100">
                        <h2 className="text-sm font-semibold text-text-main">Account</h2>
                    </div>
                    <div className="px-6 py-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-text-main">Delete Account</p>
                                <p className="text-xs text-text-muted mt-0.5">Permanently delete your account and all data</p>
                            </div>
                            <button
                                onClick={() => setShowDeleteModal(true)}
                                className="text-xs font-medium text-primary border border-primary/20 bg-primary/5 hover:bg-primary/10 px-3 py-1.5 rounded-full transition-colors"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            </div>

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
        </>
    );
}
