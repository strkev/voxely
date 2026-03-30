import * as dotenv from 'dotenv';
dotenv.config();

// Override insecure defaults to pass the "missingOrInsecure" check in index.ts
process.env.JWT_SECRET = 'valid-test-key-not-insecure';
process.env.LIVEKIT_API_KEY = 'valid-test-key';
process.env.LIVEKIT_API_SECRET = 'valid-test-secret';
process.env.ADMIN_SECRET = 'valid-test-admin';
process.env.PRISMA_FIELD_ENCRYPTION_KEY = process.env.PRISMA_FIELD_ENCRYPTION_KEY || 'k1.aesgcm256.oA8vS0KmVY7C6XhWlRz3bNqGjYpTxEfDwVuI9Zc1m2o=';
