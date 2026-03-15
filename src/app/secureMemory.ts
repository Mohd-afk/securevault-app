// ─── SecureVault Secure Memory Module ────────────────────────────────
// Provides Uint8Array-based password handling with explicit zeroing
// to minimize plaintext password exposure in RAM.
// ─────────────────────────────────────────────────────────────────────

import { createLogger } from './utils/logger';

const log = createLogger('CRYPTO');

/**
 * Convert a string password to a Uint8Array of UTF-8 bytes.
 * The caller is responsible for scrubbing the returned buffer when done.
 */
export function passwordToBytes(password: string): Uint8Array {
  return new TextEncoder().encode(password);
}

/**
 * Immediately overwrite every byte of the buffer with zeros.
 * This is the closest JS can get to "wiping memory" — it doesn't
 * guarantee the GC hasn't already copied the data, but it removes
 * the most accessible copy.
 */
export function scrub(buffer: Uint8Array): void {
  buffer.fill(0);
  log.debug('Secret buffer scrubbed', { length: buffer.length });
}

/**
 * Run an async function with a sensitive buffer, then scrub
 * the buffer regardless of success or failure.
 */
export async function withScrubbing<T>(
  buffer: Uint8Array,
  fn: (buf: Uint8Array) => Promise<T>,
): Promise<T> {
  try {
    return await fn(buffer);
  } finally {
    scrub(buffer);
  }
}
