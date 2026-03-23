"use client";

import React, { useEffect, useRef, useState, useCallback, KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare, ChevronRight, ChevronDown, Send, SmilePlus, Paperclip, Download, FileIcon, AlertCircle, X } from 'lucide-react';
import type { FileTransferInfo } from '@/hooks/useFileTransfer';
import { ChatMessage, TypingUser } from '@/hooks/useChatSocket';
import DOMPurify from 'isomorphic-dompurify';
import { Mascot } from '@/components/voxy';

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
const EMOJI_OPTIONS = ['👍', '❤️', '😂', '😮', '😢'];

function MessageBubble({ msg, isOwn, currentUserId, onReact }: { msg: ChatMessage; isOwn: boolean; currentUserId: string; onReact: (msgId: string, emoji: string) => void }) {
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

// ── Human-readable file size ──────────────────────────────────────────────────
function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── FileBubble ────────────────────────────────────────────────────────────────
function FileBubble({ transfer, isOwn }: { transfer: FileTransferInfo; isOwn: boolean }) {
    const isComplete = transfer.status === 'complete';
    const isError = transfer.status === 'error';
    const isInProgress = transfer.status === 'sending' || transfer.status === 'receiving';

    return (
        <div className={`flex flex-col gap-0.5 group relative w-full`}>
            {/* Sender name + time */}
            <div className={`flex items-baseline gap-1.5 text-[10px] sm:text-xs text-text-muted px-1 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                <span className="font-semibold text-text-main truncate max-w-[120px]">{transfer.senderName}</span>
                <span>{formatTime(transfer.timestamp)}</span>
            </div>

            <div className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                <div
                    className={`
                        max-w-[85%] px-3 py-2.5 rounded-2xl text-sm leading-relaxed break-words
                        ${isOwn
                            ? 'bg-primary text-white rounded-tr-sm'
                            : 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-text-main dark:text-gray-200 rounded-tl-sm shadow-sm'
                        }
                    `}
                >
                    {/* File icon + name */}
                    <div className="flex items-center gap-2">
                        <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                            isError
                                ? 'bg-red-100 dark:bg-red-900/30'
                                : isOwn
                                    ? 'bg-white/20'
                                    : 'bg-gray-100 dark:bg-gray-700'
                        }`}>
                            {isError
                                ? <AlertCircle className="w-4 h-4 text-red-400" />
                                : <FileIcon className={`w-4 h-4 ${isOwn ? 'text-white/80' : 'text-text-muted dark:text-gray-400'}`} />
                            }
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className={`font-medium text-sm truncate ${isOwn ? 'text-white' : ''}`}>{transfer.fileName}</p>
                            <p className={`text-[10px] ${isOwn ? 'text-white/70' : 'text-text-muted dark:text-gray-400'}`}>
                                {formatFileSize(transfer.fileSize)}
                                {isError && <span className={`ml-1 ${isOwn ? 'text-white/80' : 'text-red-500'}`}>• {transfer.error || 'Error'}</span>}
                            </p>
                        </div>
                    </div>

                    {/* Progress bar */}
                    {isInProgress && (
                        <div className="mt-2">
                            <div className={`w-full h-1.5 rounded-full overflow-hidden ${isOwn ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-600'}`}>
                                <div
                                    className={`h-full rounded-full transition-all duration-300 ease-out ${isOwn ? 'bg-white' : 'bg-primary'}`}
                                    style={{ width: `${transfer.progress}%` }}
                                />
                            </div>
                            <p className={`text-[10px] mt-1 ${isOwn ? 'text-white/70' : 'text-text-muted dark:text-gray-400'}`}>
                                {transfer.status === 'sending' ? 'Sending' : 'Receiving'}… {transfer.progress}%
                            </p>
                        </div>
                    )}

                    {/* Download button — only for completed transfers */}
                    {isComplete && transfer.blobUrl && (
                        <a
                            href={transfer.blobUrl}
                            download={transfer.fileName}
                            className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors w-fit ${
                                isOwn
                                    ? 'bg-white/20 text-white hover:bg-white/30'
                                    : 'bg-gray-100 dark:bg-gray-700 text-text-main dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
                            }`}
                            onClick={e => e.stopPropagation()}
                        >
                            <Download className="w-3 h-3" />
                            Download
                        </a>
                    )}
                </div>
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
    onReact?: (msgId: string, emoji: string) => void;
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
    onReact,
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
    const [draft, setDraft] = useState('');
    const [mounted, setMounted] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

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
        if (isOpen && unreadCount > 0) onRead();
    }, [isOpen, onRead, unreadCount]);

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

    // ── File handling ─────────────────────────────────────────────────────
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
                                />
                            ) : (
                                <MessageBubble
                                    key={msg.id}
                                    msg={msg}
                                    isOwn={msg.userId === currentUserId}
                                    currentUserId={currentUserId}
                                    onReact={onReact || (() => {})}
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

                {/* Input area */}
                <div className={`
                    shrink-0 border-t px-3 py-3
                    ${isDark ? 'bg-[#121212] border-white/5' : 'bg-white border-gray-200'}
                `}>
                    {/*
                     * Wrapper: starts at 1-line height + padding, expands to max 3 lines.
                     * items-end keeps the send button at the bottom as the textarea grows.
                     */}
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
                                    text-text-muted hover:text-text-main dark:hover:text-gray-300
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
                    </div>
                </>,
                document.body
            ) : null}
        </>
    );
}
