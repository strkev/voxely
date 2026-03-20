import React, { memo } from 'react';
import { useUIStore } from '@/store/useUIStore';

export const ChatToast = memo(() => {
    const toastMessage = useUIStore(s => s.toastMessage);
    const clearToast = useUIStore(s => s.clearToast);
    const chatOpen = useUIStore(s => s.chatOpen);
    const chatSidebarWidth = useUIStore(s => s.chatSidebarWidth);
    const setChatOpen = useUIStore(s => s.setChatOpen);

    if (!toastMessage) return null;

    return (
        <div
            className={`
                fixed top-[120px] z-50 transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]
                opacity-100 translate-x-0
            `}
            style={{
                right: chatOpen && typeof window !== 'undefined' && window.innerWidth >= 640 ? `${chatSidebarWidth + 16}px` : '16px'
            }}
        >
            <button
                onClick={() => {
                    setChatOpen(true);
                    clearToast();
                }}
                className="flex flex-col gap-1 items-start bg-white dark:bg-gray-900/95 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-2xl p-4 shadow-2xl dark:shadow-black/40 max-w-[300px] hover:border-primary/40 dark:hover:border-primary/40 transition-all text-left"
            >
                <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
                    <span className="text-xs font-bold text-gray-900 dark:text-white truncate">{toastMessage.name}</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2 leading-relaxed break-words w-full">
                    {toastMessage.text}
                </p>
            </button>
        </div>
    );
});

ChatToast.displayName = 'ChatToast';
