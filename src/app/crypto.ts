// ─── SecureVault Crypto Module ───────────────────────────────────────
// Uses Web Crypto API exclusively:
//   • PBKDF2 (SHA-256, 600 000 iterations) for key derivation
//   • AES-GCM (256-bit) for vault encryption/decryption
// ─────────────────────────────────────────────────────────────────────

const PBKDF2_ITERATIONS = 600_000;
const KEY_LENGTH = 256; // bits
const SALT_BYTES = 16;
const IV_BYTES = 12; // AES-GCM recommended IV size

// ── Helpers: encode / decode ──────────────────────────────────────────

function toBase64(buffer: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function fromBase64(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

function toHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

// ── Random value generators ──────────────────────────────────────────

export function generateSalt(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(SALT_BYTES));
}

function generateIV(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(IV_BYTES));
}

// ── Key derivation ───────────────────────────────────────────────────

async function getKeyMaterial(password: string): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    return crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey'],
    );
}

export async function deriveKey(
    password: string,
    salt: Uint8Array,
): Promise<CryptoKey> {
    const keyMaterial = await getKeyMaterial(password);
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt.buffer.slice(0) as ArrayBuffer,
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: KEY_LENGTH },
        false,
        ['encrypt', 'decrypt'],
    );
}

// ── Password hashing (for verification, NOT encryption) ─────────────

export async function hashPasswordForVerification(
    password: string,
    salt: Uint8Array,
): Promise<string> {
    const keyMaterial = await getKeyMaterial(password);
    const derivedBits = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt: salt.buffer.slice(0) as ArrayBuffer,
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256',
        },
        keyMaterial,
        KEY_LENGTH,
    );
    return toHex(derivedBits);
}

// ── Encryption ───────────────────────────────────────────────────────

export interface EncryptedPayload {
    ciphertext: string; // base64
    salt: string; // base64
    iv: string; // base64
}

export async function encrypt(
    plaintext: string,
    password: string,
): Promise<EncryptedPayload> {
    const salt = generateSalt();
    const iv = generateIV();
    const key = await deriveKey(password, salt);

    const encoder = new TextEncoder();
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv.buffer.slice(0) as ArrayBuffer },
        key,
        encoder.encode(plaintext),
    );

    return {
        ciphertext: toBase64(encrypted),
        salt: toBase64(salt.buffer.slice(0) as ArrayBuffer),
        iv: toBase64(iv.buffer.slice(0) as ArrayBuffer),
    };
}

// ── Decryption ───────────────────────────────────────────────────────

export async function decrypt(
    payload: EncryptedPayload,
    password: string,
): Promise<string> {
    const salt = new Uint8Array(fromBase64(payload.salt));
    const iv = new Uint8Array(fromBase64(payload.iv));
    const ciphertext = fromBase64(payload.ciphertext);

    const key = await deriveKey(password, salt);

    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv.buffer.slice(0) as ArrayBuffer },
        key,
        ciphertext,
    );

    return new TextDecoder().decode(decrypted);
}
