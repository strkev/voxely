import { createClient, RedisClientType } from 'redis';

let client: RedisClientType | null = null;
let connected = false;

/**
 * Initialise the Redis client.
 * Returns false (with a warning) if Redis is unavailable — the server will
 * still start, but JWT blacklisting and other Redis features are disabled.
 */
export const initRedis = async (): Promise<boolean> => {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    client = createClient({ url }) as RedisClientType;

    client.on('error', (err: Error) => {
        if (connected) console.warn('[Redis] connection error:', err.message);
    });

    try {
        await client.connect();
        connected = true;
        console.log('✅  Redis connected');
        return true;
    } catch (err) {
        console.warn('⚠️  Redis unavailable – JWT blacklisting disabled. Start Redis to enable it.');
        client = null;
        return false;
    }
};

/** Returns the connected Redis client, or null if Redis is unavailable. */
export const getRedis = (): RedisClientType | null => client;
