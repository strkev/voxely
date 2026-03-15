/**
 * RNNoise-based noise suppression for MediaStreams.
 *
 * Uses @shiguredo/rnnoise-wasm to process audio in real-time via Web Audio API.
 * RNNoise expects 480-sample frames at 48 kHz (10 ms).
 *
 * Key design decisions:
 * - Uses ScriptProcessorNode (deprecated but widely supported; AudioWorklet
 *   would require a separate JS file and cannot easily import the WASM module).
 * - Pre-fills output buffer with one frame of latency to prevent silence gaps
 *   while the first input frame accumulates.
 * - Uses a large circular buffer (4800 samples = 100 ms) to avoid overflow.
 */

import type { Rnnoise, DenoiseState } from '@shiguredo/rnnoise-wasm';

let rnnoiseModule: Rnnoise | null = null;

async function getRnnoise(): Promise<Rnnoise> {
    if (!rnnoiseModule) {
        const { Rnnoise } = await import('@shiguredo/rnnoise-wasm');
        rnnoiseModule = await Rnnoise.load();
    }
    return rnnoiseModule;
}

export class NoiseSuppressionProcessor {
    private audioCtx: AudioContext | null = null;
    private sourceNode: MediaStreamAudioSourceNode | null = null;
    private destNode: MediaStreamAudioDestinationNode | null = null;
    private scriptNode: ScriptProcessorNode | null = null;
    private denoiseState: DenoiseState | null = null;

    // Accumulation buffer for RNNoise frames
    private inputFrame: Float32Array = new Float32Array(0);
    private inputPtr = 0;

    // Circular output buffer (latency-compensated)
    private outputBuffer: Float32Array = new Float32Array(0);
    private outputReadPtr = 0;
    private outputWritePtr = 0;
    private outputCount = 0;
    private bufferCapacity = 0;

    private frameSize = 480; // RNNoise default

    /**
     * Process a MediaStream's audio through RNNoise.
     * Returns a new MediaStream with noise-suppressed audio.
     */
    async process(stream: MediaStream): Promise<MediaStream> {
        this.destroy();

        const rnnoise = await getRnnoise();
        this.frameSize = rnnoise.frameSize; // 480
        this.denoiseState = rnnoise.createDenoiseState();

        // Mandate 48 kHz for RNNoise
        this.audioCtx = new AudioContext({ sampleRate: 48000 });
        this.sourceNode = this.audioCtx.createMediaStreamSource(stream);
        this.destNode = this.audioCtx.createMediaStreamDestination();

        // --- Buffer setup ---
        // 4800 samples = 100 ms at 48 kHz — enough headroom for frame alignment
        this.bufferCapacity = 4800;
        this.inputFrame = new Float32Array(this.frameSize);
        this.outputBuffer = new Float32Array(this.bufferCapacity);
        this.inputPtr = 0;
        this.outputReadPtr = 0;
        this.outputWritePtr = 0;
        this.outputCount = 0;

        // Pre-fill one frame of silence into the output buffer.
        // This compensates for the inherent latency: RNNoise needs 480 input
        // samples before it outputs anything, but the ScriptProcessorNode asks
        // for output immediately. Without this, the first ~480 output samples
        // would be 0 (silence), causing an audible click/pop.
        for (let i = 0; i < this.frameSize; i++) {
            this.outputBuffer[this.outputWritePtr] = 0;
            this.outputWritePtr = (this.outputWritePtr + 1) % this.bufferCapacity;
            this.outputCount++;
        }

        // Use 256-sample ScriptProcessorNode buffer for low latency
        this.scriptNode = this.audioCtx.createScriptProcessor(256, 1, 1);

        this.scriptNode.onaudioprocess = (event) => {
            const input = event.inputBuffer.getChannelData(0);
            const output = event.outputBuffer.getChannelData(0);

            // 1. Feed input samples into the accumulation buffer
            for (let i = 0; i < input.length; i++) {
                // RNNoise expects int16-range values (-32768 to 32767)
                this.inputFrame[this.inputPtr++] = input[i] * 32768;

                if (this.inputPtr >= this.frameSize) {
                    // Process the full 480-sample frame
                    if (this.denoiseState) {
                        this.denoiseState.processFrame(this.inputFrame);
                    }

                    // Write processed samples to output circular buffer
                    for (let j = 0; j < this.frameSize; j++) {
                        this.outputBuffer[this.outputWritePtr] = this.inputFrame[j] / 32768;
                        this.outputWritePtr = (this.outputWritePtr + 1) % this.bufferCapacity;
                        this.outputCount = Math.min(this.outputCount + 1, this.bufferCapacity);
                    }

                    this.inputPtr = 0;
                }
            }

            // 2. Read from output buffer (always has data thanks to pre-fill)
            for (let i = 0; i < output.length; i++) {
                if (this.outputCount > 0) {
                    output[i] = this.outputBuffer[this.outputReadPtr];
                    this.outputReadPtr = (this.outputReadPtr + 1) % this.bufferCapacity;
                    this.outputCount--;
                } else {
                    // Should not happen with proper pre-fill, but safety fallback
                    output[i] = 0;
                }
            }
        };

        this.sourceNode.connect(this.scriptNode);
        this.scriptNode.connect(this.destNode);

        return this.destNode.stream;
    }

    /**
     * Release all resources.
     */
    destroy(): void {
        if (this.scriptNode) {
            this.scriptNode.disconnect();
            this.scriptNode.onaudioprocess = null;
            this.scriptNode = null;
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
            this.audioCtx.close().catch(() => {});
            this.audioCtx = null;
        }
    }
}
