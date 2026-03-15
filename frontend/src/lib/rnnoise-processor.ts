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
    
    // Circular Buffers
    private inputBuffer: Float32Array = new Float32Array(0);
    private outputBuffer: Float32Array = new Float32Array(0);
    private inputPtr = 0;
    private outputReadPtr = 0;
    private outputWritePtr = 0;
    private outputCount = 0;

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

        // Mandate 48kHz for RNNoise
        this.audioCtx = new AudioContext({ sampleRate: 48000 });
        this.sourceNode = this.audioCtx.createMediaStreamSource(stream);
        this.destNode = this.audioCtx.createMediaStreamDestination();

        // Initialize buffers
        // We need enough space to handle the mismatch between 128/256 and 480.
        // A buffer of 1024 (roughly 2 frames) is plenty.
        const bufferCapacity = 1024;
        this.inputBuffer = new Float32Array(this.frameSize);
        this.outputBuffer = new Float32Array(bufferCapacity);
        this.inputPtr = 0;
        this.outputReadPtr = 0;
        this.outputWritePtr = 0;
        this.outputCount = 0;

        // Use ScriptProcessorNode with 256 sample buffer
        this.workletNode = this.audioCtx.createScriptProcessor(256, 1, 1);

        this.workletNode.onaudioprocess = (event) => {
            const input = event.inputBuffer.getChannelData(0);
            const output = event.outputBuffer.getChannelData(0);

            for (let i = 0; i < input.length; i++) {
                // 1. Accumulate input until we have a full frame (480 samples)
                // RNNoise expects samples in range of short (-32768 to 32767)
                this.inputBuffer[this.inputPtr++] = input[i] * 32768;

                if (this.inputPtr >= this.frameSize) {
                    // 2. Process the full frame
                    if (this.denoiseState) {
                        this.denoiseState.processFrame(this.inputBuffer);
                    }

                    // 3. Move processed samples to output circular buffer
                    for (let j = 0; j < this.frameSize; j++) {
                        this.outputBuffer[this.outputWritePtr] = this.inputBuffer[j] / 32768;
                        this.outputWritePtr = (this.outputWritePtr + 1) % bufferCapacity;
                        this.outputCount++;
                    }
                    
                    // Reset input pointer for next frame
                    this.inputPtr = 0;
                }

                // 4. If we have processed samples available, write them to output
                if (this.outputCount > 0) {
                    output[i] = this.outputBuffer[this.outputReadPtr];
                    this.outputReadPtr = (this.outputReadPtr + 1) % bufferCapacity;
                    this.outputCount--;
                } else {
                    // Fallback to silence if model is too slow (unlikely at 10ms frames)
                    output[i] = 0;
                }
            }
        };

        this.sourceNode.connect(this.workletNode);
        this.workletNode.connect(this.destNode);

        return this.destNode.stream;
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
