"use client";

import React from 'react';
import { FileIcon, AlertCircle, Download } from 'lucide-react';
import Image from 'next/image';
import type { FileTransferInfo } from '@/lib/file-utils';
import { formatTime, formatFileSize, isImageFile } from './utils';

export function FileBubble({ transfer, isOwn, isDark }: { transfer: FileTransferInfo; isOwn: boolean; isDark: boolean }) {
    const isComplete = transfer.status === 'complete';
    const isError = transfer.status === 'error';
    const isEvicted = transfer.status === 'evicted';
    const isInProgress = transfer.status === 'sending' || transfer.status === 'receiving';
    const isImage = isImageFile(transfer.fileName);

    return (
        <div className={`flex flex-col gap-0.5 group relative w-full`}>
            {/* Sender name + time */}
            <div className={`flex items-baseline gap-2 mb-1 text-xs text-text-muted px-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                <span className="font-bold text-text-main hover:underline cursor-pointer">{transfer.senderName}</span>
                <span className="text-[11px] opacity-70">{formatTime(transfer.timestamp)}</span>
            </div>

            <div className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                <div
                    className={`
                        w-full max-w-[320px] overflow-hidden rounded-[22px] border transition-all duration-200
                        ${isOwn
                            ? 'bg-primary border-primary shadow-md shadow-primary/10 text-white'
                            : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 text-text-main dark:text-gray-200 shadow-sm hover:shadow-md'
                        }
                    `}
                >
                    {/* Image Preview */}
                    {isComplete && isImage && transfer.blobUrl && (
                        <div className={`relative overflow-hidden bg-black/5 dark:bg-white/5 border-b ${isOwn ? 'border-white/10' : 'border-gray-100 dark:border-white/5'}`}>
                            <Image
                                src={transfer.blobUrl}
                                alt={transfer.fileName}
                                width={320}
                                height={300}
                                unoptimized
                                className="w-full max-h-[300px] object-cover"
                            />
                        </div>
                    )}

                    <div className="p-4">
                        {/* File icon + name */}
                        <div className={`flex items-center gap-4 ${isEvicted ? 'opacity-60' : ''}`}>
                            <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${isError
                                ? 'bg-red-50 dark:bg-red-900/20'
                                : isOwn
                                    ? 'bg-white/10'
                                    : 'bg-gray-50 dark:bg-gray-700/50'
                                }`}>
                                {isError
                                    ? <AlertCircle className="w-6 h-6 text-red-500" />
                                    : <FileIcon className={`w-6 h-6 ${isOwn ? 'text-white' : 'text-primary'}`} />
                                }
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="font-bold text-[15px] truncate leading-tight mb-0.5">{transfer.fileName}</p>
                                <p className={`text-xs ${isOwn ? 'text-white/80' : 'text-text-muted dark:text-gray-400'}`}>
                                    {formatFileSize(transfer.fileSize)}
                                    {isError && <span className="ml-1 text-red-500 font-medium whitespace-nowrap"> • {transfer.error || 'Failed'}</span>}
                                </p>
                            </div>
                        </div>

                        {/* Evicted State Compact Info */}
                        {isEvicted && (
                            <div className={`mt-3 p-2.5 rounded-lg border border-dashed text-[11px] leading-tight ${isOwn 
                                ? 'bg-white/10 border-white/30 text-white' 
                                : 'bg-gray-50 dark:bg-gray-950/40 border-gray-200 dark:border-gray-700 text-text-muted dark:text-gray-400'
                            }`}>
                                <span className="font-bold opacity-80 uppercase text-[9px] block mb-1">Memory Optimized</span>
                                deleted to save ram memory. Request sender to send again.
                            </div>
                        )}

                        {/* Progress bar */}
                        {isInProgress && (
                            <div className="mt-4">
                                <div className={`w-full h-1.5 rounded-full overflow-hidden ${isOwn ? 'bg-white/20' : 'bg-gray-100 dark:bg-gray-700'}`}>
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ease-out ${isOwn ? 'bg-white' : 'bg-primary shadow-[0_0_8px_rgba(var(--primary-rgb),0.4)]'}`}
                                        style={{ width: `${transfer.progress}%` }}
                                    />
                                </div>
                                <div className="flex justify-between items-center mt-2">
                                    <p className={`text-[11px] font-medium ${isOwn ? 'text-white/90' : 'text-text-muted dark:text-gray-400'}`}>
                                        {transfer.status === 'sending' ? 'Sending' : 'Receiving'}…
                                    </p>
                                    <p className={`text-[11px] font-bold ${isOwn ? 'text-white' : 'text-primary'}`}>
                                        {transfer.progress}%
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Download button — only for completed transfers */}
                        {isComplete && transfer.blobUrl && (
                            <a
                                href={transfer.blobUrl}
                                download={transfer.fileName}
                                className={`mt-4 flex items-center justify-center gap-2 w-full py-2.5 text-sm font-bold rounded-xl transition-all duration-200 border ${isOwn
                                    ? isDark
                                        ? 'bg-gray-800 text-primary hover:bg-gray-700 border-gray-700'
                                        : 'bg-white text-primary hover:bg-gray-50 border-white shadow-sm shadow-primary/5'
                                    : 'bg-primary text-white hover:bg-primary-hover border-primary shadow-sm shadow-primary/20'
                                    }`}
                                onClick={e => e.stopPropagation()}
                            >
                                <Download className="w-4 h-4" />
                                Download File
                            </a>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
