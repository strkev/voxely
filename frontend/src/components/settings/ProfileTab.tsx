"use client";

import React, { useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { PRESET_COLORS, getContrastColor } from '@/lib/colors';
import { Check, Pencil, Loader2, Palette } from 'lucide-react';

export function ProfileTab() {
    const { user, updateProfile } = useAuthStore();

    const [editName, setEditName] = useState(user?.name || '');
    const [editColor, setEditColor] = useState(user?.avatarColor || '#FF5A5F');
    const [profileLoading, setProfileLoading] = useState(false);
    const [profileError, setProfileError] = useState('');
    const [profileSuccess, setProfileSuccess] = useState('');

    if (!user) return null;

    const handleProfileUpdate = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        setProfileLoading(true);
        setProfileError('');
        setProfileSuccess('');

        const body: Record<string, string> = {};
        if (editName !== user.name) body.name = editName;
        if (editColor !== (user.avatarColor || '#FF5A5F')) body.avatarColor = editColor;

        if (Object.keys(body).length === 0) {
            setProfileError('No changes to save');
            setProfileLoading(false);
            return;
        }

        const result = await updateProfile(body);
        if (result.success) {
            setProfileSuccess('Profile updated successfully');
        } else {
            setProfileError(result.error || 'Error');
        }
        setProfileLoading(false);
    };

    return (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <form onSubmit={handleProfileUpdate} className="space-y-8">
                {profileError && <div className="p-3 bg-red-50 text-red-600 rounded-2xl text-xs text-center">{profileError}</div>}
                {profileSuccess && <div className="p-3 bg-green-50 text-green-600 rounded-2xl text-xs text-center flex items-center justify-center gap-2"><Check className="w-4 h-4" />{profileSuccess}</div>}

                <div className="space-y-6">
                    <div className="flex items-center gap-4">
                        <div
                            className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold shadow-lg shadow-black/5"
                            style={{ backgroundColor: editColor, color: getContrastColor(editColor) }}
                        >
                            {editName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                        </div>
                        <div className="flex-1">
                            <label htmlFor="profile-username" className="block text-xs font-bold text-text-muted uppercase tracking-widest mb-2 px-1">Username</label>
                            <div className="relative group">
                                <Pencil className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted group-focus-within:text-primary transition-colors" />
                                <input
                                    id="profile-username"
                                    type="text"
                                    value={editName}
                                    onChange={(e) => { setEditName(e.target.value); setProfileSuccess(''); }}
                                    className="w-full h-12 pl-11 pr-4 rounded-2xl border border-gray-100 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm font-semibold"
                                    required
                                    maxLength={50}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="h-px bg-gray-50" />

                    <div className="space-y-4">
                        <label className="block text-xs font-bold text-text-muted uppercase tracking-widest px-1">Profile Color</label>
                        <div className="flex flex-wrap gap-2 px-1">
                            {PRESET_COLORS.map((color) => (
                                <button
                                    key={color}
                                    type="button"
                                    onClick={() => { setEditColor(color); setProfileSuccess(''); }}
                                    className={`w-10 h-10 rounded-xl cursor-pointer flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 border-2 ${editColor.toUpperCase() === color.toUpperCase() ? 'border-primary shadow-md ring-2 ring-primary/10' : 'border-transparent'}`}
                                    style={{ backgroundColor: color }}
                                >
                                    {editColor.toUpperCase() === color.toUpperCase() && <Check className="w-5 h-5" style={{ color: getContrastColor(color) }} />}
                                </button>
                            ))}
                            <div
                                className={`relative w-10 h-10 rounded-full cursor-pointer flex items-center justify-center border-2 border-[var(--color-surface)] shadow-sm overflow-hidden transition-all duration-200 ${!PRESET_COLORS.map(c => c.toUpperCase()).includes(editColor.toUpperCase()) ? 'ring-2 ring-primary ring-offset-1 ring-offset-[var(--color-surface)]' : ''
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
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={profileLoading}
                    className="w-full h-12 rounded-2xl bg-primary text-white text-sm font-bold shadow-lg shadow-primary/20 hover:bg-[#E0484D] active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                >
                    {profileLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Save Profile Changes'}
                </button>
            </form>
        </div>
    );
}
