"use client";

import { Trash2, Loader2 } from 'lucide-react';

interface DeleteAccountModalProps {
    onConfirm: () => void;
    onCancel: () => void;
    deleting: boolean;
}

export function DeleteAccountModal({ onConfirm, onCancel, deleting }: DeleteAccountModalProps) {
    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-surface rounded-[32px] shadow-2xl border border-white/10 max-w-sm w-full p-8 animate-in zoom-in duration-300 relative overflow-hidden">
                {/* Decorative background element */}
                <div className="absolute -right-12 -top-12 w-48 h-48 bg-red-500/5 dark:bg-red-500/10 rounded-full blur-3xl pointer-events-none" />

                <div className="relative">
                    <div className="flex items-center justify-center w-20 h-20 rounded-[24px] bg-red-50 dark:bg-red-500/10 mx-auto mb-6 shadow-sm border border-red-100 dark:border-red-500/20">
                        <Trash2 className="w-10 h-10 text-red-500 transition-transform hover:scale-110 duration-300" />
                    </div>
                    <h2 className="text-2xl font-bold text-text-main text-center mb-3">Wait! Are you sure?</h2>
                    <p className="text-text-muted text-sm text-center mb-8 leading-relaxed">
                        This will permanently delete your account and all associated data. This action <strong>cannot be undone</strong>.
                    </p>
                    <div className="flex flex-col gap-3">
                        <button
                            onClick={onConfirm}
                            disabled={deleting}
                            className="w-full py-4 rounded-2xl bg-red-600 dark:bg-red-500 text-white text-sm font-bold shadow-lg shadow-red-500/20 hover:bg-[#E0484D] dark:hover:bg-red-400 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                        >
                            {deleting ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                                <>
                                    <Trash2 className="w-4 h-4" />
                                    Yes, Delete My Account
                                </>
                            )}
                        </button>
                        <button
                            onClick={onCancel}
                            className="w-full py-4 rounded-2xl border border-gray-100 dark:border-white/10 text-sm font-bold text-text-muted hover:text-text-main hover:bg-gray-50 dark:hover:bg-white/5 transition-all"
                        >
                            Nevermind, keep it
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
