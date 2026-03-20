/**
 * Simple Gain processor for MediaStreams using Web Audio API.
 * Used to amplify microphone input before it reaches other processors.
 */
export class GainProcessor {
    private audioCtx: AudioContext | null = null;
    private sourceNode: MediaStreamAudioSourceNode | null = null;
    private gainNode: GainNode | null = null;
    private destNode: MediaStreamAudioDestinationNode | null = null;

    /**
     * Process a MediaStream's audio through a GainNode.
     * Returns a new MediaStream with amplified audio.
     */
    async process(stream: MediaStream, gainValue: number): Promise<MediaStream> {
        this.destroy();

        if (gainValue === 1.0) return stream;

        // Use 48kHz for consistency with other processors
        this.audioCtx = new AudioContext({ sampleRate: 48000 });
        this.sourceNode = this.audioCtx.createMediaStreamSource(stream);
        this.gainNode = this.audioCtx.createGain();
        this.gainNode.gain.value = gainValue;
        this.destNode = this.audioCtx.createMediaStreamDestination();

        this.sourceNode.connect(this.gainNode);
        this.gainNode.connect(this.destNode);

        return this.destNode.stream;
    }

    destroy(): void {
        if (this.sourceNode) {
            this.sourceNode.disconnect();
            this.sourceNode = null;
        }
        if (this.gainNode) {
            this.gainNode.disconnect();
            this.gainNode = null;
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
