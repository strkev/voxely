import '@testing-library/jest-dom';
import { webcrypto } from 'node:crypto';

// Polyfill Web Crypto for Node environment
if (typeof global.crypto === 'undefined' || !global.crypto.subtle) {
    // @ts-expect-error - polyfilling global crypto
    global.crypto = webcrypto;
}
