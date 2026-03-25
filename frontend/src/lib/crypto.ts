/**
 * Standalone E2EE cryptographic utility using Web Crypto API.
 * These functions handle key generation, derivation, encryption, and decryption.
 */

// ── Protocol constants ───────────────────────────────────────────────────────
export const KEY_ANNOUNCE    = 0x10; // Broadcast own ECDH public key
export const KEY_REPLY       = 0x11; // Reply with own public key to a specific peer
export const GROUP_KEY_SHARE = 0x12; // Send group chat key encrypted for a specific peer

// ── ECDH / crypto helpers ────────────────────────────────────────────────────

/** Generate an ephemeral ECDH-P256 key pair */
export async function generateECDHKeyPair(): Promise<CryptoKeyPair> {
    return crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        false, // non-extractable private key
        ['deriveBits'],
    );
}

/** Export a public key to raw bytes (65 bytes uncompressed P-256) */
export async function exportPublicKey(key: CryptoKey): Promise<Uint8Array> {
    const raw = await crypto.subtle.exportKey('raw', key);
    return new Uint8Array(raw as ArrayBuffer);
}

/** Import a raw public key */
export async function importPublicKey(raw: Uint8Array): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        'raw',
        raw.buffer as ArrayBuffer,
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        [],
    );
}

/** Derive a 256-bit AES-GCM key from ECDH shared bits using HKDF */
export async function deriveSharedKey(
    privateKey: CryptoKey,
    peerPublicKey: CryptoKey,
    salt: Uint8Array,
): Promise<CryptoKey> {
    const sharedBits = await crypto.subtle.deriveBits(
        { name: 'ECDH', public: peerPublicKey },
        privateKey,
        256,
    );
    // Import shared bits as HKDF key material
    const hkdfKey = await crypto.subtle.importKey(
        'raw',
        sharedBits,
        { name: 'HKDF' },
        false,
        ['deriveKey'],
    );
    // Derive final AES-GCM-256 key via HKDF
    return crypto.subtle.deriveKey(
        {
            name: 'HKDF',
            salt: salt.buffer as ArrayBuffer,
            info: new TextEncoder().encode('e2ee-v1'),
            hash: 'SHA-256',
        },
        hkdfKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    );
}

/** Generate a random AES-GCM-256 key for group chat encryption */
export async function generateGroupKey(): Promise<CryptoKey> {
    return crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true, // extractable so we can share it
        ['encrypt', 'decrypt'],
    );
}

/** Export an AES key to raw bytes */
export async function exportAESKey(key: CryptoKey): Promise<Uint8Array> {
    const raw = await crypto.subtle.exportKey('raw', key);
    return new Uint8Array(raw as ArrayBuffer);
}

/** Import raw bytes as an AES-GCM key */
export async function importAESKey(raw: Uint8Array): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        'raw',
        raw.buffer as ArrayBuffer,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt'],
    );
}

/** Encrypt data with AES-GCM */
export async function aesEncrypt(
    data: Uint8Array,
    key: CryptoKey,
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
        key,
        data.buffer as ArrayBuffer,
    );
    return { ciphertext: new Uint8Array(encrypted as ArrayBuffer), iv };
}

/** Decrypt data with AES-GCM */
export async function aesDecrypt(
    ciphertext: Uint8Array,
    key: CryptoKey,
    iv: Uint8Array,
): Promise<Uint8Array> {
    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
        key,
        ciphertext.buffer as ArrayBuffer,
    );
    return new Uint8Array(decrypted as ArrayBuffer);
}

// ── Encoding helpers ─────────────────────────────────────────────────────────

export function encodeUint16(value: number): Uint8Array {
    const buf = new ArrayBuffer(2);
    new DataView(buf).setUint16(0, value, false);
    return new Uint8Array(buf);
}

export function decodeUint16(data: Uint8Array, offset: number): number {
    return new DataView(data.buffer, data.byteOffset + offset, 2).getUint16(0, false);
}

// ── Build protocol messages ──────────────────────────────────────────────────

/** KEY_ANNOUNCE: type(1) + senderIdLen(2) + senderId(var) + pubKey(65) + salt(32) */
export function buildKeyAnnounce(senderId: string, pubKey: Uint8Array, salt: Uint8Array): Uint8Array {
    const encoder = new TextEncoder();
    const senderBytes = encoder.encode(senderId);
    const msg = new Uint8Array(1 + 2 + senderBytes.length + 65 + 32);
    let offset = 0;
    msg[offset++] = KEY_ANNOUNCE;
    msg.set(encodeUint16(senderBytes.length), offset); offset += 2;
    msg.set(senderBytes, offset); offset += senderBytes.length;
    msg.set(pubKey, offset); offset += 65;
    msg.set(salt, offset);
    return msg;
}

/** KEY_REPLY: type(1) + senderIdLen(2) + senderId(var) + pubKey(65) + salt(32) */
export function buildKeyReply(senderId: string, pubKey: Uint8Array, salt: Uint8Array): Uint8Array {
    const encoder = new TextEncoder();
    const senderBytes = encoder.encode(senderId);
    const msg = new Uint8Array(1 + 2 + senderBytes.length + 65 + 32);
    let offset = 0;
    msg[offset++] = KEY_REPLY;
    msg.set(encodeUint16(senderBytes.length), offset); offset += 2;
    msg.set(senderBytes, offset); offset += senderBytes.length;
    msg.set(pubKey, offset); offset += 65;
    msg.set(salt, offset);
    return msg;
}

/** GROUP_KEY_SHARE: type(1) + iv(12) + encryptedGroupKey(var) */
export function buildGroupKeyShare(iv: Uint8Array, encryptedKey: Uint8Array): Uint8Array {
    const msg = new Uint8Array(1 + 12 + encryptedKey.length);
    msg[0] = GROUP_KEY_SHARE;
    msg.set(iv, 1);
    msg.set(encryptedKey, 13);
    return msg;
}
