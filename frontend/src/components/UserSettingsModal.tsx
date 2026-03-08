"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { playSound } from '@/lib/sounds';
import { PRESET_COLORS, getContrastColor } from '@/lib/colors';
import { Volume2, VolumeX, Bell, X, Trash2, Pencil, Loader2, Check, Moon, Palette } from 'lucide-react';

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


interface UserSettingsModalProps {
    onClose: () => void;
}

export function UserSettingsModal({ onClose }: UserSettingsModalProps) {
    const { user, token, setAuth, deleteAccount } = useAuthStore();
    const { soundsEnabled, soundVolume, setSoundsEnabled, setSoundVolume, theme, setTheme } = useSettingsStore();
    const backdropRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleting, setDeleting] = useState(false);

    // Edit profile state
    const [editColor, setEditColor] = useState('#FF5A5F');
    const [editName, setEditName] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [profileLoading, setProfileLoading] = useState(false);
    const [profileError, setProfileError] = useState('');
    const [profileSuccess, setProfileSuccess] = useState('');

    useEffect(() => {
        if (user) {
            setEditName(user.name);
            if (user.avatarColor) setEditColor(user.avatarColor); // Initiale Farbe laden
        }
    }, [user]);

    useEffect(() => {
        if (user) setEditName(user.name);
    }, [user]);

    // Lock body scroll
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    // Escape key to close
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    if (!user) return null;

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
        onClose();
        router.push('/');
    };

    const needsCurrentPassword = newPassword.length > 0;

    return (
        <>
            <div
                ref={backdropRef}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
            >
                <div className="bg-surface rounded-2xl shadow-xl border border-gray-100 w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto">
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-surface rounded-t-2xl z-10">
                        <h2 className="text-base font-semibold text-text-main">User Settings</h2>
                        <button onClick={onClose} className="p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-gray-100 transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Profile card */}
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
                        <div
                            className="w-11 h-11 rounded-full flex items-center justify-center text-lg font-bold shrink-0 transition-colors duration-200"
                            style={{
                                backgroundColor: user.avatarColor || '#FF5A5F',
                                color: getContrastColor(user.avatarColor || '#FF5A5F')
                            }}
                        >
                            {initials}
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-text-main">{user.name}</p>
                        </div>
                    </div>

                    {/* Edit Profile */}
                    <div className="border-b border-gray-100">
                        <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-2">
                            <Pencil className="w-3.5 h-3.5 text-text-muted" />
                            <h3 className="text-xs font-semibold text-text-main uppercase tracking-wider">Edit Profile</h3>
                        </div>

                        <form onSubmit={handleProfileUpdate} className="px-6 py-4 space-y-3">
                            {profileError && (
                                <div className="p-2.5 bg-red-50 text-red-600 rounded-xl text-xs text-center">
                                    {profileError}
                                </div>
                            )}
                            {profileSuccess && (
                                <div className="p-2.5 bg-green-50 text-green-600 rounded-xl text-xs text-center flex items-center justify-center gap-1.5">
                                    <Check className="w-3.5 h-3.5" />
                                    {profileSuccess}
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-medium text-text-main mb-1 ml-1">Username</label>
                                <input
                                    type="text"
                                    value={editName}
                                    onChange={(e) => { setEditName(e.target.value); setProfileSuccess(''); }}
                                    className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                    required
                                    maxLength={50}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-text-main mb-1 ml-1">
                                    New Password <span className="text-text-muted font-normal">(leave empty to keep)</span>
                                </label>
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => { setNewPassword(e.target.value); setProfileSuccess(''); }}
                                    placeholder="••••••••"
                                    className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                    minLength={8}
                                />
                            </div>

                            {needsCurrentPassword && (
                                <div>
                                    <label className="block text-xs font-medium text-text-main mb-1 ml-1">
                                        Current Password <span className="text-primary">*</span>
                                    </label>
                                    <input
                                        type="password"
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        placeholder="Required to change password"
                                        className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
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
                                                <Palette className="w-4 h-4 text-gray-500" />
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

                                <div className="mt-2 ml-1">
                                    <span className="text-[10px] font-mono text-text-muted uppercase bg-gray-50 px-2 py-0.5 rounded-md border border-gray-100">
                                        {editColor}
                                    </span>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={profileLoading}
                                className="w-full h-10 rounded-xl bg-primary text-white text-sm font-medium hover:bg-[#E0484D] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                            >
                                {profileLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
                            </button>


                        </form>
                    </div>

                    {/* Sound Settings */}
                    <div className="border-b border-gray-100">
                        <div className="px-6 py-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Bell className="w-3.5 h-3.5 text-text-muted" />
                                <h3 className="text-xs font-semibold text-text-main uppercase tracking-wider">Sound Effects</h3>
                            </div>
                            <button
                                onClick={() => setSoundsEnabled(!soundsEnabled)}
                                className={`relative w-10 h-5.5 rounded-full transition-colors duration-200 ${soundsEnabled ? 'bg-primary' : 'bg-gray-200'}`}
                            >
                                <span className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-transform duration-200 ${soundsEnabled ? 'translate-x-4.5' : 'translate-x-0'}`} />
                            </button>
                        </div>
                        <div className={`px-6 pb-4 transition-opacity ${soundsEnabled ? '' : 'opacity-40 pointer-events-none'}`}>
                            <div className="flex items-center gap-2 mb-3">
                                <VolumeX className="w-3 h-3 text-text-muted" />
                                <input
                                    type="range" min={0} max={1} step={0.01} value={soundVolume}
                                    onChange={(e) => setSoundVolume(parseFloat(e.target.value))}
                                    className="flex-1 h-1 rounded-full accent-primary cursor-pointer"
                                />
                                <Volume2 className="w-3 h-3 text-text-muted" />
                                <span className="text-[10px] font-mono text-text-muted w-7 text-right">{Math.round(soundVolume * 100)}%</span>
                            </div>
                            <div className="grid grid-cols-4 gap-1.5">
                                {SOUND_LABELS.map(({ key, label }) => (
                                    <button
                                        key={key}
                                        onClick={() => playSound(key, soundVolume)}
                                        className="text-[10px] font-medium text-primary border border-primary/20 bg-primary/5 hover:bg-primary/10 px-2 py-1 rounded-lg transition-colors truncate"
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Dark Mode */}
                    <div className="border-b border-gray-100">
                        <div className="px-6 py-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Moon className="w-3.5 h-3.5 text-text-muted" />
                                <h3 className="text-xs font-semibold text-text-main uppercase tracking-wider">Dark Mode</h3>
                            </div>
                            <button
                                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                                className={`relative w-10 h-5.5 rounded-full transition-colors duration-200 ${theme === 'dark' ? 'bg-primary' : 'bg-gray-200'}`}
                            >
                                <span className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-transform duration-200 ${theme === 'dark' ? 'translate-x-4.5' : 'translate-x-0'}`} />
                            </button>
                        </div>
                    </div>

                    {/* Account / Delete */}
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

            {/* Delete Account Confirmation */}
            {showDeleteModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm">
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
