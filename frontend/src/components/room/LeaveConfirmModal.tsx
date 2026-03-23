import React from 'react';
import { createPortal } from 'react-dom';
import { LogOut } from 'lucide-react';

interface LeaveConfirmModalProps {
    isOpen: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}

export function LeaveConfirmModal({ isOpen, onCancel, onConfirm }: LeaveConfirmModalProps) {
    if (!isOpen || typeof document === 'undefined') return null;

    return createPortal(
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-transparent backdrop-blur-sm p-4" style={{ backgroundColor: 'rgba(0,0,0,0.4)', pointerEvents: 'auto' }}>
            <div className="bg-surface rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 text-red-500 mb-3">
                    <LogOut className="w-6 h-6" />
                    <h2 className="text-xl font-bold text-text-main">Leave Room?</h2>
                </div>
                <p className="text-text-muted mb-6">Are you sure you want to disconnect and leave this space?</p>
                <div className="flex gap-3">
                    <button
                        onClick={onCancel}
                        className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold shadow-sm hover:bg-red-600 transition-colors"
                    >
                        Leave
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
