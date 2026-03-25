import sanitize from 'sanitize-html';

/**
 * Sanitizes user input by stripping all HTML tags and attributes.
 * Prevents XSS attacks in chat messages and user profiles.
 */
export const stripHtml = (text: string): string => {
    if (typeof text !== 'string') return '';
    return sanitize(text, { 
        allowedTags: [], 
        allowedAttributes: {} 
    }).trim();
};

/**
 * Regular expression for validating UUID v4 format.
 * Prevents injection attacks in friend-related events.
 */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Regular expression for validating Room IDs.
 * Allows alphanumeric characters, underscores, and hyphens (1-100 chars).
 */
export const ROOM_ID_RE = /^[a-zA-Z0-9_-]{1,100}$/;
