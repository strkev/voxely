"use client";

import React from 'react';
import type { TypingUser } from '@/hooks/useChatSocket';

export function TypingIndicatorBubble({ typingUsers }: { typingUsers: TypingUser[] }) {
    if (typingUsers.length === 0) return null;

    let text = '';
    if (typingUsers.length === 1) {
        text = `${typingUsers[0].name} is typing...`;
    } else if (typingUsers.length === 2) {
        text = `${typingUsers[0].name} and ${typingUsers[1].name} are typing...`;
    } else {
        text = `Several people are typing...`;
    }

    return (
        <div className="flex flex-col items-start gap-0.5 mt-2 animate-in fade-in zoom-in duration-200">
             <div className="flex items-baseline gap-1.5 text-[10px] text-text-muted px-1">
                <span className="font-semibold text-text-main truncate max-w-[120px]">{text}</span>
            </div>
            <div className="bg-white border border-gray-100 text-text-main rounded-2xl rounded-tl-sm px-3 py-2.5 shadow-sm self-start flex gap-1 items-center">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span>
            </div>
        </div>
    );
}
