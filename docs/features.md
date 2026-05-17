# Keeguard — Feature & Architecture Documentation

> **Branding alias:** This app was previously called **SecureVault** and is now called **Keeguard**. `Keeguard` = `SecureVault` — they are the **same app**, just old vs. new name. Internal identifiers (package `com.mohdj.securevault`, storage keys `securevault_*`) keep the old name intentionally to protect existing user data.

> **Last Updated:** 2026-03-25  
> **Current Version:** 1.0.4  
> **Repository:** Mohd-afk/securevault-app  
> **Stack:** React 18 · Vite · Capacitor (Android) · Firebase (Auth, Firestore) · Kotlin (Native)

This document is the **single source of truth** for every feature, technical decision, and architectural evolution in the Keeguard project. It should be updated whenever new features are introduced or existing ones are modified.


---

## Table of Contents

1. [User Features](#1-user-features)
2. [Developer / System Features](#2-developer--system-features)
3. [Technical & Architectural Evolution](#3-technical--architectural-evolution)
4. [Maintenance Guide](#4-maintenance-guide)

---

## 1. User Features

### 1.1 Master Password & Vault Setup

**Description:** On first login, users create a master password that encrypts their entire vault. The password undergoes strength validation (minimum length, complexity) before acceptance. A `PasswordStrengthIndicator` provides real-time visual feedback.

- **Introduced:** `5f320fd7` — Phase 1 Complete (2026-03-06)
- **Key Files:** `LockScreen.tsx`, `store.ts` (`setupInitialVault`, `verifyMasterPassword`)
- **Later Changes:**
  - Password strength enforcement added (`utils/password.tsx`)
  - Auto-unlock after magic link sign-in (`getAndClearPendingAutoUnlockPassword`) — `ff5a0549`
  - Re-authentication required before sensitive operations (Firebase `auth/requires-recent-login` handling)

---

### 1.2 Authentication (Email + Google Sign-In)

**Description:** Users can register and log in via two methods:
1. **Passwordless Email (Magic Link):** A verification link is sent to the user's email. After clicking, the app completes sign-in and links a derived auth key to Firebase Auth.
2. **Google Sign-In:** One-click sign-in via Google popup. Creates account if none exists.

On returning visits, users sign in using their email + master password (derived auth key).

- **Introduced:** `5f320fd7` — Phase 1 Complete (2026-03-06)
- **Key Files:** `auth.ts`, `AuthScreen.tsx`
- **Later Changes:**
  - Magic link mode parameter (`signup` vs `reset`) — `ceba7951`
  - Email enumeration protection using SHA-256 hashed email lookups in Firestore — `ceba7951`
  - Firebase `auth/quota-exceeded` graceful handling — `41b384c1`
  - `fetchSignInMethodsForEmail` replaced with Firestore hash-based lookup — conversation `3f1ccb19`
  - Google sign-in error fixes — `f9970ec6`
  - Re-implemented Google Sign-In using native `@capacitor-firebase/authentication` to bypass Android WebView restrictions — conversation `48f94ba8`

---

### 1.3 Password Vault (CRUD)

**Description:** The core feature. Users can create, read, update, and delete password entries. Each entry contains:
- Title, Username, Password, URL, Type, Notes
- Item types: `Website`, `App`, `Phone`, `Door Lock`, `Card`, `Other`
- Timestamps: `createdAt`, `updatedAt`, `deletedAt`

- **Introduced:** `5f320fd7` — Phase 1 Complete (2026-03-06)
- **Key Files:** `store.ts`, `PasswordList.tsx`, `AddEditForm.tsx`, `ItemDetail.tsx`
- **Later Changes:**
  - `deletedAt` soft-delete field added for trash bin — `4fba41d3`
  - Bulk add support for CSV import — `4fba41d3`
  - Fixed mobile UI system bars overlap (battery/status) by enabling `viewport-fit=cover` — conversation `f46bb8cb`
  - Hardened vault decryption reliability by forcing server-side fetch (`getDocFromServer`), bypassing stale offline caches that threw `WRONG_PASSWORD` errors on slow networks — conversation `f46bb8cb`
  - Optimized vault loading performance with direct Firestore server-side queries.

---

### 1.4 Trash Bin

**Description:** Deleted passwords are soft-deleted (marked with `deletedAt`) and moved to a Trash Bin accessible from Settings. Users can:
- View all deleted items
- Restore individual items to the vault
- Permanently delete individual items
- Items older than **30 days** are automatically purged on vault unlock

- **Introduced:** `4fba41d3` — feat: implement trash bin, export, and UI fixes (2026-03-13)
- **Key Files:** `TrashBin.tsx`, `store.ts` (`deleteVaultItem`, `restoreVaultItem`, `permanentlyDeleteVaultItem`, `purgeExpiredTrashItems`)
- **Later Changes:**
  - Moved from main vault view to Settings page — conversation `d6e0d263`
  - Route updated to `/trash` — `routes.ts`
  - `PasswordList.tsx` now filters out items with `deletedAt`

---

### 1.5 CSV Import

**Description:** Users can import passwords from CSV files exported from other password managers (Chrome, Bitwarden, LastPass, etc.). The importer:
- Auto-detects column mappings (name/title/site, url/website, username/email, password)
- Shows a preview of detected entries before importing
- Supports quoted fields and multiple CSV formats

- **Introduced:** `4fba41d3` — feat: implement trash bin, export, and UI fixes (2026-03-13)
- **Key Files:** `Settings.tsx` (CSV parsing logic), `store.ts` (`bulkAddVaultItems`)
- **Later Changes:**
  - Duplicate detection with domain normalization and strategy selection (Skip / Overwrite / Keep both) — conversation `ac31091c`
  - Post-import report with summary — conversation `ac31091c`

---

### 1.6 CSV Export

**Description:** Users can export all active (non-deleted) vault items as a CSV file. The export includes title, username, password, URL, type, and notes. A security warning is displayed after export.

- **Introduced:** `4fba41d3` — feat: implement trash bin, export, and UI fixes (2026-03-13)
- **Key Files:** `store.ts` (`exportVaultItemsAsCsv`), `Settings.tsx`

---

### 1.7 Change Master Password

**Description:** Users can change their master password from Settings. The flow:
1. Enter current password (re-authenticates via Firebase)
2. Enter and confirm new password (strength-validated)
3. Vault data is re-encrypted with the new key
4. Firebase Auth password is updated to the new derived auth key
5. User is signed out and must log in again

Includes a "Forgot Password" option that sends a password reset magic link.

- **Introduced:** `4707efbb` — phase 2 half completed (2026-03-06)
- **Key Files:** `store.ts` (`changeMasterPassword`), `Settings.tsx`
- **Later Changes:**
  - Dual key derivation (separate auth key vs encryption key) — `652f24b0`
  - Re-authentication flow improved with error handling — `ff5a0549`
  - Fixed bug where `changeMasterPassword` incorrectly reused old `_sessionCryptoKey` from biometric unlock

---

### 1.8 Auto-Lock

**Description:** Configurable auto-lock with the following settings:
- **Inactivity timeout:** 1 min, 2 min, 5 min (default), 15 min, 30 min, or Never
- **Lock on screen hide:** Locks the vault when the user switches tabs or backgrounds the app

- **Introduced:** `4707efbb` — phase 2 half completed (2026-03-06)
- **Key Files:** `store.ts` (`AppSettings`), `Settings.tsx`, `AppShell.tsx`

---

### 1.9 Block Screenshots

**Description:** Toggle to prevent screenshots and screen recording. This setting is stored in app settings and synced to cloud. Enforcement requires the Android native wrapper (uses `FLAG_SECURE`).

- **Introduced:** conversation `5c85fb1d` (2026-03-11)
- **Key Files:** `store.ts` (`AppSettings.allowScreenshots`), `Settings.tsx`

---

### 1.10 Active Device Management

**Description:** Users can view all devices where they are logged in. Each device shows:
- Browser name and version
- Operating system
- IP-based geolocation (city, country)
- Last active time (relative)
- "This Device" badge for the current session

Users can:
- **Revoke individual devices** (force logout)
- **Revoke all other devices** simultaneously
- Revocation bumps a `tokenVersion` in Firestore; other sessions detect the version change and auto-logout

- **Introduced:** `652f24b0` — extreme security 1.0 (2026-03-15)
- **Key Files:** `services/deviceSession.ts`, `Settings.tsx`

---

### 1.11 Username System

**Description:** Users can claim a unique username (`@username`). Usernames are:
- 3–20 characters, lowercase, numbers, and underscores only
- Checked for availability in real-time (debounced)
- Stored atomically in Firestore (`usernames/{username}` and `users/{uid}/data/profile`)
- Changeable (old username is released, new one is claimed)

- **Introduced:** `652f24b0` — extreme security 1.0 (2026-03-15)
- **Key Files:** `firestore.ts` (`checkUsernameAvailable`, `claimUsername`, `changeUsername`), `Settings.tsx`

---

### 1.12 Share / Referral

**Description:** Users can share SecureVault and specific password items via the native Share API (on Android devices using Capacitor Share) which opens the system app chooser, falling back to the Web Share API on supported browsers, or copying the text/URL to the clipboard.

- **Introduced:** conversation `5c85fb1d` (2026-03-11)
- **Key Files:** `Settings.tsx` (`handleShareApp`), `ItemDetail.tsx` (`handleShare`)
- **Later Changes:**
  - Integrated `@capacitor/share` to provide a native app chooser share sheet for Android — conversation `f46bb8cb`

---

### 1.13 Delete Account & Data

**Description:** Users can permanently delete all their data (cloud vault, settings, local storage) after confirming with their master password. The entire vault and associated Firestore documents are deleted.

- **Introduced:** conversation `5c85fb1d` (2026-03-11)
- **Key Files:** `store.ts` (`resetVault`), `firestore.ts` (`deleteCloudVault`), `Settings.tsx`

---

### 1.14 Legal Pages

**Description:** Three standalone legal pages accessible without login:
- **Terms & Conditions** (`/terms`)
- **Privacy Policy** (`/privacy`)
- **License Agreement** (`/license`)

Displayed in Settings under a "Legal" section. A consent checkbox was added to the signup flow.

- **Introduced:** conversation `6c127ade` (2026-03-16)
- **Key Files:** `components/legal/TermsPage.tsx`, `PrivacyPage.tsx`, `LicensePage.tsx`, `routes.ts`

---

### 1.15 Android Autofill Service

**Description:** SecureVault acts as an Android Autofill provider, automatically filling username and password fields in other apps and browsers. Features:
- Domain matching to find relevant vault entries
- Unlock prompt if vault is locked during autofill
- Save credentials from other apps back into the vault
- Reverse sync: native-saved credentials are merged into the web vault on unlock

- **Introduced:** `652f24b0` — extreme security 1.0 (2026-03-15)
- **Key Files:** `autofill/SecureVaultAutofillService.kt`, `autofill/AutofillHelper.kt`, `autofill/DomainMatcher.kt`, `autofill/UnlockVaultActivity.kt`, `bridge/VaultBridgePlugin.kt`

---

### 1.16 Password Strength Indicator

**Description:** Real-time visual feedback on password strength during vault setup and master password changes. Validates: minimum length, uppercase, lowercase, numbers, and special characters.

- **Introduced:** `4707efbb` — phase 2 half completed (2026-03-06)
- **Key Files:** `utils/password.tsx`

---

### 1.17 Biometric Unlock

**Description:** Native biometric authentication (Fingerprint/Face Unlock) on Android that allows users to unlock their vault without typing the master password. Features:
- Enabled via Settings (requires confirming Master Password).
- **Auto-Prompt Flow:** The Lock Screen automatically prompts for biometric authentication on mount if enabled.
- **Manual Fallback:** If biometric authentication is cancelled or fails, it falls back to the master password input and displays an "Unlock with Biometrics" button.
- Secure implementation: The master password is never stored. Instead, the Data Encryption Key (DEK) is securely wrapped by the Android Keystore.
- Automatically disables functionality if the device is rooted or if new biometric data (enrollments) are added to the device OS.

- **Introduced:** conversation `5ef446b0` (2026-03-16)
- **Key Files:** `LockScreen.tsx`, `Settings.tsx`, `store.ts`, `BiometricBridgePlugin.kt`
- **Later Changes:**
  - Migrated logic from `AuthScreen.tsx` to `LockScreen.tsx`, introduced auto-prompt, and hardened state management using single source of truth (`isVaultUnlocked()`) — conversation `48f94ba8`

---

### 1.18 In-App Feedback Form

**Description:** Users can submit feedback without leaving the app via a Zite-powered standard embed form (Fillout). The form is accessible from the **Support & Feedback** section in Settings (formerly "Spread the Word"). Contextual data is automatically injected using Zite's `data-zite-*` attributes — no manual input required from the user.

Auto-attached context:
- `userId` — Firebase UID
- `email` — User's email

- **Introduced:** conversation `aec1582a` (2026-03-19)
- **Key Files:** `Settings.tsx`
- **Implementation Note:** The Zite embed script (`v2-zite`) is injected dynamically into the DOM via a React `useEffect` when the modal is opened to safely bypass React's strict script handling. Long or unencoded data strings (like user-agent) were excluded to prevent `500 Internal Server Errors` triggered by the upstream Fillout API. No data is stored in Firebase; Fillout's dashboard stores all submissions.

---

### 1.19 Collapsible Settings Categories

**Description:** All sections within the Settings page are now collapsible with smooth toggle functionality, mirroring the collapsible category design of the vault password list. Each section header is a clickable button featuring a `ChevronUp`/`ChevronDown` icon indicating its state. By default, **Account** and **Security** sections are expanded; all others start collapsed.

Collapsible sections:
- Account (user avatar, sign out, username)
- Security (biometric unlock, master password change)
- Active Devices
- Auto-Lock
- Autofill
- Data (Trash Bin, Import, Export, Delete Account)
- Support & Feedback
- About
- Legal

- **Introduced:** conversation `d6e0d263` (2026-03-20)
- **Key Files:** `Settings.tsx`

---

## 2. Developer / System Features

### 2.1 Structured Logging System

**Purpose:** Namespace-aware, leveled logging for debugging auth, sync, crypto, and UI flows across the application.

- **Implementation:**
  - `createLogger(namespace)` creates a namespaced logger instance
  - Levels: `debug`, `info`, `warn`, `error` with color-coded console output
  - Namespaces: `AUTH` (purple), `STORE` (cyan), `FIRESTORE` (orange), `CRYPTO` (emerald), `UI` (pink), `SYNC` (blue), `SETTINGS` (yellow)
  - Configurable minimum log level via `setLogLevel()`
- **Key Files:** `utils/logger.ts`
- **Related Commits:** Integrated across all modules from `652f24b0` onward

---

### 2.2 Real-Time Cloud Sync

**Purpose:** Vault data synchronizes across devices in real-time using Firestore `onSnapshot` listeners.

- **Implementation:**
  - `subscribeToVault()` listens for remote vault changes
  - Echo-back suppression: ignores snapshots within a 3-second window after local writes
  - Sync-on-change: decrypts incoming data, updates cache, notifies UI listeners
  - Settings also sync to cloud (`saveSettingsToCloud` / `loadSettingsFromCloud`)
- **Key Files:** `store.ts` (`startRealtimeSync`), `firestore.ts` (`subscribeToVault`)
- **Related Commits:** `4707efbb`, `652f24b0`

---

### 2.3 Device Session Tracking & Geolocation

**Purpose:** Track active sessions across devices with IP-based geolocation and new-location alerting.

- **Implementation:**
  - Device ID generated per browser/app (stored in localStorage)
  - Device metadata: browser (via `ua-parser-js`), OS, IP, city, country
  - IP geolocation via `ipapi.co/json/` API
  - `lastActive` heartbeat throttled to one update per 10 minutes
  - New login location detection alerts (compared against existing device locations)
  - Token version-based revocation system (Firestore `users/{uid}/data/tokenVersion`)
- **Key Files:** `services/deviceSession.ts`
- **Related Commits:** `652f24b0`

---

### 2.4 Rate Limiting (Brute-Force Protection)

**Purpose:** Client-side progressive lockouts after failed login attempts.

- **Implementation:**
  - Tiered lockout thresholds: 5 fails → 15s, 10 fails → 1 min, 15 fails → 5 min
  - Hard lockout (5 min) triggered on Firebase backend rate-limiting errors
  - State persisted in `localStorage` per email
  - Cleared on successful login
- **Key Files:** `utils/rateLimit.ts`
- **Related Commits:** `652f24b0`

---

### 2.5 Secure Memory Management

**Purpose:** Minimize plaintext password exposure in RAM by using `Uint8Array` buffers with explicit zeroing.

- **Implementation:**
  - `passwordToBytes()` converts string passwords to `Uint8Array`
  - `scrub()` fills buffer with zeros to wipe sensitive data
  - `withScrubbing()` ensures buffers are scrubbed even if the async operation fails
- **Key Files:** `secureMemory.ts`
- **Related Commits:** `652f24b0`

---

### 2.6 IndexedDB Storage Layer

**Purpose:** Promise-based IndexedDB wrapper replacing `localStorage` for vault data and settings. Provides better performance, structured data storage, and isolation from casual JS access.

- **Implementation:**
  - Database: `SecureVaultDB`, Store: `keyval`
  - Operations: `idbGet`, `idbSet`, `idbDelete`
  - Automatic object store creation on first run
- **Key Files:** `idb.ts`
- **Related Commits:** `652f24b0`

---

### 2.7 Email Enumeration Protection

**Purpose:** Prevent attackers from determining which emails are registered.

- **Implementation:**
  - Email hashed with SHA-256 before lookup
  - Only the hash is stored in Firestore (`registered_emails/{sha256_hash}`)
  - Plaintext email is **never** stored
- **Key Files:** `firestore.ts` (`hashEmailForLookup`, `checkEmailRegistered`, `registerEmail`)
- **Related Commits:** `ceba7951`

---

### 2.8 Android Native Vault (SQLCipher + Android Keystore)

**Purpose:** Encrypted local database on Android for autofill service access, operating independently of the web layer.

- **Implementation:**
  - **SQLCipher** for encrypted SQLite database
  - **Android Keystore** generates and stores a 256-bit AES-GCM key
  - DB passphrase is encrypted with the Keystore key and stored in SharedPreferences
  - Room DAO (`VaultDao`) provides insert, query, and sync operations
  - `VaultBridgePlugin` bridges between the Capacitor web layer and native Kotlin
- **Key Files:**
  - `security/DatabaseKeyManager.kt` — Keystore key management
  - `security/VaultUnlockManager.kt` — unlock state tracking
  - `vault/NativeVaultDatabase.kt` — SQLCipher Room database
  - `vault/VaultDao.kt` — data access object
  - `vault/VaultItemEntity.kt` — Room entity
  - `vault/VaultRepository.kt` — domain-matching queries
  - `bridge/VaultBridgePlugin.kt` — Capacitor bridge
- **Related Commits:** `652f24b0`

---

### 2.9 Native ↔ Web Vault Sync

**Purpose:** Keep the native Android vault database in sync with the web vault for autofill access.

- **Implementation:**
  - **Forward sync:** `syncToNativeVault()` pushes all web vault items to the native db after every save
  - **Reverse sync:** `checkAndMergeAutofillItems()` pulls new items saved via Android Autofill back into the web vault
  - Reverse sync also triggers on `appStateChange` events (when the app returns to foreground)
- **Key Files:** `store.ts`, `bridge/VaultBridgePlugin.kt`
- **Related Commits:** `652f24b0`

---

### 2.10 Content Security Policy (CSP)

**Purpose:** Strict Content Security Policy headers to mitigate XSS and code injection attacks.

- **Implementation:** Configured in `index.html` meta tags
- **Related Commits:** `652f24b0`

---

### 2.11 AI Audit Logging

**Purpose:** Structured audit trail of all AI-generated file modifications for accountability and traceability.

- **Implementation:** Entries appended to `ai_audit_log.md` in project root after every AI-triggered file creation, modification, or deletion
- **Key Files:** `ai_audit_log.md`

---

### 2.12 Native Biometric Key Management

**Purpose:** Securely leverage hardware-backed Android Keystore and BiometricPrompt to store and retrieve the Vault's Data Encryption Key (DEK).

- **Implementation:**
  - `BiometricKeyManager.kt` initializes hardware Keystore keys explicitly flagged with `setInvalidatedByBiometricEnrollment(true)`.
  - The Keystore generates a Key Encryption Key (KEK). The raw DEK is exported from the JS layer via `exportDEK()` only during setup, wrapped by the KEK, and stored natively.
  - On unlock, `BiometricPrompt` triggers. Upon success, the wrapped DEK is decrypted natively and returned to JS (`importDEK()`) to unlock the vault.
  - `DatabaseKeyManager.kt` includes root-detection heuristics to preemptively disable biometric functionality on compromised devices.
- **Key Files:** `security/BiometricKeyManager.kt`, `crypto.ts`, `store.ts` (`enableBiometricUnlock`, `unlockWithBiometric`)
- **Related Commits:** conversation `5ef446b0`

---

### 2.13 Self-Hosted OTA Update System

**Purpose:** Deliver silent, zero-cost over-the-air updates to Android users without APK reinstalls, using `@capgo/capacitor-updater` with Firebase Hosting as the CDN.

- **Implementation:**
  - `initUpdater()` called on app boot from `App.tsx` — calls `notifyAppReady()` (required safety signal) then checks Firestore for new versions.
  - Version metadata stored in Firestore `app_config/latest_version` (version, bundle properties).
  - Update bundles (zipped `dist/` output) hosted on Firebase Hosting under `ota-updates/bundles/`.
  - **Automated Pipeline:** `npm run release` now builds, zips, deploys to Firebase Hosting, and updates Firestore atomically using `firebase-admin`.
  - **State Safety:** Uses 3-state tracking (`sv_ota_pending_version`, `sv_ota_pending_bundle_id`, `sv_ota_active_version`) in `updater.ts`. Pending updates are strictly promoted to active only when post-restart verification confirms `CapacitorUpdater.current()` matches the expected bundle ID, ensuring no false success states.
  - **Native Compatibility:** Strictly passes `{ id: bundle.id }` to the native bridge to ensure correct bundle application.
- **Key Files:** `services/updater.ts`, `scripts/release-ota.mjs`, `capacitor.config.ts`, `firebase.json`
- **Related Commits:** conversation `47ac61c9`, conversation `f46bb8cb`

---

## 3. Technical & Architectural Evolution

### 3.1 Key Derivation: PBKDF2 → Argon2id

| Aspect | Initial | Current |
|---|---|---|
| **Algorithm** | PBKDF2 (SHA-256, 600K iterations) | Argon2id (via `hash-wasm` WASM) |
| **Parameters** | — | 64 MB memory, 3 iterations, parallelism 1 |
| **Output** | 256-bit key | 256-bit key |
| **Library** | Web Crypto API | `hash-wasm` (WASM-compiled Argon2id) |

- **Reason:** Argon2id is memory-hard, making it significantly more resistant to GPU and ASIC brute-force attacks compared to PBKDF2.
- **Commit:** `652f24b0` — extreme security 1.0 (2026-03-15)
- **Key Files:** `crypto.ts`

---

### 3.2 Storage: localStorage → IndexedDB

| Aspect | Initial | Current |
|---|---|---|
| **API** | `localStorage` | IndexedDB (`SecureVaultDB`) |
| **Access** | Synchronous, string-only | Async, structured data |
| **Security** | Accessible via any JS on the page | Better isolation |

- **Reason:** IndexedDB provides structured storage, better performance for large datasets, and is less susceptible to casual XS access than localStorage.
- **Commit:** `652f24b0` — extreme security 1.0 (2026-03-15)
- **Key Files:** `idb.ts`

---

### 3.3 Encryption: AES-GCM (Unchanged)

| Aspect | Value |
|---|---|
| **Algorithm** | AES-GCM |
| **Key Size** | 256-bit |
| **IV Size** | 12 bytes (96-bit) |
| **API** | Web Crypto API (`crypto.subtle`) |

- AES-256-GCM has remained the encryption algorithm since Phase 1.
- The change was in how the key is **derived** (see 3.1), not how it's used.

---

### 3.4 Dual Key Architecture

| Key | Purpose | Salt | Introduced |
|---|---|---|---|
| **Auth Key** | Firebase Auth login password | `email` | `652f24b0` |
| **Encryption Key** | AES-GCM vault encryption | `email + "vault"` | `652f24b0` |

- **Reason:** Separating the auth key from the encryption key means even if Firebase is compromised, the attacker cannot derive the vault encryption key. The different salts produce entirely different derived keys from the same master password.

---

### 3.5 Secret Scrubbing

| Aspect | Before | After |
|---|---|---|
| **Password handling** | String variables in memory | `Uint8Array` buffers with explicit zero-fill |
| **Key material** | Left in memory after use | Scrubbed via `scrub()` / `withScrubbing()` |

- **Reason:** Minimize the window during which sensitive material is accessible in JavaScript memory. While JS cannot guarantee memory safety, explicit zeroing removes the most accessible copy.
- **Commit:** `652f24b0`

---

### 3.6 Authentication Flow Evolution

| Phase | Flow | Commit |
|---|---|---|
| **Phase 1** | Basic email/password sign-up | `5f320fd7` |
| **Phase 2** | Magic link (passwordless) email verification | `4707efbb` |
| **Phase 2.5** | Google Sign-In added | `83926d22` |
| **Phase 3** | Derived auth key (Argon2id) replaces raw password | `652f24b0` |
| **Phase 3.1** | Email enumeration protection (hashed email lookup) | `ceba7951` |
| **Phase 3.2** | Magic link mode parameter (signup vs reset) | `ceba7951` |

---

### 3.7 Project Timeline

| Date | Commit | Milestone |
|---|---|---|
| 2026-03-06 | `5f320fd7` | **Phase 1 Complete** — Basic vault, auth, encryption |
| 2026-03-06 | `4707efbb` | **Phase 2** — Master password, auto-lock, settings |
| 2026-03-06 | `83926d22` | Login fixes, Google sign-in |
| 2026-03-07 | `bf572c2d` | Password entry improvements |
| 2026-03-10 | `71cf8812` | Password-related fixes |
| 2026-03-11 | `ef145dc8` | Raw error logging for verification link debugging |
| 2026-03-11 | `41b384c1` | Firebase auth/quota-exceeded handling |
| 2026-03-13 | `4fba41d3` | **Trash bin, CSV import/export, UI fixes** |
| 2026-03-14 | `44ee646d` | Email verification and login debugging |
| 2026-03-14 | `deaedb70` | Auth problem fixes |
| 2026-03-15 | `5bc9aa87` | Auth flow stabilization |
| 2026-03-15 | `ff5a0549` | Email enumeration protection, forgot password flow |
| 2026-03-15 | `652f24b0` | **Extreme Security 1.0** — Argon2id, IndexedDB, secret scrubbing, device sessions, autofill |
| 2026-03-15 | `f9970ec6` | Google sign-in fix, CSV updates |
| 2026-03-16 | `111f3e36` | Security fixes, user existence checks |
| 2026-03-16 | `5ef446b0` | **Android Biometric Unlock Integration** |

---

## 4. Maintenance Guide

### Adding a New Feature Entry

When a new feature is implemented, add an entry under the appropriate section using this template:

```markdown
### X.XX Feature Name

**Description:** [What the feature does from the user's perspective]

- **Introduced:** `commit_hash` — commit message (date)
- **Key Files:** `file1.ts`, `file2.tsx`
- **Later Changes:**
  - [description of change] — `commit_hash` or conversation `conversation_id`
```

### Adding a Technical Change Entry

When a significant architectural or technology change is made, add an entry to Section 3 using this template:

```markdown
### 3.X Change Title

| Aspect | Before | After |
|---|---|---|
| **[dimension]** | [old value] | [new value] |

- **Reason:** [Why the change was made]
- **Commit:** `commit_hash`
- **Key Files:** `file.ts`
```

### Update Checklist

When updating this document:
- [ ] Feature is listed under the correct section (User / Developer / Technical)
- [ ] Commit hash is included
- [ ] Key files are referenced
- [ ] If modifying an existing feature, the "Later Changes" section is updated instead of creating a duplicate
- [ ] Project Timeline table in section 3.7 is updated

### Technical/Architectural Evolution

**Autofill Reliability & Security Hardening**
Resolved critical autofill edgecases to ensure reliability across modern login flows:
- **Multi-Step Login Cache**: Created an LRU Process Singleton (\LoginSessionCache.kt\) that caches usernames to match against isolated password fields in split flows (Google, Amazon, Microsoft).
- **Strict Domain Trust:** Enforces a minimum domain-match confidence score of 0.8 before filling, preventing phishing attempts on spoofed subdomains.
- **Enhanced Heuristics:** Employs a comprehensive set of international heuristic keywords and editability checks (\AutofillHelper.kt\) to detect custom form fields across apps like Instagram and Uber.
- **Strict WebView Mapping:** Safely ignores WebView requests that don't match verified app package domains (\SecureVaultAutofillService.kt\).

**OTA Update Hardening (v2.0.3)**
Resolved persistent rollbacks and 404 errors by hardening the bundle transition and zip extraction logic:
- **Lifecycle Protection**: Replaced `CapacitorUpdater.set()` with `next() + reload()` to ensure the OTA bundle correctly satisfies the `notifyAppReady()` requirement on a clean cold boot, preventing early session termination.
- **Zip Structure Integrity**: Replaced the native Windows `Compress-Archive` utility (which flattened the `assets/` subdirectory) with the `archiver` npm package to preserve the required folder hierarchy.
- **Diagnostic Trace**: Injected ultra-early `BOOT_MARK` checkpoints in `index.html` and `App.tsx` that persist in `localStorage` (`OTA_DEBUG_LOG`), enabling deep analysis of silent boot failures and rollback triggers.
- **Predictable Asset Paths**: Disabled Vite content hashing to prevent 404 errors during OTA asset loading.
- **Key Files**: `src/app/services/updater.ts`, `scripts/release-ota.mjs`, `capacitor.config.ts`, `vite.config.ts`.

---

**Native Google OAuth Integration (v2.0.4)**
Migrated Google Sign-In from web `signInWithPopup` to a native Capacitor implementation to ensure compatibility across all Android environments:
- **Native Implementation**: Uses `@capacitor-firebase/authentication` to handle the OAuth flow natively, bypassing WebView popup restrictions.
- **Firebase Configuration**: Integrated `google-services.json` directly into the Android source, enabling standard Google Play Services authentication.
- **Credential Handover**: The native `idToken` is securely passed to the JS SDK via `signInWithCredential()`, maintaining full compatibility with existing Firestore security rules and user data mapping.
- **APK Requirement**: This update **requires a new native APK build** as it introduces new native plugins and resource files that cannot be delivered via OTA update

### Native APK Release v3.0 — 2026-04-01

- **Problem**: Biometric settings were lost on logout, and Google Sign-In would fail on Android with "Sign-in failed" error.
- **Solution**: Updated `clearLocalVaultData()` to preserve device settings. Configured native Firebase Authentication in `capacitor.config.ts` and `variables.gradle`.
- **Key Files**: 
    - `src/app/store.ts` (Biometric preservation)
    - `capacitor.config.ts` (Plugin config)
    - `android/variables.gradle` (Build flags)
    - `android/app/build.gradle` (Version bump v3)
- **Deployment**: Released v3 APK to GitHub and triggered update via Firestore `min_apk_version: 3`.

---

**Bug Fix: Biometric Settings Persistence Across Logouts (2026-04-01)**
Resolved a regression where biometric unlock was being disabled every time the user signed out or a device session was revoked.
- **Root Cause**: `clearLocalVaultData()` in `store.ts` was deleting both `securevault_items` (encrypted vault cache) AND `securevault_settings` (user preferences like `biometricEnabled`, `autoLockTimeout`). On next login, settings fell back to `defaultSettings` which has `biometricEnabled: false`.
- **Fix**: `clearLocalVaultData()` now only deletes `securevault_items`. Settings are intentionally preserved as they are device-level preferences, not sensitive vault data. The actual passwords are always safe — they live in Firestore (cloud); the local IndexedDB copy is merely a cache re-downloaded on login.
- **Key Files**: `src/app/store.ts` (`clearLocalVaultData`)

---

**Bug Fix: Google Sign-In Fails on Android — "sign in failed, try again later" (2026-04-01)**
Resolved native Google Sign-In failure on Android that occurred despite the web flow working fine.
- **Root Cause**: `rgcfaIncludeGoogle = true` was missing from `android/variables.gradle`. This flag is REQUIRED by `@capacitor-firebase/authentication` v6+ to Gradle-include the Google Play Services Auth dependency. Without it, the native Google module is silently excluded from the APK build, causing the error at runtime. SHA-1 certificate and `google-services.json` were already correct.
- **Fix**: Added `rgcfaIncludeGoogle = true` to `variables.gradle`. Also added `FirebaseAuthentication` plugin config block in `capacitor.config.ts` (`skipNativeAuth: false`, `providers: ['google.com']`) for proper plugin initialization.
- **Key Files**: `android/variables.gradle`, `capacitor.config.ts`

---

**Bug Fix: Device Revocation Force-Logout (OTA v3.0.1 — 2026-04-02)**
Resolved a critical bug where revoking any device session (even a remote one) would incorrectly log out the current user.
- **Root Cause**: Both `revokeDevice()` and `revokeAllOtherDevices()` were unconditionally incrementing the global `tokenVersion` in Firestore. The current device's listener would detect this mismatch and trigger an immediate `signOut()`.
- **Fix**: 
    1. **Single Device**: Removed the `tokenVersion` bump. Now, only the target device document is deleted. The target device's `onSnapshot` listener handles the local logout when its own document disappears.
    2. **All Other Devices**: The `tokenVersion` bump is preserved for security (to invalidate potential stolen sessions), but the local `sessionTokenVersion` cache is now updated *before* the listener reflects the change, exempting the current session from the revocation.
- **Key Files**: `src/app/services/deviceSession.ts` (`revokeDevice`, `revokeAllOtherDevices`)
- **Deployment**: Released via OTA v3.0.1.

---

**Bug Fix: Vault Immediately Locks After New Vault Creation (conversation `4daacfd4` — 2026-04-02)**
Resolved critical bug where new users (or users resetting their vault) would be sent to the "Vault is locked" screen immediately after creating their vault.
- **Root Cause**: `setupInitialVault()` in `store.ts` correctly encrypted and saved the empty vault to IndexedDB and Firestore, but never populated the in-memory session variables (`_sessionCryptoKey`, `_sessionPassword`, `_cachedItems`). `isVaultUnlocked()` only checks `_sessionCryptoKey`, so it always returned `false` post-setup. `AuthScreen.tsx`'s `handleSetupMaster` did call `setSessionPassword(password)` — but that function only sets `_sessionPassword`, not `_sessionCryptoKey`. The vault was permanently considered locked until the user manually unlocked it again.
- **Fix**: `setupInitialVault()` now hydrates all three session variables (`_sessionCryptoKey`, `_sessionPassword`, `_cachedItems = []`) immediately after vault creation, matching the behavior of `unlockVault()`.
- **Key Files**: `src/app/store.ts` (`setupInitialVault`)

---

**Bug Fix: OTA False-Rollback Poisoning After APK Reinstall (conversation `4daacfd4` — 2026-04-02)**
Resolved a critical scenario where installing a new major APK from GitHub Releases would permanently block OTA updates from being applied.
- **Root Cause**: `resetWhenUpdate: false` in `capacitor.config.ts` causes localStorage to persist across APK installs. When a user installs a new APK (e.g. v3.0.0) while an OTA download is in progress (`sv_ota_pending_version = "3.0.2"`), the app boots with `isBuiltin=true` plus a stale pending version. The boot logic interprets this as a "rollback" and calls `addFailedVersion("3.0.2")`, permanently blacklisting the version. The subsequent OTA check sees `hasFailedVersion("3.0.2") === true` and skips it forever.
- **Fix**: Added a **native version migration guard** at the top of `initUpdater()`. On every boot, `App.getInfo().version` is compared against `sv_ota_native_version` in localStorage. If a version change is detected (new APK installed), ALL OTA localStorage keys are cleared — including `FAILED_VERSIONS_KEY` — before any other logic runs.
- **Key Files**: `src/app/services/updater.ts` (`initUpdater`, `NATIVE_VERSION_KEY`)

---

**Bug Fix: Google OAuth 404 Error on Android 14 (conversation `4daacfd4` — 2026-04-02)**
Resolved a 404 error during Google Sign-In on devices where the native Credential Manager flow falls back to web OAuth.
- **Root Cause**: `@capacitor-firebase/authentication` uses Android Credential Manager natively on most devices (no redirect needed). On devices where Credential Manager fails — Android 14 strict account permissions, OEM Google Play Services forks (e.g., Realme GT Neo 3T), or SHA-1 mismatch — the plugin falls back to a web OAuth popup. That popup redirects back to `com.mohdj.securevault:/`. Without a matching intent-filter in `AndroidManifest.xml`, Android had no registered receiver for the custom URI scheme and returned a 404. This explains why some users (Credential Manager path) worked and others didn't (web popup fallback path).
- **Fix**: Added `intent-filter` with `android:scheme="com.mohdj.securevault"` and `android:autoVerify="true"` to `.MainActivity` in `AndroidManifest.xml`.
- **Key Files**: `android/app/src/main/AndroidManifest.xml`

---

## Production Release v3.1.0 — Stability Fixes (2026-04-02)

### Overview
This release (versionCode 4, versionName 3.1.0) addresses three major production blockers identified in existing v3.0.0 builds. It resolves a critical vault race condition, enables reliable OTA update recovery, and fixes Google Sign-in on Android 14 devices.

### Change Detail
- **Vault Setup Fix**: `setupInitialVault()` now ensures immediate session hydration, preventing new users from being locked out of their fresh vault.
- **OTA Recovery Fix**: Implemented a native version migration guard that detects manual APK upgrades and clears stale OTA `localStorage` to prevent "false-rollback" poisoning.
- **Google OAuth Filter**: Registered a custom intent-filter for `com.mohdj.securevault` to handle web-based OAuth redirects on devices with restricted Credential Manager access.

### Key Files
- `src/app/store.ts`
- `src/app/services/updater.ts`
- `android/app/src/main/AndroidManifest.xml`
- `android/app/build.gradle`
- `package.json`

---

**Bug Fix: Native Version Overridden by active OTA Bundles causing infinite App Update Prompt (2026-04-07)**
Resolved a critical issue where the application continued to display a mandatory "App Update Required" banner even after a successful APK update (from versionName 3.0.0 to 3.1.0).
- **Root Cause**: `CapacitorUpdater` transparently hooks into Capacitor's standard `App.getInfo()` API. When an OTA bundle is active (e.g. bundle 0.0.9), `App.getInfo().version` returns the *bundle* version (0.0.9), not the true underlying native APK version. The native version check was comparing this overwritten version against the `min_apk_version` stored in Firestore (which expected "3.1.0"), resulting in false-positive "Upgrade Required" triggers.
- **Fix**: Replaced all usages of `App.getInfo().version` for system upgrade checks with `CapacitorUpdater.current().native`. This bypasses the OTA override and fetches the unadulterated native APK version to correctly evaluate min-app requirements and the OTA migration guard.
- **Key Files**: `src/app/services/apk-update-checker.ts`, `src/app/services/updater.ts`
