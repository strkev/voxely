"use client";

import React from 'react';
import type { ChatMessage } from '@/components/room/RoomTopbar';
import DOMPurify from 'isomorphic-dompurify';
import { parseLinks, formatTime } from './utils';

interface MessageBubbleProps {
    msg: ChatMessage;
    isOwn: boolean;
    currentUserId: string;
}

export function MessageBubble({ msg, isOwn }: MessageBubbleProps) {
    return (
        <div className="flex flex-col gap-0.5 group relative w-full">
            {/* Sender name + time */}
            <div className={`flex items-baseline gap-2 mb-1 text-xs text-text-muted px-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                <span className="font-bold text-text-main hover:underline cursor-pointer">{msg.name}</span>
                <span className="text-[11px] opacity-70">{formatTime(msg.timestamp)}</span>
            </div>
            
            <div className={`flex items-end gap-2 relative ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                {/* Bubble */}
                <div
                    className={`
                        max-w-[85%] px-4 py-2.5 rounded-[22px] text-[15px] leading-snug break-words relative transition-all duration-200
                        ${isOwn
                            ? 'bg-primary text-white shadow-md shadow-primary/10'
                            : 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-text-main dark:text-gray-200 shadow-sm hover:shadow-md'
                        }
                    `}
                >
                    {parseLinks(DOMPurify.sanitize(msg.text, { ALLOWED_TAGS: [] }))}
                </div>
            </div>
        </div>
    );
}
