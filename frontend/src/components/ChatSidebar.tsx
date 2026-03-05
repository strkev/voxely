"use client";

import React, { useEffect, useRef, useState, useCallback, KeyboardEvent } from 'react';
import { MessageSquare, X, ChevronRight, ChevronDown, Send } from 'lucide-react';
import { ChatMessage } from '@/hooks/useChatSocket';
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
    sendMessage: (text: string) => void;
    connected: boolean;
    isOpen: boolean;
    onToggle: () => void;
    unreadCount: number;
    onRead: () => void;
}

// ── ChatSidebar ───────────────────────────────────────────────────────────────
export function ChatSidebar({
    currentUserId,
    messages,
    sendMessage,
    connected,
    isOpen,
    onToggle,
    unreadCount,
    onRead,
}: ChatSidebarProps) {
    const [draft, setDraft] = useState('');
    const bottomRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [isAtBottom, setIsAtBottom] = useState(true);

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
    }, [messages, isOpen, isAtBottom]);

    // Mark as read when panel opens
    useEffect(() => {
        if (isOpen) onRead();
    }, [isOpen, onRead]);

    const handleSend = () => {
        const text = draft.trim();
        if (!text) return;
        sendMessage(text);
        setDraft('');
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
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] min-h-[18px] bg-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 shadow-sm animate-pulse-soft">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {/* ── Sidebar panel ─────────────────────────────────────────────── */}
            {/* Mobile backdrop overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 top-16 z-0 bg-black/40 sm:hidden"
                    onClick={onToggle}
                />
            )}
            <div
                className={`
                    fixed top-16 right-0 bottom-0 w-full sm:w-80 z-30
                    flex flex-col
                    bg-[#F7F7F7] border-l border-gray-200
                    ${isOpen ? 'block' : 'hidden'}
                `}
            >
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
                            onChange={e => {
                                if (e.target.value.length <= 500) {
                                    setDraft(e.target.value);
                                    resizeTextarea(e.target);
                                }
                            }}
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
        </>
    );
}
