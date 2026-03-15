/**
 * Bandpass filter noise suppression using Web Audio API.
 *
 * Uses a high-pass filter (~85 Hz) to remove rumble/HVAC/traffic
 * and a low-pass filter (~7500 Hz) to remove high-frequency hiss.
 * Also includes a DynamicsCompressor for level evening.
 */

export class FilterNoiseProcessor {
    private audioCtx: AudioContext | null = null;
    private sourceNode: MediaStreamAudioSourceNode | null = null;
    private destNode: MediaStreamAudioDestinationNode | null = null;

    /**
     * Process a MediaStream's audio through a bandpass filter chain.
     * Returns a new MediaStream with filtered audio.
     */
    async process(stream: MediaStream): Promise<MediaStream> {
        this.destroy();

        this.audioCtx = new AudioContext({ sampleRate: 48000 });
        this.sourceNode = this.audioCtx.createMediaStreamSource(stream);
        this.destNode = this.audioCtx.createMediaStreamDestination();

        // High-pass filter: remove low rumble (fans, HVAC, traffic)
        const highPass = this.audioCtx.createBiquadFilter();
        highPass.type = 'highpass';
        highPass.frequency.value = 85;
        highPass.Q.value = 0.7;

        // Low-pass filter: remove high-frequency hiss
        const lowPass = this.audioCtx.createBiquadFilter();
        lowPass.type = 'lowpass';
        lowPass.frequency.value = 7500;
        lowPass.Q.value = 0.7;

        // Gentle dynamics compressor to even out levels
        const compressor = this.audioCtx.createDynamicsCompressor();
        compressor.threshold.value = -24;
        compressor.knee.value = 12;
        compressor.ratio.value = 4;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.15;

        // Chain: source → highpass → lowpass → compressor → destination
        this.sourceNode.connect(highPass);
        highPass.connect(lowPass);
        lowPass.connect(compressor);
        compressor.connect(this.destNode);

        return this.destNode.stream;
    }

    destroy(): void {
        if (this.sourceNode) {
            this.sourceNode.disconnect();
            this.sourceNode = null;
        }
        if (this.destNode) {
            this.destNode.disconnect();
            this.destNode = null;
        }
        if (this.audioCtx) {
            this.audioCtx.close().catch(() => {});
            this.audioCtx = null;
        }
    }
}
