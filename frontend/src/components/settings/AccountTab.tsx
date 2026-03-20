"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { DeleteAccountModal } from '@/components/settings/DeleteAccountModal';
import { Check, Loader2, Trash2 } from 'lucide-react';

interface AccountTabProps {
    onClose: () => void;
}

export function AccountTab({ onClose }: AccountTabProps) {
    const router = useRouter();
    const { user, updateProfile, deleteAccount } = useAuthStore();

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [profileLoading, setProfileLoading] = useState(false);
    const [profileError, setProfileError] = useState('');
    const [profileSuccess, setProfileSuccess] = useState('');

    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleting, setDeleting] = useState(false);

    if (!user) return null;

    const handlePasswordUpdate = async () => {
        setProfileLoading(true);
        setProfileError('');
        setProfileSuccess('');

        const body: Record<string, string> = {};
        if (newPassword) body.newPassword = newPassword;
        if (currentPassword) body.currentPassword = currentPassword;

        if (Object.keys(body).length === 0 || (Object.keys(body).length === 1 && body.currentPassword)) {
            setProfileError('No changes to save');
            setProfileLoading(false);
            return;
        }

        const result = await updateProfile(body);
        if (result.success) {
            setProfileSuccess('Password updated successfully');
            setCurrentPassword('');
            setNewPassword('');
        } else {
            setProfileError(result.error || 'Error');
        }
        setProfileLoading(false);
    };

    const handleDeleteAccount = async () => {
        setDeleting(true);
        await deleteAccount();
        setDeleting(false);
        setShowDeleteModal(false);
        onClose();
        router.push('/');
    };

    return (
        <>
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-8">
                <div className="space-y-6">
                    <h4 className="text-xs font-bold text-text-muted uppercase tracking-widest px-1">Password & Security</h4>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label htmlFor="new-password" className="text-[11px] font-bold text-text-muted ml-1">New Password</label>
                            <input
                                id="new-password"
                                type="password"
                                value={newPassword}
                                onChange={(e) => {
                                    setNewPassword(e.target.value);
                                    setProfileSuccess('');
                                    setProfileError('');
                                }}
                                placeholder="••••••••"
                                className="w-full h-12 px-4 rounded-2xl border border-gray-100 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm font-semibold"
                            />
                        </div>
                        {newPassword.length > 0 && (
                            <>
                                <div className="space-y-2">
                                    <label htmlFor="current-password" className="text-[11px] font-bold text-primary ml-1">Current Password Required</label>
                                    <input
                                        id="current-password"
                                        type="password"
                                        value={currentPassword}
                                        onChange={(e) => {
                                            setCurrentPassword(e.target.value);
                                            setProfileSuccess('');
                                            setProfileError('');
                                        }}
                                        placeholder="Enter current password to continue"
                                        className="w-full h-12 px-4 rounded-2xl border border-primary/20 bg-primary/5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm font-semibold"
                                        required
                                    />
                                </div>

                                <button
                                    type="button"
                                    onClick={handlePasswordUpdate}
                                    disabled={profileLoading || !currentPassword}
                                    className="w-full h-12 mt-4 rounded-2xl bg-primary text-white text-sm font-bold shadow-lg shadow-primary/20 hover:bg-[#E0484D] active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                                >
                                    {profileLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Save New Password'}
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {(profileError || profileSuccess) && (
                    <div className="space-y-4">
                        {profileError && <div className="p-3 bg-red-50 text-red-600 rounded-2xl text-xs text-center">{profileError}</div>}
                        {profileSuccess && <div className="p-3 bg-green-50 text-green-600 rounded-2xl text-xs text-center flex items-center justify-center gap-2"><Check className="w-4 h-4" />{profileSuccess}</div>}
                    </div>
                )}

                <div className="h-px bg-gray-50" />

                <div className="space-y-4">
                    <h4 className="text-xs font-bold text-text-muted uppercase tracking-widest px-1">Account Actions</h4>
                    <div className="group relative p-6 bg-red-50/50 dark:bg-red-400/5 rounded-[28px] border border-red-100 dark:border-red-500/20 backdrop-blur-sm transition-all hover:bg-red-50 dark:hover:bg-red-500/10 overflow-hidden">
                        {/* Decorative background element */}
                        <div className="absolute -right-6 -top-6 w-24 h-24 bg-red-500/5 dark:bg-white/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500 pointer-events-none" />

                        <div className="relative space-y-5">
                            <div className="flex items-start gap-4">
                                <div className="w-10 h-10 rounded-2xl bg-white dark:bg-red-500/10 flex items-center justify-center shadow-sm border border-red-50 dark:border-red-500/20 shrink-0">
                                    <Trash2 className="w-5 h-5 text-red-500 transition-transform group-hover:rotate-12" />
                                </div>
                                <div>
                                    <h5 className="text-sm font-bold text-red-600 dark:text-white-400">Delete Account</h5>
                                    <p className="text-xs text-white-500/70 dark:text-white-400/60 mt-1 leading-relaxed max-w-[340px]">
                                        Permanently remove your account and all associated data. This action is irreversible.
                                    </p>
                                </div>
                            </div>

                            <button
                                onClick={() => setShowDeleteModal(true)}
                                className="w-full h-12 rounded-2xl bg-white dark:bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-bold shadow-sm border border-red-100 dark:border-red-500/20 hover:border-red-600 dark:hover:border-red-500 hover:shadow-lg hover:shadow-red-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 group/btn"
                            >
                                Delete My Account
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {showDeleteModal && (
                <DeleteAccountModal
                    onConfirm={handleDeleteAccount}
                    onCancel={() => setShowDeleteModal(false)}
                    deleting={deleting}
                />
            )}
        </>
    );
}
