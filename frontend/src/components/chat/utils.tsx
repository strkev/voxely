import React from 'react';

// ── URL parser: splits text into plain segments and URL segments ───────────────
const URL_RE = /(https?:\/\/[^\s]+)/g;

export function parseLinks(text: string): React.ReactNode[] {
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
export function formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Human-readable file size ──────────────────────────────────────────────────
export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
