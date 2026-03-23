"use client";

import React, { useRef, useState, useCallback, KeyboardEvent } from 'react';
import { Send, Paperclip } from 'lucide-react';

interface ChatInputProps {
    connected: boolean;
    isDark: boolean;
    sendMessage: (text: string) => void;
    sendTyping?: (isTyping: boolean) => void;
    onSendFile?: (file: File) => void;
    maxFileSize: number;
}

export function ChatInput({
    connected,
    isDark,
    sendMessage,
    sendTyping,
    onSendFile,
    maxFileSize,
}: ChatInputProps) {
    const [draft, setDraft] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // 3 lines × (14px font × 1.625 leading) ≈ 68px
    const MAX_HEIGHT_PX = 68;

    const resizeTextarea = (el: HTMLTextAreaElement) => {
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, MAX_HEIGHT_PX) + 'px';
    };

    const handleSend = () => {
        const text = draft.trim();
        if (!text) return;
        sendMessage(text);
        if (sendTyping) sendTyping(false);
        setDraft('');
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = null;
        }
        // Reset height back to 1 line after send
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.focus();
        }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        if (val.length <= 500) {
            setDraft(val);
            resizeTextarea(e.target);

            if (sendTyping) {
                if (val.length > 0) {
                    sendTyping(true);
                    
                    // Stop typing indicator after 3 seconds of inactivity
                    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                    typingTimeoutRef.current = setTimeout(() => {
                        sendTyping(false);
                    }, 3000);
                } else {
                    sendTyping(false);
                    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                }
            }
        }
    };

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > maxFileSize) {
            alert(`File is too large. Maximum size is ${Math.round(maxFileSize / (1024 * 1024))} MB.`);
            e.target.value = '';
            return;
        }

        if (onSendFile) {
            onSendFile(file);
        }
        e.target.value = ''; // reset so same file can be re-selected
    }, [maxFileSize, onSendFile]);

    // Cleanup typing timeout on unmount
    React.useEffect(() => {
        return () => {
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        };
    }, []);

    const remaining = 500 - draft.length;

    return (
        <div className={`
            shrink-0 border-t px-3 py-3
            ${isDark ? 'bg-[#121212] border-white/5' : 'bg-white border-gray-200'}
        `}>
            <div className={`
                relative flex items-center gap-2 rounded-2xl border px-3 py-2 min-h-[40px] focus-within:border-primary/50 transition-colors
                ${isDark ? 'bg-[#1E1E1E] border-white/10' : 'bg-[#F7F7F7] border-gray-200'}
            `}>

                {/* Hidden file input */}
                <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileSelect}
                />

                {/* Attachment button */}
                {onSendFile && (
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={!connected}
                        aria-label="Attach file"
                        title={`Attach file (max ${Math.round(maxFileSize / (1024 * 1024))} MB)`}
                        className="
                            shrink-0 w-8 h-8 flex items-center justify-center rounded-xl
                            text-text-muted hover:text-primary dark:hover:text-primary
                            disabled:opacity-30 disabled:cursor-not-allowed
                            transition-all duration-150
                        "
                    >
                        <Paperclip className="w-3.5 h-3.5" />
                    </button>
                )}

                <textarea
                    ref={textareaRef}
                    rows={1}
                    value={draft}
                    onChange={handleTextareaChange}
                    onKeyDown={handleKeyDown}
                    placeholder={connected ? 'Send a message…' : 'Connecting…'}
                    disabled={!connected}
                    className="
                        flex-1 resize-none bg-transparent text-sm text-text-main
                        outline-none leading-relaxed overflow-y-auto
                        placeholder:text-text-muted disabled:opacity-50
                    "
                    style={{ scrollbarWidth: 'none', maxHeight: `${MAX_HEIGHT_PX}px` }}
                />
                <button
                    onClick={handleSend}
                    disabled={!draft.trim() || !connected}
                    aria-label="Send message"
                    className="
                        shrink-0 w-8 h-8 flex items-center justify-center rounded-xl
                        bg-primary text-white
                        hover:brightness-90 active:scale-95
                        disabled:opacity-30 disabled:cursor-not-allowed
                        transition-all duration-150
                    "
                >
                    <Send className="w-3.5 h-3.5" />
                </button>
            </div>
            {/* Character counter — only show when nearing limit */}
            {remaining <= 100 && (
                <p className={`text-right text-[10px] mt-1 pr-1 ${remaining <= 20 ? 'text-primary' : 'text-text-muted'}`}>
                    {remaining} remaining
                </p>
            )}
            {/* File size hint */}
            {onSendFile && (
                <p className="text-[10px] text-text-muted dark:text-gray-500 mt-1 px-1 flex items-center gap-1">
                    <Paperclip className="w-2.5 h-2.5" />
                    Files up to {Math.round(maxFileSize / (1024 * 1024))} MB • E2E encrypted
                </p>
            )}
        </div>
    );
}
