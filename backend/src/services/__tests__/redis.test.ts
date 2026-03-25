import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initRedis, getRedis } from '../redis';
import { createClient } from 'redis';

// Mock the redis package
vi.mock('redis', () => ({
    createClient: vi.fn(),
}));

describe('Redis Service', () => {
    let mockClient: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockClient = {
            on: vi.fn(),
            connect: vi.fn().mockResolvedValue(undefined),
            get: vi.fn(),
            set: vi.fn(),
        };
        (createClient as any).mockReturnValue(mockClient);
    });

    it('should initialize redis correctly on success', async () => {
        const success = await initRedis();
        
        expect(createClient).toHaveBeenCalled();
        expect(mockClient.connect).toHaveBeenCalled();
        expect(success).toBe(true);
        expect(getRedis()).toBe(mockClient);
    });

    it('should handle connection failure gracefully', async () => {
        mockClient.connect.mockRejectedValue(new Error('Connection failed'));
        
        const success = await initRedis();
        
        expect(success).toBe(false);
        expect(getRedis()).toBeNull();
    });

    it('should set an error listener', async () => {
        await initRedis();
        expect(mockClient.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
});
