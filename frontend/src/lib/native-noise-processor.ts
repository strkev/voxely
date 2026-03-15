/**
 * Browser-native noise suppression using getUserMedia constraints.
 *
 * Leverages the browser's built-in WebRTC noise suppression
 * (Chrome/Edge use a high-quality implementation). Zero WASM overhead.
 */

export class NativeNoiseProcessor {
    private processedStream: MediaStream | null = null;

    /**
     * Re-acquire the microphone with noiseSuppression: true.
     * Returns a new MediaStream with the browser's built-in suppression.
     */
    async process(stream: MediaStream): Promise<MediaStream> {
        this.destroy();

        const audioTrack = stream.getAudioTracks()[0];
        if (!audioTrack) throw new Error('No audio track in stream');

        // Get the current track's device settings so we re-open the same mic
        const settings = audioTrack.getSettings();

        const constraints: MediaStreamConstraints = {
            audio: {
                deviceId: settings.deviceId ? { exact: settings.deviceId } : undefined,
                sampleRate: settings.sampleRate,
                channelCount: settings.channelCount,
                // Enable browser-native processing
                noiseSuppression: true,
                echoCancellation: true,
                autoGainControl: true,
            },
        };

        this.processedStream = await navigator.mediaDevices.getUserMedia(constraints);
        return this.processedStream;
    }

    destroy(): void {
        if (this.processedStream) {
            this.processedStream.getTracks().forEach(t => t.stop());
            this.processedStream = null;
        }
    }
}
