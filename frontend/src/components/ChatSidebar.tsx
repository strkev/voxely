"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare, ChevronRight, ChevronDown } from 'lucide-react';
import type { FileTransferInfo } from '@/lib/file-utils';
import { ChatMessage, TypingUser } from '@/components/room/RoomTopbar';
import { Mascot } from '@/components/voxy';

// ── Extracted sub-components ──────────────────────────────────────────────────
import { MessageBubble } from '@/components/chat/MessageBubble';
import { FileBubble } from '@/components/chat/FileBubble';
import { TypingIndicatorBubble } from '@/components/chat/TypingIndicator';
import { ChatInput } from '@/components/chat/ChatInput';

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
    isDark: boolean;
    width?: number;
    onWidthChange?: (width: number) => void;
    forceCompact?: boolean;
    // File transfer
    fileTransfers?: Map<string, FileTransferInfo>;
    onSendFile?: (file: File) => void;
    maxFileSize?: number;
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
    isDark,
    width = 320,
    onWidthChange,
    forceCompact = false,
    fileTransfers,
    onSendFile,
    maxFileSize = 50 * 1024 * 1024,
}: ChatSidebarProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => { 
        const t = setTimeout(() => setMounted(true), 0);
        return () => clearTimeout(t);
    }, []);
    
    const bottomRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const [isAtBottom, setIsAtBottom] = useState(true);
    const [isResizing, setIsResizing] = useState(false);

    useEffect(() => {
        if (!isResizing) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!onWidthChange) return;
            const newWidth = window.innerWidth - e.clientX;
            const clampedWidth = Math.min(
                window.innerWidth,
                Math.max(320, Math.min(newWidth, window.innerWidth))
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

    // Handle window resize to keep sidebar width in bounds
    useEffect(() => {
        if (typeof window === 'undefined' || !onWidthChange) return;

        const handleResizeWindow = () => {
            if (width > window.innerWidth) {
                onWidthChange(window.innerWidth);
            }
        };

        window.addEventListener('resize', handleResizeWindow);
        return () => window.removeEventListener('resize', handleResizeWindow);
    }, [width, onWidthChange]);

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
        if (isOpen && unreadCount > 0) onRead();
    }, [isOpen, onRead, unreadCount]);

    // Merge text messages with file transfer messages for display
    const mergedMessages = React.useMemo(() => {
        if (!fileTransfers || fileTransfers.size === 0) return messages;

        // Convert file transfers into ChatMessage-like objects
        const fileMessages: ChatMessage[] = [];
        fileTransfers.forEach((transfer) => {
            fileMessages.push({
                id: `file-${transfer.transferId}`,
                userId: transfer.senderId,
                name: transfer.senderName,
                text: '',
                timestamp: transfer.timestamp,
                fileTransfer: {
                    transferId: transfer.transferId,
                    fileName: transfer.fileName,
                    fileSize: transfer.fileSize,
                    blobUrl: transfer.blobUrl,
                    progress: transfer.progress,
                    status: transfer.status,
                    error: transfer.error,
                },
            });
        });

        // Merge and sort by timestamp
        return [...messages, ...fileMessages].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );
    }, [messages, fileTransfers]);

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
                className="relative flex items-center bg-white/90 hover:bg-white border border-[rgba(220,220,220,0.85)] hover:border-primary/40 text-text-main hover:text-primary rounded-2xl px-3 py-2.5 sm:px-4 sm:py-2.5 text-sm font-medium transition-all duration-150 backdrop-blur-md shadow-sm"
            >
                <MessageSquare className="w-4 h-4" />
                <span className={`topbar-btn-inner ${forceCompact ? 'topbar-btn-inner--compact' : ''}`}>Chat</span>
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
                            ${isDark ? 'bg-[#121212] border-l border-white/5' : 'bg-[#F7F7F7] border-l border-gray-200'}
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
                <div className={`
                    flex items-center justify-between px-4 py-3 border-b shrink-0
                    ${isDark ? 'border-white/5 bg-[#121212]' : 'border-gray-200 bg-white'}
                `}>
                    <div className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-primary" />
                        <span className={`font-semibold text-sm ${isDark ? 'text-white' : 'text-text-main'}`}>Room Chat</span>
                        {/* Connection indicator */}
                        <span className={`flex h-1.5 w-1.5 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-300'}`} />
                    </div>
                    <button
                        onClick={onToggle}
                        aria-label="Close chat"
                        className={`p-1 rounded-lg text-text-muted transition-colors ${
                            isDark ? 'hover:bg-white/5 hover:text-white' : 'hover:bg-gray-100 hover:text-text-main'
                        }`}
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
                    {!connected ? (
                        <div className="h-full flex flex-col items-center justify-center text-center text-text-muted">
                            <div className="h-40 flex items-center justify-center">
                                <Mascot 
                                    state="locking" 
                                    trigger="always" 
                                    message="Connecting to secure chat..."
                                    className="scale-[0.5]"
                                />
                            </div>
                            <p className="text-sm font-medium">Connecting...</p>
                            <p className="text-xs opacity-60">Establishing a secure connection.</p>
                        </div>
                    ) : mergedMessages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center text-text-muted">
                            <div className="h-40 flex items-center justify-center">
                                <Mascot 
                                    state="typing" 
                                    trigger="always" 
                                    message="No messages yet. Why not say hello?"
                                    className="scale-[0.5]"
                                />
                            </div>
                            <p className="text-sm font-medium">No messages yet</p>
                            <p className="text-xs opacity-60">Be the first to say something!</p>
                        </div>
                    ) : (
                        mergedMessages.map(msg => (
                            msg.fileTransfer ? (
                                <FileBubble
                                    key={msg.id}
                                    transfer={{
                                        transferId: msg.fileTransfer.transferId,
                                        fileName: msg.fileTransfer.fileName,
                                        fileSize: msg.fileTransfer.fileSize,
                                        blobUrl: msg.fileTransfer.blobUrl,
                                        progress: msg.fileTransfer.progress,
                                        status: msg.fileTransfer.status,
                                        error: msg.fileTransfer.error,
                                        senderId: msg.userId,
                                        senderName: msg.name,
                                        timestamp: msg.timestamp,
                                    }}
                                    isOwn={msg.userId === currentUserId}
                                    isDark={isDark}
                                />
                            ) : (
                                <MessageBubble
                                    key={msg.id}
                                    msg={msg}
                                    isOwn={msg.userId === currentUserId}
                                    currentUserId={currentUserId}
                                />
                            )
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

                {/* Input area — extracted component */}
                <ChatInput
                    connected={connected}
                    isDark={isDark}
                    sendMessage={sendMessage}
                    sendTyping={sendTyping}
                    onSendFile={onSendFile}
                    maxFileSize={maxFileSize}
                />
                    </div>
                </>,
                document.body
            ) : null}
        </>
    );
}
