// ─── SecureVault Crypto Module ───────────────────────────────────────
// Uses Web Crypto API exclusively:
//   • PBKDF2 (SHA-256, 600 000 iterations) for key derivation
//   • AES-GCM (256-bit) for vault encryption/decryption
// ─────────────────────────────────────────────────────────────────────

const PBKDF2_ITERATIONS = 600_000;
const KEY_LENGTH = 256; // bits
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

// ── Key derivation (Bitwarden Method) ────────────────────────────────

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

/**
 * Derives the Authentication Key used to log into Firebase.
 * Salt: email
 */
export async function deriveAuthKey(masterPassword: string, email: string): Promise<string> {
    const keyMaterial = await getKeyMaterial(masterPassword);
    const saltBuffer = new TextEncoder().encode(email.toLowerCase().trim());

    const derivedBits = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt: saltBuffer,
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256',
        },
        keyMaterial,
        KEY_LENGTH,
    );
    return toBase64(derivedBits);
}

/**
 * Derives the Encryption Key used to encrypt/decrypt the vault.
 * Salt: email + "vault"
 */
export async function deriveEncryptionKey(masterPassword: string, email: string): Promise<CryptoKey> {
    const keyMaterial = await getKeyMaterial(masterPassword);
    const saltBuffer = new TextEncoder().encode(email.toLowerCase().trim() + 'vault');

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: saltBuffer,
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: KEY_LENGTH },
        false, // Do not make it extractable
        ['encrypt', 'decrypt'],
    );
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
    const iv = generateIV();
    const encoder = new TextEncoder();
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv.buffer.slice(0) as ArrayBuffer },
        key,
        encoder.encode(plaintext),
    );

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
    const iv = new Uint8Array(fromBase64(payload.iv));
    const ciphertext = fromBase64(payload.ciphertext);

    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv.buffer.slice(0) as ArrayBuffer },
        key,
        ciphertext,
    );

    return new TextDecoder().decode(decrypted);
}
