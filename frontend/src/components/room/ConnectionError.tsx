import React from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';

export function ConnectionError({ onRetry }: { onRetry: () => void }) {
    const router = useRouter();
    
    return (
        <div className="flex-1 flex items-center justify-center min-h-[50vh] px-4">
            <div className="bg-surface shadow-flat border border-gray-100 rounded-2xl p-8 max-w-md w-full text-center flex flex-col items-center gap-4">
                <div className="w-14 h-14 bg-red-50 text-primary rounded-full flex items-center justify-center">
                    <AlertCircle className="w-7 h-7" />
                </div>
                <h2 className="text-xl font-semibold text-text-main">Connection Failed</h2>
                <p className="text-sm text-text-muted">Could not connect to the room. Please check the room code and try again.</p>
                <div className="flex gap-3 w-full mt-2">
                    <button onClick={() => router.push('/dashboard')} className="flex-1 h-11 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50 transition-colors">Dashboard</button>
                    <button onClick={onRetry} className="flex-1 h-11 rounded-xl bg-primary text-white text-sm font-medium hover:bg-[#E0484D] transition-colors">Retry</button>
                </div>
            </div>
        </div>
    );
}
