"use client";

import React, { useState, useEffect, useRef } from 'react';
import { SmilePlus } from 'lucide-react';
import type { ChatMessage } from '@/hooks/useChatSocket';
import DOMPurify from 'isomorphic-dompurify';
import { parseLinks, formatTime } from './utils';

const EMOJI_OPTIONS = ['👍', '❤️', '😂', '😮', '😢'];

interface MessageBubbleProps {
    msg: ChatMessage;
    isOwn: boolean;
    currentUserId: string;
    onReact: (msgId: string, emoji: string) => void;
}

export function MessageBubble({ msg, isOwn, currentUserId, onReact }: MessageBubbleProps) {
    const [showPicker, setShowPicker] = useState(false);
    const [reactionsExpanded, setReactionsExpanded] = useState(false);
    
    const pickerRef = useRef<HTMLDivElement>(null);
    const reactionsRef = useRef<HTMLDivElement>(null);

    // Hide picker when clicking outside
    useEffect(() => {
        if (!showPicker) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
                setShowPicker(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showPicker]);

    // Hide expanded reactions when clicking outside
    useEffect(() => {
        if (!reactionsExpanded) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (reactionsRef.current && !reactionsRef.current.contains(e.target as Node)) {
                setReactionsExpanded(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [reactionsExpanded]);

    const hasReactions = msg.reactions && Object.keys(msg.reactions).length > 0;

    return (
        <div className={`flex flex-col gap-0.5 group relative w-full`}>
            {/* Sender name + time */}
            <div className={`flex items-baseline gap-1.5 text-[10px] sm:text-xs text-text-muted px-1 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                <span className="font-semibold text-text-main truncate max-w-[120px]">{msg.name}</span>
                <span>{formatTime(msg.timestamp)}</span>
            </div>
            
            <div className={`flex items-end gap-2 relative ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                {/* Bubble */}
                <div
                    className={`
                        max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed break-words relative
                        ${isOwn
                            ? 'bg-primary text-white rounded-tr-sm'
                            : 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-text-main dark:text-gray-200 rounded-tl-sm shadow-sm'
                        }
                    `}
                >
                    {parseLinks(DOMPurify.sanitize(msg.text, { ALLOWED_TAGS: [] }))}
                </div>

                {/* Reaction Picker Trigger (Only when no reactions yet) */}
                {!hasReactions && (
                    <div className={`opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex-shrink-0 relative`}>
                        <button
                            onClick={() => setShowPicker(!showPicker)}
                            className={`p-1 rounded-full text-text-muted hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-text-main dark:hover:text-gray-200 transition-colors ${showPicker ? 'bg-gray-200 dark:bg-gray-700 text-text-main dark:text-gray-200 opacity-100' : ''}`}
                            title="React"
                        >
                            <SmilePlus className="w-4 h-4" />
                        </button>

                        {/* Emoji Picker Popup */}
                        {showPicker && (
                            <div 
                                ref={pickerRef}
                                className={`absolute bottom-full mb-1 ${isOwn ? 'right-0' : 'left-0'} flex gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full shadow-lg p-1 z-50 animate-in fade-in zoom-in duration-200`}
                            >
                                {EMOJI_OPTIONS.map(emoji => (
                                    <button
                                        key={emoji}
                                        onClick={() => {
                                            onReact(msg.id, emoji);
                                            setShowPicker(false);
                                        }}
                                        className="w-8 h-8 flex items-center justify-center text-lg hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors hover:scale-110"
                                    >
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Reactions Display */}
            {hasReactions && (
                <div 
                    ref={reactionsRef}
                    onClick={() => {
                        if (!reactionsExpanded) setReactionsExpanded(true);
                    }}
                    className={`flex flex-wrap relative z-10 -mt-2.5 ${isOwn ? 'justify-end pr-3 max-w-[80%] self-end' : 'justify-start pl-3 max-w-[80%] self-start'}`}
                    style={{ gap: reactionsExpanded ? '4px' : '0px' }}
                >
                    {/* Inline Add Reaction Button */}
                    <div className="relative">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowPicker(!showPicker);
                            }}
                            className={`flex items-center justify-center rounded-full bg-gray-800 text-gray-300 dark:bg-gray-800 dark:text-gray-300 border-[1.5px] border-white dark:border-[#F7F7F7] shadow-sm transition-all duration-200 w-[22px] h-[22px] hover:scale-105 active:scale-95`}
                            style={{
                                zIndex: reactionsExpanded ? 'auto' : Object.keys(msg.reactions!).length + 1
                            }}
                            title="Add Reaction"
                        >
                            <SmilePlus className="w-[12px] h-[12px]" />
                        </button>
                        
                        {/* Inline Emoji Picker Popup */}
                        {showPicker && (
                            <div 
                                ref={pickerRef}
                                className={`absolute bottom-full mb-1 ${isOwn ? 'right-0' : 'left-0'} flex gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full shadow-lg p-1 z-50 animate-in fade-in zoom-in duration-200`}
                            >
                                {EMOJI_OPTIONS.filter(emoji => !msg.reactions?.[emoji]?.includes(currentUserId)).map(emoji => (
                                    <button
                                        key={emoji}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onReact(msg.id, emoji);
                                            setShowPicker(false);
                                        }}
                                        className="w-8 h-8 flex items-center justify-center text-lg hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors hover:scale-110"
                                    >
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {Object.entries(msg.reactions!).map(([emoji, users], index) => {
                        const hasReacted = users.includes(currentUserId);
                        
                        const buttonClass = hasReacted
                            ? 'bg-white dark:bg-gray-800 border-primary text-primary shadow-sm shadow-primary/10' 
                            : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border-gray-200 dark:border-gray-700 text-text-muted dark:text-gray-300 shadow-sm';

                        const totalReactions = Object.keys(msg.reactions!).length;

                        return (
                            <button
                                key={emoji}
                                onClick={(e) => {
                                    if (!reactionsExpanded) {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setReactionsExpanded(true);
                                        return;
                                    }
                                    onReact(msg.id, emoji);
                                }}
                                className={`flex items-center justify-center text-xs rounded-full border transition-all duration-200 ease-out 
                                    ${reactionsExpanded ? 'px-2 py-[2px] gap-1.5 hover:scale-105 active:scale-95' : 'w-[22px] h-[22px]'} 
                                    ${!reactionsExpanded ? '-ml-1.5' : ''} 
                                    ${buttonClass}`}
                                style={{
                                    zIndex: reactionsExpanded ? 'auto' : totalReactions - index
                                }}
                            >
                                <span className={`text-[13px] leading-none ${reactionsExpanded ? 'mb-[1px]' : ''}`}>{emoji}</span>
                                {reactionsExpanded && (
                                    <span className={`font-semibold ${hasReacted ? '' : 'opacity-80 text-[11px]'}`}>{users.length}</span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
