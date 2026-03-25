import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupAudioMock, AudioContextMock } from '../../test/audio-mock';
import { GainProcessor } from '../gain-processor';
import { NoiseSuppressionProcessor } from '../rnnoise-processor';

// Mock RNNoise WASM module
const mockDenoiseState = {
    processFrame: vi.fn(),
    destroy: vi.fn(),
};

vi.mock('@shiguredo/rnnoise-wasm', () => ({
    Rnnoise: {
        load: vi.fn().mockResolvedValue({
            frameSize: 480,
            createDenoiseState: vi.fn().mockReturnValue(mockDenoiseState),
        }),
    },
}));

describe('Audio Processors', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupAudioMock();
    });

    describe('GainProcessor', () => {
        it('should initialize AudioContext with 48kHz and connect nodes', async () => {
            const processor = new GainProcessor();
            const mockStream = new MediaStream([]);
            const gainValue = 2.0;

            const resultStream = await processor.process(mockStream, gainValue);

            expect(AudioContextMock).toHaveBeenCalledWith({ sampleRate: 48000 });
            
            const ctx = AudioContextMock.mock.results[0].value;
            expect(ctx.createMediaStreamSource).toHaveBeenCalledWith(mockStream);
            expect(ctx.createGain).toHaveBeenCalled();
            expect(ctx.createMediaStreamDestination).toHaveBeenCalled();

            const gainNode = ctx.createGain.mock.results[0].value;
            expect(gainNode.gain.value).toBe(gainValue);
            
            expect(resultStream).toBe(ctx.createMediaStreamDestination.mock.results[0].value.stream);
        });

        it('should return original stream if gain is 1.0', async () => {
            const processor = new GainProcessor();
            const mockStream = new MediaStream([]);
            
            const resultStream = await processor.process(mockStream, 1.0);
            expect(resultStream).toBe(mockStream);
            expect(AudioContextMock).not.toHaveBeenCalled();
        });

        it('should cleanup resources on destroy', async () => {
            const processor = new GainProcessor();
            const mockStream = new MediaStream([]);
            await processor.process(mockStream, 2.0);
            
            const ctx = AudioContextMock.mock.results[0].value;
            processor.destroy();
            
            expect(ctx.close).toHaveBeenCalled();
        });
    });

    describe('NoiseSuppressionProcessor (RNNoise)', () => {
        it('should initialize RNNoise and ScriptProcessorNode', async () => {
            const processor = new NoiseSuppressionProcessor();
            const mockStream = new MediaStream([]);

            await processor.process(mockStream);

            const ctx = AudioContextMock.mock.results[0].value;
            expect(ctx.createScriptProcessor).toHaveBeenCalledWith(4096, 1, 1);
            
            const scriptNode = ctx.createScriptProcessor.mock.results[0].value;
            expect(scriptNode.connect).toHaveBeenCalledWith(ctx.createMediaStreamDestination.mock.results[0].value);
            
            // Verify that cleanup happens before re-initialization
            await processor.process(mockStream);
            expect(ctx.close).toHaveBeenCalled();
        });

        it('should cleanup resources and denoiseState on destroy', async () => {
            const processor = new NoiseSuppressionProcessor();
            const mockStream = new MediaStream([]);
            await processor.process(mockStream);
            
            processor.destroy();
            expect(mockDenoiseState.destroy).toHaveBeenCalled();
        });
    });
});
