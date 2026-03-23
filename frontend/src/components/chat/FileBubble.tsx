"use client";

import React from 'react';
import { FileIcon, AlertCircle, Download } from 'lucide-react';
import type { FileTransferInfo } from '@/hooks/useFileTransfer';
import { formatTime, formatFileSize } from './utils';

export function FileBubble({ transfer, isOwn }: { transfer: FileTransferInfo; isOwn: boolean }) {
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
