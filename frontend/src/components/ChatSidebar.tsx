"use client";

import React, { useEffect, useRef, useState, useCallback, KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare, ChevronRight, ChevronDown, Send } from 'lucide-react';
import { ChatMessage, TypingUser } from '@/hooks/useChatSocket';
import DOMPurify from 'isomorphic-dompurify';

// ── URL parser: splits text into plain segments and URL segments ───────────────
function parseLinks(text: string): React.ReactNode[] {
    const URL_RE = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(URL_RE);
    return parts.map((part, i) => {
        if (URL_RE.test(part)) {
            // Reset lastIndex after test()
            URL_RE.lastIndex = 0;
            return (
                <a
                    key={i}
                    href={part}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:opacity-80 break-all"
                    onClick={e => e.stopPropagation()}
                >
                    {part}
                </a>
            );
        }
        return part;
    });
}

// ── Timestamp formatter ───────────────────────────────────────────────────────
function formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Typing Indicator Bubble ───────────────────────────────────────────────────
function TypingIndicatorBubble({ typingUsers }: { typingUsers: TypingUser[] }) {
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

// ── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({ msg, isOwn }: { msg: ChatMessage; isOwn: boolean }) {
    return (
        <div className={`flex flex-col gap-0.5 ${isOwn ? 'items-end' : 'items-start'}`}>
            {/* Sender name + time */}
            <div className={`flex items-baseline gap-1.5 text-xs text-text-muted px-1 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                <span className="font-semibold text-text-main truncate max-w-[120px]">{msg.name}</span>
                <span>{formatTime(msg.timestamp)}</span>
            </div>
            {/* Bubble */}
            <div
                className={`
                    max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed break-words
                    ${isOwn
                        ? 'bg-primary text-white rounded-tr-sm'
                        : 'bg-white border border-gray-100 text-text-main rounded-tl-sm shadow-sm'
                    }
                `}
            >
                {parseLinks(DOMPurify.sanitize(msg.text, { ALLOWED_TAGS: [] }))}
            </div>
        </div>
    );
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface ChatSidebarProps {
    roomId: string;
    currentUserId: string;
    messages: ChatMessage[];
    typingUsers?: TypingUser[];
    sendMessage: (text: string) => void;
    sendTyping?: (isTyping: boolean) => void;
    connected: boolean;
    isOpen: boolean;
    onToggle: () => void;
    unreadCount: number;
    onRead: () => void;
    width?: number;
    onWidthChange?: (width: number) => void;
}

// ── ChatSidebar ───────────────────────────────────────────────────────────────
export function ChatSidebar({
    currentUserId,
    messages,
    typingUsers = [],
    sendMessage,
    sendTyping,
    connected,
    isOpen,
    onToggle,
    unreadCount,
    onRead,
    width = 320,
    onWidthChange,
}: ChatSidebarProps) {
    const [draft, setDraft] = useState('');
    const [mounted, setMounted] = useState(false);

    useEffect(() => { 
        const t = setTimeout(() => setMounted(true), 0);
        return () => clearTimeout(t);
    }, []);
    
    const bottomRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [isAtBottom, setIsAtBottom] = useState(true);
    const [isResizing, setIsResizing] = useState(false);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (!isResizing) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!onWidthChange) return;
            const newWidth = window.innerWidth - e.clientX;
            // Min 320px, max 80% of window width
            // FIX: Ensure that clampedWidth doesn't exceed the actual window width
            // if the window is smaller than 320px.
            const clampedWidth = Math.min(
                window.innerWidth,
                Math.max(320, Math.min(newWidth, window.innerWidth * 0.8))
            );
            onWidthChange(clampedWidth);
        };

        const handleMouseUp = () => {
            setIsResizing(false);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        // Prevent body text selection while resizing
        document.body.style.userSelect = 'none';

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.userSelect = '';
        };
    }, [isResizing, onWidthChange]);

    // 3 lines × (14px font × 1.625 leading) ≈ 68px
    const MAX_HEIGHT_PX = 68;

    const resizeTextarea = (el: HTMLTextAreaElement) => {
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, MAX_HEIGHT_PX) + 'px';
    };

    // Track whether user is scrolled to bottom
    const handleScroll = useCallback(() => {
        const el = messagesContainerRef.current;
        if (!el) return;
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        setIsAtBottom(atBottom);
    }, []);

    // Auto-scroll only if user is at bottom
    useEffect(() => {
        if (isOpen && isAtBottom) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, typingUsers, isOpen, isAtBottom]);

    // Mark as read when panel opens
    useEffect(() => {
        if (isOpen) onRead();
    }, [isOpen, onRead]);

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

    // Cleanup typing timeout on unmount
    useEffect(() => {
        return () => {
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        };
    }, []);

    const remaining = 500 - draft.length;

    const scrollToBottom = () => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    return (
        <>
            {/* ── Toggle button (top bar) ──────────────────────────────────── */}
            <button
                onClick={onToggle}
                aria-label={isOpen ? 'Close chat' : 'Open chat'}
                title={isOpen ? 'Close chat' : 'Open chat'}
                className="relative flex items-center gap-1.5 bg-white/90 hover:bg-white border border-[rgba(220,220,220,0.85)] hover:border-primary/40 text-text-main hover:text-primary rounded-2xl px-3 py-2.5 sm:px-4 sm:py-2.5 text-sm font-medium transition-all duration-150 backdrop-blur-md shadow-sm"
            >
                <MessageSquare className="w-4 h-4" />
                <span className="hidden sm:inline">Chat</span>
                {/* Unread badge */}
                {unreadCount > 0 && !isOpen && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] min-h-[18px] bg-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 shadow-sm animate-pulse-soft z-50">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {/* ── Sidebar panel ─────────────────────────────────────────────── */}
            {mounted && typeof document !== 'undefined' ? createPortal(
                <>
                    {/* Mobile backdrop overlay */}
                    {isOpen && (
                        <div
                            className="fixed inset-0 top-16 z-[45] bg-black/40 sm:hidden"
                            onClick={onToggle}
                        />
                    )}
                    <div
                        className={`
                            fixed top-16 right-0 bottom-0 z-[50]
                            flex flex-col
                            bg-[#F7F7F7] border-l border-gray-200
                            ${isOpen ? 'flex' : 'hidden'}
                            w-full sm:w-auto
                        `}
                        style={{
                            width: isOpen && typeof window !== 'undefined' && window.innerWidth >= 640 ? `${width}px` : undefined
                        }}
                    >
                        {/* Drag Handle */}
                        <div
                            className="hidden sm:block absolute top-0 left-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 z-[60] transition-colors -ml-1.5"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        setIsResizing(true);
                    }}
                />
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white shrink-0">
                    <div className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-primary" />
                        <span className="font-semibold text-text-main text-sm">Room Chat</span>
                        {/* Connection indicator */}
                        <span className={`flex h-1.5 w-1.5 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-300'}`} />
                    </div>
                    <button
                        onClick={onToggle}
                        aria-label="Close chat"
                        className="p-1 rounded-lg text-text-muted hover:bg-gray-100 hover:text-text-main transition-colors"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>

                {/* Messages */}
                <div
                    ref={messagesContainerRef}
                    onScroll={handleScroll}
                    className="flex-1 overflow-y-auto px-3 py-4 space-y-3 scroll-smooth relative"
                >
                    {messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center text-text-muted gap-2 py-8">
                            <MessageSquare className="w-8 h-8 opacity-25" />
                            <p className="text-sm font-medium">No messages yet</p>
                            <p className="text-xs opacity-60">Be the first to say something!</p>
                        </div>
                    ) : (
                        messages.map(msg => (
                            <MessageBubble
                                key={msg.id}
                                msg={msg}
                                isOwn={msg.userId === currentUserId}
                            />
                        ))
                    )}
                    
                    {/* Typing Indicator */}
                    <TypingIndicatorBubble typingUsers={typingUsers} />

                    <div ref={bottomRef} />

                    {/* Scroll to bottom button */}
                    {!isAtBottom && messages.length > 0 && (
                        <button
                            onClick={scrollToBottom}
                            aria-label="Scroll to latest messages"
                            className="sticky bottom-2 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-primary text-white shadow-lg flex items-center justify-center hover:bg-[#E0484D] transition-colors z-10"
                        >
                            <ChevronDown className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* Input area */}
                <div className="shrink-0 border-t border-gray-200 bg-white px-3 py-3">
                    {/*
                     * Wrapper: min-height = 3 lines (~68px) + vertical padding (16px) = ~84px.
                     * items-center keeps the send button centred as the textarea grows.
                     */}
                    <div className="relative flex items-center gap-2 bg-[#F7F7F7] rounded-2xl border border-gray-200 px-3 py-2 min-h-[84px] focus-within:border-primary/50 transition-colors">

                        {/* Custom placeholder — absolutely centred, hidden once user starts typing */}
                        {!draft && (
                            <span className="absolute inset-0 flex items-center pl-3 pr-12 text-sm text-text-muted pointer-events-none select-none leading-relaxed">
                                {connected ? 'Send a message…' : 'Connecting…'}
                            </span>
                        )}

                        <textarea
                            ref={textareaRef}
                            rows={1}
                            value={draft}
                            onChange={handleTextareaChange}
                            onKeyDown={handleKeyDown}
                            placeholder=""
                            disabled={!connected}
                            className="
                                flex-1 resize-none bg-transparent text-sm text-text-main
                                outline-none leading-relaxed overflow-y-auto
                                disabled:opacity-50
                            "
                            style={{ scrollbarWidth: 'none', maxHeight: `${MAX_HEIGHT_PX}px` }}
                        />
                        <button
                            onClick={handleSend}
                            disabled={!draft.trim() || !connected}
                            aria-label="Send message"
                            className="
                                shrink-0 self-end mb-0.5 w-8 h-8 flex items-center justify-center rounded-xl
                                bg-primary text-white
                                hover:bg-[#E0484D] disabled:opacity-30 disabled:cursor-not-allowed
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
                </div>
                    </div>
                </>,
                document.body
            ) : null}
        </>
    );
}
