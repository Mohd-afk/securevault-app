// ─── SecureVault Crypto Module ───────────────────────────────────────
// Uses:
//   • Argon2id (via hash-wasm WASM) for key derivation
//   • AES-GCM (256-bit) for vault encryption/decryption
//   • Explicit Uint8Array scrubbing for sensitive key material
// ─────────────────────────────────────────────────────────────────────

import { argon2id } from 'hash-wasm';
import { passwordToBytes, scrub, withScrubbing } from './secureMemory';
import { createLogger } from './utils/logger';

const log = createLogger('CRYPTO');

// ── Argon2id parameters ──────────────────────────────────────────────
const ARGON2_MEMORY = 65536;       // 64 MB
const ARGON2_ITERATIONS = 3;
const ARGON2_PARALLELISM = 1;
const ARGON2_HASH_LENGTH = 32;     // 256-bit output

const IV_BYTES = 12; // AES-GCM recommended IV size

// ── Helpers: encode / decode ──────────────────────────────────────────

export function toBase64(buffer: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

export function fromBase64(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

export function toHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

// ── Random value generators ──────────────────────────────────────────

export function generateIV(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(IV_BYTES));
}

// ── Core Argon2id derivation ─────────────────────────────────────────

/**
 * Derives raw 32-byte key material using Argon2id.
 * The password Uint8Array is scrubbed automatically after hashing.
 */
async function deriveRawArgon2id(
    passwordBytes: Uint8Array,
    salt: string,
): Promise<Uint8Array> {
    const saltBytes = new TextEncoder().encode(salt);

    log.debug('Starting Argon2id derivation', {
        memory: ARGON2_MEMORY,
        iterations: ARGON2_ITERATIONS,
        parallelism: ARGON2_PARALLELISM,
        saltLength: saltBytes.length,
    });

    const hashHex = await argon2id({
        password: passwordBytes,
        salt: saltBytes,
        parallelism: ARGON2_PARALLELISM,
        iterations: ARGON2_ITERATIONS,
        memorySize: ARGON2_MEMORY,
        hashLength: ARGON2_HASH_LENGTH,
        outputType: 'hex',
    });

    // Convert hex string to Uint8Array
    const hashBytes = new Uint8Array(ARGON2_HASH_LENGTH);
    for (let i = 0; i < ARGON2_HASH_LENGTH; i++) {
        hashBytes[i] = parseInt(hashHex.substring(i * 2, i * 2 + 2), 16);
    }

    log.debug('Argon2id derivation complete');
    return hashBytes;
}

// ── Key derivation (Argon2id) ────────────────────────────────────────

/**
 * Derives the Authentication Key used to log into Firebase.
 * Salt: email
 */
export async function deriveAuthKey(masterPassword: string, email: string): Promise<string> {
    log.debug('Deriving auth key (Argon2id)', { email });
    const pwdBytes = passwordToBytes(masterPassword);
    const salt = email.toLowerCase().trim();

    return withScrubbing(pwdBytes, async (buf) => {
        const hashBytes = await deriveRawArgon2id(buf, salt);
        const b64 = toBase64(hashBytes.buffer.slice(0) as ArrayBuffer);
        scrub(hashBytes);
        log.debug('Auth key derived successfully (Argon2id)');
        return b64;
    });
}

/**
 * Derives the Encryption Key used to encrypt/decrypt the vault.
 * Salt: email + "vault"
 */
export async function deriveEncryptionKey(masterPassword: string, email: string): Promise<CryptoKey> {
    log.debug('Deriving encryption key (Argon2id)', { email });
    const pwdBytes = passwordToBytes(masterPassword);
    const salt = email.toLowerCase().trim() + 'vault';

    return withScrubbing(pwdBytes, async (buf) => {
        const rawKey = await deriveRawArgon2id(buf, salt);

        // Import the raw bytes as an AES-GCM CryptoKey
        const key = await crypto.subtle.importKey(
            'raw',
            rawKey.buffer.slice(0) as ArrayBuffer,
            { name: 'AES-GCM', length: 256 },
            false, // not extractable
            ['encrypt', 'decrypt'],
        );

        // Scrub the raw key material now that it's locked inside the CryptoKey
        scrub(rawKey);
        log.debug('Encryption key derived successfully (Argon2id)');
        return key;
    });
}

/**
 * Drives the Argon2id key derivation and extracts the RAW DEK bytes as Base64.
 * Used ONLY once during Biometric Enable to pass to the native KeyStore wrapper.
 */
export async function exportDEK(masterPassword: string, email: string): Promise<string> {
    log.debug('Exporting raw DEK for biometric wrap', { email });
    const pwdBytes = passwordToBytes(masterPassword);
    const salt = email.toLowerCase().trim() + 'vault';

    return withScrubbing(pwdBytes, async (buf) => {
        const rawKey = await deriveRawArgon2id(buf, salt);
        const b64 = toBase64(rawKey.buffer.slice(0) as ArrayBuffer);
        
        scrub(rawKey);
        log.debug('DEK exported successfully');
        return b64;
    });
}

/**
 * Imports a Base64 RAW DEK (unwrapped from Biometrics) back into an ephemeral CryptoKey.
 */
export async function importDEK(dekBase64: string): Promise<CryptoKey> {
    log.debug('Importing unwrapped DEK into CryptoKey');
    const rawKey = new Uint8Array(fromBase64(dekBase64));

    const key = await crypto.subtle.importKey(
        'raw',
        rawKey.buffer.slice(0) as ArrayBuffer,
        { name: 'AES-GCM', length: 256 },
        false, // not extractable
        ['encrypt', 'decrypt'],
    );
    
    scrub(rawKey);
    log.debug('DEK imported successfully');
    return key;
}

// ── Encryption ───────────────────────────────────────────────────────

export interface EncryptedPayload {
    ciphertext: string; // base64
    iv: string; // base64
}

export async function encryptWithKey(
    plaintext: string,
    key: CryptoKey,
): Promise<EncryptedPayload> {
    log.debug('Encrypting data', { plaintextLength: plaintext.length });
    const iv = generateIV();
    const encoder = new TextEncoder();
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv.buffer.slice(0) as ArrayBuffer },
        key,
        encoder.encode(plaintext),
    );

    log.debug('Encryption successful', { ciphertextLength: encrypted.byteLength });
    return {
        ciphertext: toBase64(encrypted),
        iv: toBase64(iv.buffer.slice(0) as ArrayBuffer),
    };
}

// ── Decryption ───────────────────────────────────────────────────────

export async function decryptWithKey(
    payload: EncryptedPayload,
    key: CryptoKey,
): Promise<string> {
    log.debug('Decrypting data', { ciphertextLength: payload.ciphertext.length });
    const iv = new Uint8Array(fromBase64(payload.iv));
    const ciphertext = fromBase64(payload.ciphertext);

    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv.buffer.slice(0) as ArrayBuffer },
        key,
        ciphertext,
    );

    const plaintext = new TextDecoder().decode(decrypted);
    log.debug('Decryption successful', { plaintextLength: plaintext.length });
    return plaintext;
}
