import { vi } from 'vitest';
export const AudioContextMock = vi.fn();
export const MediaStreamMock = vi.fn();

/**
 * A minimal mock of the Web Audio API for unit testing processors.
 */
export function setupAudioMock() {
    AudioContextMock.mockImplementation(function() {
        return {
            sampleRate: 48000,
            createMediaStreamSource: vi.fn().mockImplementation(() => ({
                connect: vi.fn(),
                disconnect: vi.fn(),
            })),
            createGain: vi.fn().mockImplementation(() => ({
                gain: { value: 1.0 },
                connect: vi.fn(),
                disconnect: vi.fn(),
            })),
            createMediaStreamDestination: vi.fn().mockImplementation(() => ({
                stream: {
                    getAudioTracks: vi.fn().mockReturnValue([{ id: 'mock-track-id', stop: vi.fn() }]),
                },
                connect: vi.fn(),
                disconnect: vi.fn(),
            })),
            createScriptProcessor: vi.fn().mockImplementation((bufferSize: number) => ({
                bufferSize,
                connect: vi.fn(),
                disconnect: vi.fn(),
                onaudioprocess: null,
            })),
            close: vi.fn().mockResolvedValue(undefined),
        };
    });

    vi.stubGlobal('AudioContext', AudioContextMock);
    
    // Mock MediaStream
    MediaStreamMock.mockImplementation(function(tracks: MediaStreamTrack[]) {
        return {
            getAudioTracks: vi.fn().mockReturnValue(tracks || []),
            addTrack: vi.fn(),
            removeTrack: vi.fn(),
        };
    });
    vi.stubGlobal('MediaStream', MediaStreamMock);
}
