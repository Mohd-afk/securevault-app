// ── HIBP k-Anonymity Cache Service ───────────────────────────────────
//
// Implements privacy-preserving HaveIBeenPwned checks with:
//   • IndexedDB caching of prefix→suffixes map (24h TTL)
//   • AbortController per-request timeout (3000ms)
//   • 350ms inter-request rate limiting (HIBP's own guideline)
//   • 1 retry with 500ms backoff on transient network errors
//   • Graceful offline fallback (returns null, not false)
//
// SECURITY: Only the first 5 hex chars of SHA-1(password) leave the device.
// ─────────────────────────────────────────────────────────────────────

import { idbGet, idbSet } from '../idb';
import { createLogger } from '../utils/logger';

const log = createLogger('HIBP');

// ── Constants ─────────────────────────────────────────────────────────
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;  // 24 hours
const REQUEST_TIMEOUT_MS = 3000;            // 3 second per-request timeout
const RATE_LIMIT_MS = 350;                  // HIBP recommended minimum gap
const RETRY_DELAY_MS = 500;                 // backoff before single retry
const CACHE_KEY_PREFIX = 'hibp_prefix_';   // IndexedDB key namespace

interface CacheEntry {
  suffixes: string[];    // uppercase suffix strings from HIBP response
  cachedAt: number;      // Date.now() when entry was stored
}

// ── SHA-1 (client-side, SubtleCrypto) ────────────────────────────────

/**
 * Compute SHA-1 of a UTF-8 string and return the result as an uppercase hex string.
 * This runs entirely in the browser — nothing is sent to any server here.
 */
export async function sha1Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

// ── Rate limiter state ────────────────────────────────────────────────
let _lastRequestAt = 0;

async function enforceRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - _lastRequestAt;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - elapsed));
  }
  _lastRequestAt = Date.now();
}

// ── Network fetch with timeout + retry ───────────────────────────────

async function fetchWithTimeout(url: string): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'Add-Padding': 'true' },
      });
      clearTimeout(timer);

      if (!response.ok) {
        log.warn(`HIBP API returned ${response.status} for prefix`);
        return null;
      }
      return await response.text();
    } catch (err: any) {
      clearTimeout(timer);
      if (err?.name === 'AbortError') {
        log.warn(`HIBP request timed out after ${REQUEST_TIMEOUT_MS}ms (attempt ${attempt + 1})`);
      } else {
        log.warn(`HIBP network error (attempt ${attempt + 1})`, err);
      }

      if (attempt < 1) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }
  return null; // Both attempts failed
}

// ── Cache read/write ─────────────────────────────────────────────────

async function getCachedSuffixes(prefix: string): Promise<string[] | null> {
  try {
    const entry = await idbGet<CacheEntry>(CACHE_KEY_PREFIX + prefix);
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
      log.debug('HIBP cache expired for prefix', { prefix });
      return null;
    }
    log.debug('HIBP cache hit', { prefix, suffixCount: entry.suffixes.length });
    return entry.suffixes;
  } catch (e) {
    log.warn('HIBP cache read error', e);
    return null;
  }
}

async function cacheSuffixes(prefix: string, suffixes: string[]): Promise<void> {
  try {
    const entry: CacheEntry = { suffixes, cachedAt: Date.now() };
    await idbSet(CACHE_KEY_PREFIX + prefix, entry);
    log.debug('HIBP suffixes cached', { prefix, suffixCount: suffixes.length });
  } catch (e) {
    log.warn('HIBP cache write error (non-fatal)', e);
  }
}

// ── Core check ───────────────────────────────────────────────────────

/**
 * Check whether a password appears in the HIBP breach database.
 *
 * Returns:
 *   `true`  — password is compromised
 *   `false` — password is clean
 *   `null`  — check could not be completed (offline / timeout)
 *
 * Privacy guarantee: only `sha1(password).slice(0, 5)` leaves the device.
 */
export async function checkPasswordPwned(password: string): Promise<boolean | null> {
  const hash = await sha1Hex(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  // 1. Cache lookup — skip network entirely if fresh
  const cached = await getCachedSuffixes(prefix);
  if (cached !== null) {
    return cached.includes(suffix);
  }

  // 2. Rate limit before going to the network
  await enforceRateLimit();

  // 3. Fetch from HIBP with timeout + retry
  const text = await fetchWithTimeout(
    `https://api.pwnedpasswords.com/range/${prefix}`,
  );

  if (text === null) {
    // Network unavailable / timeout — fail open (don't block UI)
    return null;
  }

  // 4. Parse response lines: "SUFFIX:COUNT\r\n"
  const suffixes = text
    .split('\n')
    .map((line) => line.split(':')[0].trim().toUpperCase())
    .filter(Boolean);

  // 5. Cache the result
  await cacheSuffixes(prefix, suffixes);

  // 6. Local match
  return suffixes.includes(suffix);
}

// ── Batch check with progress ────────────────────────────────────────

export interface HibpBatchResult {
  compromised: string[];     // item IDs
  unavailable: string[];     // item IDs where check couldn't complete
  checked: number;
  total: number;
}

export interface HibpBatchItem {
  id: string;
  password: string;
}

/**
 * Check a batch of passwords, calling `onProgress` after each.
 */
export async function checkBatch(
  items: HibpBatchItem[],
  onProgress: (checked: number, total: number, currentTitle?: string) => void,
): Promise<HibpBatchResult> {
  const compromised: string[] = [];
  const unavailable: string[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    onProgress(i, items.length);

    const result = await checkPasswordPwned(item.password);
    if (result === true) compromised.push(item.id);
    if (result === null) unavailable.push(item.id);
  }

  onProgress(items.length, items.length);
  return { compromised, unavailable, checked: items.length, total: items.length };
}
