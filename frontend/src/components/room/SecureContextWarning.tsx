import React from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';

export function SecureContextWarning() {
    const router = useRouter();

    return (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] px-4">
            <div className="bg-surface shadow-flat border border-gray-100 rounded-2xl p-8 max-w-md w-full text-center flex flex-col items-center">
                <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mb-6">
                    <Lock className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold text-text-main mb-3">Secure Connection Required</h2>
                <p className="text-text-muted mb-6 leading-relaxed">
                    To protect your privacy, video and audio chats are only available over <strong>HTTPS</strong> or <strong>localhost</strong>.
                </p>
                <button onClick={() => router.push('/dashboard')} className="w-full py-2.5 px-6 bg-primary text-white rounded-xl font-medium hover:bg-[#E0484D] transition-colors">
                    Back to Dashboard
                </button>
            </div>
        </div>
    );
}
