# Extreme Security Hardening — Implementation Plan

Upgrade SecureVault from "Industry Standard" to "Extreme Hardening" level security by implementing four enhancements: Argon2id key derivation, strict CSP, IndexedDB local storage, and secret scrubbing.

## User Review Required

> [!IMPORTANT]
> **Breaking change for existing vaults:** Switching from PBKDF2 to Argon2id changes the derived keys. Existing users' encrypted vaults will no longer decrypt with the new algorithm. The plan below includes a **migration strategy** where we store a `kdfVersion` marker alongside the vault cipher. On unlock, we detect PBKDF2 vaults, decrypt with the old algorithm, then re-encrypt with Argon2id. **First unlock after the upgrade will be slightly slower** as it runs both algorithms.

> [!WARNING]
> **Bundle size increase:** The `hash-wasm` library adds ~50 KB gzipped to the bundle. This is the lightest Argon2id option for browsers (uses WASM, no heavy JS fallback). Alternatively, we could use `argon2-browser` (~80 KB) or keep PBKDF2. Please confirm you want to proceed with `hash-wasm`.

---

## Proposed Changes

### 1. Argon2id Key Derivation

#### [NEW] [secureMemory.ts](file:///d:/PYTHON/Password%20Manager/src/app/secureMemory.ts)
A utility module for handling sensitive data as `Uint8Array` buffers with explicit zeroing. This combines the secret scrubbing logic (Enhancement #4) with password-to-bytes conversion used by the new Argon2id flow.

Key exports:
- `passwordToBytes(password: string): Uint8Array` — Converts string to UTF-8 bytes in a `Uint8Array`
- `scrub(buffer: Uint8Array): void` — Fills buffer with zeros immediately
- `withScrubbing<T>(buffer: Uint8Array, fn: (buf: Uint8Array) => Promise<T>): Promise<T>` — Runs a function with the buffer, then scrubs it in a `finally` block

#### [MODIFY] [crypto.ts](file:///d:/PYTHON/Password%20Manager/src/app/crypto.ts)

**Changes:**
1. Add `import { argon2id } from 'hash-wasm'`
2. Add `import { passwordToBytes, withScrubbing } from './secureMemory'`
3. Add constants for Argon2id parameters:
   ```ts
   const ARGON2_MEMORY = 65536;  // 64 MB
   const ARGON2_ITERATIONS = 3;
   const ARGON2_PARALLELISM = 1;
   const ARGON2_HASH_LENGTH = 32; // 256-bit
   ```
4. Add a new `deriveKeyArgon2id(password, salt)` async function that:
   - Converts password to `Uint8Array` via `passwordToBytes()`
   - Calls `argon2id()` from hash-wasm with the parameters above
   - Returns the raw 32-byte hash as `Uint8Array`
   - Scrubs the password bytes in a `finally` block
5. Refactor [deriveAuthKey()](file:///d:/PYTHON/Password%20Manager/src/app/crypto.ts#55-77):
   - Use `deriveKeyArgon2id()` for the new path
   - Wrap password bytes with `withScrubbing()`
   - Return base64 of the Argon2id hash
6. Refactor [deriveEncryptionKey()](file:///d:/PYTHON/Password%20Manager/src/app/crypto.ts#78-102):
   - Use `deriveKeyArgon2id()` to get raw key bytes
   - Import them as an AES-GCM CryptoKey via `crypto.subtle.importKey('raw', ...)`
   - Scrub the raw key bytes after import
7. **Keep the old PBKDF2 functions** as `deriveAuthKeyPBKDF2()` and `deriveEncryptionKeyPBKDF2()` (renamed from the current names), so the migration path in [store.ts](file:///d:/PYTHON/Password%20Manager/src/app/store.ts) can call them for legacy vaults.

#### [MODIFY] [store.ts](file:///d:/PYTHON/Password%20Manager/src/app/store.ts)

**Migration logic in [unlockVault()](file:///d:/PYTHON/Password%20Manager/src/app/store.ts#318-389):**
1. When loading vault data (from cloud or local), check for a `kdfVersion` field on the stored payload
2. If `kdfVersion` is missing or `"pbkdf2"`: decrypt with the old PBKDF2 functions, then re-encrypt with Argon2id and save back with `kdfVersion: "argon2id"`
3. If `kdfVersion` is `"argon2id"`: decrypt with the new Argon2id functions directly
4. All new writes use Argon2id and stamp `kdfVersion: "argon2id"`

**Secret scrubbing integration:**
- In [setSessionPassword()](file:///d:/PYTHON/Password%20Manager/src/app/store.ts#61-65), [clearSession()](file:///d:/PYTHON/Password%20Manager/src/app/store.ts#66-77), and [getAndClearPendingAutoUnlockPassword()](file:///d:/PYTHON/Password%20Manager/src/app/store.ts#96-101) — convert password storage to use scrubbing where feasible. (Note: JS strings are immutable and GC-managed, so we scrub the `Uint8Array` representation used during key derivation. The `_sessionPassword` string itself is unavoidable in JS, but we null it as early as possible.)

#### [MODIFY] [firestore.ts](file:///d:/PYTHON/Password%20Manager/src/app/firestore.ts)
- Update `saveVaultToCloud()` to include `kdfVersion: "argon2id"` in the Firestore document
- Update `loadVaultFromCloud()` return type to include `kdfVersion?: string`

---

### 2. Strict Content Security Policy (CSP)

#### [MODIFY] [index.html](file:///d:/PYTHON/Password%20Manager/index.html)

Add a `<meta>` CSP tag inside `<head>`:
```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval';
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data: blob:;
  connect-src 'self'
    https://*.googleapis.com
    https://*.firebaseio.com
    https://*.firebaseapp.com
    https://*.cloudfunctions.net
    wss://*.firebaseio.com;
  frame-src 'self'
    https://*.firebaseapp.com;
  object-src 'none';
  base-uri 'self';
">
```

**Key decisions:**
- `'wasm-unsafe-eval'` is needed because `hash-wasm` loads Argon2id as a WASM module
- `'unsafe-inline'` on `style-src` is required because MUI/Emotion inject inline styles at runtime
- `frame-src` allows Firebase Auth popup/redirect iframe
- `connect-src` allows Firebase Auth, Firestore, and Cloud Functions APIs
- `object-src 'none'` blocks Flash/Java plugins
- No `script-src 'unsafe-inline'` — Vite injects modules via `<script type="module">`, which is covered by `'self'`

---

### 3. IndexedDB Local Storage

#### [NEW] [idb.ts](file:///d:/PYTHON/Password%20Manager/src/app/idb.ts)

A thin, promise-based IndexedDB wrapper (no external library). ~60 lines.

```ts
const DB_NAME = 'SecureVaultDB';
const DB_VERSION = 1;
const STORE_NAME = 'keyval';

function openDB(): Promise<IDBDatabase> { ... }
export async function idbGet<T>(key: string): Promise<T | null> { ... }
export async function idbSet(key: string, value: unknown): Promise<void> { ... }
export async function idbDelete(key: string): Promise<void> { ... }
```

#### [MODIFY] [store.ts](file:///d:/PYTHON/Password%20Manager/src/app/store.ts)

Replace all `localStorage.getItem(VAULT_KEY)` / `localStorage.setItem(VAULT_KEY, ...)` with `idbGet(VAULT_KEY)` / `idbSet(VAULT_KEY, ...)`. Same for `SETTINGS_KEY`.

Since IndexedDB is async, some currently-synchronous functions become async:
- [getSettings()](file:///d:/PYTHON/Password%20Manager/src/app/store.ts#623-632) → `async getSettings()` (returns `Promise<AppSettings>`)
- [saveSettings()](file:///d:/PYTHON/Password%20Manager/src/app/store.ts#651-663) → `async saveSettings()` 
- [clearLocalVaultData()](file:///d:/PYTHON/Password%20Manager/src/app/store.ts#78-87) → `async clearLocalVaultData()`

All callers of these functions are already in async contexts or fire-and-forget, so this is safe.

> [!NOTE]
> The 3 `localStorage` calls in [auth.ts](file:///d:/PYTHON/Password%20Manager/src/app/auth.ts) for `emailForSignIn` will **not** be migrated. They store a single transient email string used to complete the magic-link flow, and IndexedDB would add unnecessary complexity for this tiny piece of data. Firebase Auth itself uses `localStorage` internally for session persistence.

---

### 4. Secret Scrubbing

This is already covered in the [secureMemory.ts](file:///d:/PYTHON/Password%20Manager/src/app/secureMemory.ts) new file above. The key integration points are:

1. **[crypto.ts](file:///d:/PYTHON/Password%20Manager/src/app/crypto.ts)** — `deriveKeyArgon2id()` converts the password string to a `Uint8Array` and scrubs it in a `finally` block after Argon2id completes
2. **[crypto.ts](file:///d:/PYTHON/Password%20Manager/src/app/crypto.ts)** — [deriveEncryptionKey()](file:///d:/PYTHON/Password%20Manager/src/app/crypto.ts#78-102) scrubs the raw 32-byte key material after importing it as a `CryptoKey`
3. **[store.ts](file:///d:/PYTHON/Password%20Manager/src/app/store.ts)** — [clearSession()](file:///d:/PYTHON/Password%20Manager/src/app/store.ts#66-77) nulls `_sessionPassword` and `_pendingAutoUnlockPassword`

> [!NOTE]
> JavaScript strings are immutable GC-managed objects — we **cannot** overwrite their contents in memory. The scrubbing we add targets the `Uint8Array` byte buffers we create from the password during key derivation, which is where the actual cryptographic work happens. The `_sessionPassword` string is set to `null` on lock/sign-out, making it eligible for GC immediately.

---

## Verification Plan

### Build Verification
1. Run `npm run build` — confirm zero errors and successful production build
2. Run `npm run dev` — confirm dev server starts without CSP violations in the browser console

### Manual Integration Testing (User)
Since this is a security-sensitive password manager with Firebase integration, end-to-end testing requires a real browser session:

1. **Fresh vault creation:**
   - Sign in → Create new master password → Verify vault unlocks → Add a test item → Lock → Unlock again
   - Confirm no console errors and no CSP violations in DevTools
2. **Existing vault migration (PBKDF2 → Argon2id):**
   - Use existing account with vault data → Unlock → Confirm data is intact → Lock → Unlock again (should now be Argon2id)
3. **IndexedDB storage:**
   - Open DevTools → Application → IndexedDB → Confirm `SecureVaultDB` database exists with vault data
   - Confirm localStorage no longer has `securevault_items` or `securevault_settings`
4. **CSP enforcement:**
   - Open DevTools → Console → Look for any `Refused to...` CSP error messages
   - Confirm Firebase Auth popup still works for Google sign-in
5. **Secret scrubbing:**
   - Not directly observable in browser, but we can add a debug log confirming the scrub occurred
