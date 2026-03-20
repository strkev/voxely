/**
 * Extend built-in browser interfaces with experimental / vendor-prefixed APIs
 * so we can avoid `any` casts in application code.
 */

interface Window {
    /** Safari / older WebKit browsers expose AudioContext under this name */
    webkitAudioContext: typeof AudioContext;
}

interface HTMLMediaElement {
    /**
     * Experimental API for routing audio output to a specific device.
     * Supported in Chrome, Edge, and Opera.
     * @see https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/setSinkId
     */
    setSinkId(sinkId: string): Promise<void>;
}
