/**
 * RNNoise-based noise suppression for MediaStreams.
 *
 * Uses @shiguredo/rnnoise-wasm to process audio in real-time via Web Audio API.
 * RNNoise expects 480-sample frames at 48 kHz (10 ms).
 * AudioWorklet/ScriptProcessor provides 128-sample chunks, so we buffer.
 */

import type { Rnnoise, DenoiseState } from '@shiguredo/rnnoise-wasm';

let rnnoiseModule: Rnnoise | null = null;

async function getRnnoise(): Promise<Rnnoise> {
    if (!rnnoiseModule) {
        // Dynamic import so the WASM binary is only fetched when needed
        const { Rnnoise } = await import('@shiguredo/rnnoise-wasm');
        rnnoiseModule = await Rnnoise.load();
    }
    return rnnoiseModule;
}

export class NoiseSuppressionProcessor {
    private audioCtx: AudioContext | null = null;
    private sourceNode: MediaStreamAudioSourceNode | null = null;
    private destNode: MediaStreamAudioDestinationNode | null = null;
    private workletNode: ScriptProcessorNode | null = null;
    private denoiseState: DenoiseState | null = null;
    private inputBuffer: Float32Array = new Float32Array(0);
    private outputBuffer: Float32Array = new Float32Array(0);
    private inputOffset = 0;
    private outputOffset = 0;
    private outputReadOffset = 0;
    private frameSize = 480; // RNNoise default
    private mix = 1.0; // 1.0 = full noise suppression, 0.0 = original

    /**
     * Process a MediaStream's audio through RNNoise.
     * Returns a new MediaStream with noise-suppressed audio.
     * Video tracks from the original stream are NOT included.
     */
    async process(stream: MediaStream): Promise<MediaStream> {
        this.destroy(); // Clean up any previous state

        const rnnoise = await getRnnoise();
        this.denoiseState = rnnoise.createDenoiseState();
        this.frameSize = rnnoise.frameSize; // Should be 480

        // Create audio context at 48 kHz (RNNoise's expected sample rate)
        this.audioCtx = new AudioContext({ sampleRate: 48000 });
        this.sourceNode = this.audioCtx.createMediaStreamSource(stream);
        this.destNode = this.audioCtx.createMediaStreamDestination();

        // Buffers for accumulating samples
        this.inputBuffer = new Float32Array(this.frameSize);
        this.outputBuffer = new Float32Array(this.frameSize);
        this.inputOffset = 0;
        this.outputOffset = this.frameSize; // Start empty (forces first fill)
        this.outputReadOffset = 0;

        // Use ScriptProcessorNode (widely supported, runs on main thread)
        // Buffer size of 256 is a good balance between latency and performance
        this.workletNode = this.audioCtx.createScriptProcessor(256, 1, 1);
        const originalInputBuffer = new Float32Array(this.frameSize);

        this.workletNode.onaudioprocess = (event) => {
            const input = event.inputBuffer.getChannelData(0);
            const output = event.outputBuffer.getChannelData(0);

            for (let i = 0; i < input.length; i++) {
                // Store original input sample for mixing (converting to RNNoise range)
                const originalSample = input[i] * 32768;
                this.inputBuffer[this.inputOffset++] = originalSample;

                if (this.inputOffset >= this.frameSize) {
                    // Store original frame before processing
                    originalInputBuffer.set(this.inputBuffer);

                    // Process a full frame
                    if (this.denoiseState) {
                        this.denoiseState.processFrame(this.inputBuffer);
                    }

                    // MIXING LOGIC: interpolate between original and denoised
                    for (let j = 0; j < this.frameSize; j++) {
                        this.outputBuffer[j] = (this.inputBuffer[j] * this.mix) + (originalInputBuffer[j] * (1 - this.mix));
                    }

                    this.outputOffset = 0;
                    this.outputReadOffset = 0;
                    this.inputOffset = 0;
                }

                // Output from the processed buffer, converting back from 16-bit range
                if (this.outputOffset < this.frameSize && this.outputReadOffset < this.frameSize) {
                    output[i] = this.outputBuffer[this.outputReadOffset++] / 32768;
                } else {
                    output[i] = 0;
                }
            }
        };

        this.sourceNode.connect(this.workletNode);
        this.workletNode.connect(this.destNode);

        return this.destNode.stream;
    }

    /**
     * Set the noise suppression level (0.0 to 1.0).
     * 1.0 = Full denoising
     * 0.0 = Pass-through
     */
    setMix(level: number): void {
        this.mix = Math.max(0, Math.min(1, level));
    }

    /**
     * Release all resources.
     */
    destroy(): void {
        if (this.workletNode) {
            this.workletNode.disconnect();
            this.workletNode.onaudioprocess = null;
            this.workletNode = null;
        }
        if (this.sourceNode) {
            this.sourceNode.disconnect();
            this.sourceNode = null;
        }
        if (this.destNode) {
            this.destNode.disconnect();
            this.destNode = null;
        }
        if (this.denoiseState) {
            this.denoiseState.destroy();
            this.denoiseState = null;
        }
        if (this.audioCtx) {
            this.audioCtx.close().catch(() => { });
            this.audioCtx = null;
        }
    }
}
