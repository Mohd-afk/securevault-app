# SecureVault Android Autofill Provider — Complete Implementation Plan

## Goal

Make SecureVault a **real Android Autofill Provider** — when a user opens any app (Twitter, Netflix, banking) or website in Chrome, Android prompts them with matching SecureVault passwords. Also support **saving new passwords** back into the vault.

This is the feature that turns SecureVault from a "vault viewer" into a real password manager.

---

## Current Architecture Snapshot

| Layer | File(s) | What It Does Today |
|---|---|---|
| Crypto | [crypto.ts](file:///d:/PYTHON/Password%20Manager/src/app/crypto.ts) | Argon2id KDF → AES-256-GCM encrypt/decrypt |
| Vault Model | [store.ts](file:///d:/PYTHON/Password%20Manager/src/app/store.ts) → [VaultItem](file:///d:/PYTHON/Password%20Manager/src/app/store.ts#27-39) | `{ id, title, username, password, url, type, … }` |
| Storage | [idb.ts](file:///d:/PYTHON/Password%20Manager/src/app/idb.ts) | IndexedDB (`SecureVaultDB`) — stores encrypted blob |
| Cloud Sync | [firestore.ts](file:///d:/PYTHON/Password%20Manager/src/app/firestore.ts) → [store.ts](file:///d:/PYTHON/Password%20Manager/src/app/store.ts) | Encrypted payload pushed to Firestore, realtime listener |
| Domain Utils | [domain.ts](file:///d:/PYTHON/Password%20Manager/src/app/utils/domain.ts) | Basic [normalizeUrl()](file:///d:/PYTHON/Password%20Manager/src/app/utils/domain.ts#1-15) — strips `www.`, extracts hostname |
| Android Shell | [MainActivity.java](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/MainActivity.java) | Stock Capacitor `BridgeActivity`, no native code |
| Manifest | [AndroidManifest.xml](file:///d:/PYTHON/Password%20Manager/android/app/src/main/AndroidManifest.xml) | INTERNET permission only, no autofill declarations |

> [!IMPORTANT]
> **Key architectural constraint:** The vault currently lives in WebView-only memory (IndexedDB). Android's `AutofillService` runs as a **separate OS-level process** — it **cannot** access WebView's IndexedDB. We must bridge this gap with a **native encrypted SQLite database** that both the WebView and the AutofillService can read.

---

## Architecture Target

```
SecureVault APK (com.mohdj.securevault)

├── WebView (React/Vite UI) ← existing
│     └── Capacitor Plugin bridge → writes to native vault
│
├── Native Vault Storage (NEW)
│     ├── SQLCipher encrypted database
│     ├── Domain Index (Map<domain, List<entry>>)
│     └── Android Keystore ← holds master key material
│
├── SecureVaultAutofillService (NEW)
│     ├── onFillRequest() → domain match → dataset response
│     ├── onSaveRequest() → save new credentials
│     └── Biometric unlock gate
│
└── SecureVaultBiometricHelper (NEW)
      └── BiometricPrompt → unlocks vault key from Keystore
```

---

## User Review Required

> [!WARNING]
> **Breaking change in vault storage model:** Today the vault is IndexedDB-only on device. After this feature, the vault will **also** exist in a native SQLCipher database on Android. The WebView remains the primary UI, but every vault write must now sync to the native DB via a Capacitor plugin.

> [!IMPORTANT]
> **Argon2id vs PBKDF2:** Bitwarden uses PBKDF2. We use Argon2id (64 MB, 3 iterations). Since Argon2id runs in WASM inside the WebView today, we need a **native Argon2 library** for the Android side (the AutofillService can't run WASM). We'll use [ArmadilloArgon2](https://github.com/nickygencs/argon2-android) or the `signal-argon2` native library.

> [!CAUTION]
> **Scope reality check:** This is a multi-week feature, not a weekend hack. Each phase below is independently shippable and testable. Do NOT skip phases.

---

## Proposed Changes — Phased Rollout

---

### Phase 1: Native Vault Mirror + Capacitor Bridge

**Goal:** Every vault item that exists in IndexedDB also exists in a native SQLCipher DB that Android-native code can read.

#### [NEW] `android/.../vault/NativeVaultDatabase.kt`
- SQLCipher-encrypted Room database
- Table schema mirrors [VaultItem](file:///d:/PYTHON/Password%20Manager/src/app/store.ts#27-39): `id, title, username, encryptedPassword, uris, type, createdAt, updatedAt, deletedAt`
- **Passwords stored encrypted** with AES-256-GCM using a key held in Android Keystore
- Domain index table: [(normalized_domain TEXT, vault_item_id TEXT)](file:///d:/PYTHON/Password%20Manager/src/app/crypto.ts#37-42) for O(1) lookup

#### [NEW] `android/.../vault/VaultRepository.kt`
- CRUD operations on the native vault
- Builds/rebuilds the domain index on insert/update/delete
- Provides `findByDomain(domain: String): List<VaultItem>` query

#### [NEW] `android/.../bridge/VaultBridgePlugin.kt`
- Capacitor Plugin (`@CapacitorPlugin`)
- Exposes methods to WebView JS: `syncVaultItem(item)`, `removeVaultItem(id)`, `fullSync(items[])`
- Called from the React side after every vault write

#### [MODIFY] [src/app/store.ts](file:///d:/PYTHON/Password%20Manager/src/app/store.ts)
- After every [saveVaultEverywhere()](file:///d:/PYTHON/Password%20Manager/src/app/store.ts#286-315), call the Capacitor bridge to push decrypted items into the native DB
- Add `syncToNativeVault(items: VaultItem[])` function using `Plugins.VaultBridge.fullSync()`

#### [MODIFY] `android/.../MainActivity.java` → `.kt`
- Convert to Kotlin
- Register `VaultBridgePlugin` with Capacitor

#### [MODIFY] [capacitor.config.ts](file:///d:/PYTHON/Password%20Manager/capacitor.config.ts)
- Add plugin registration if needed

#### [MODIFY] [android/app/build.gradle](file:///d:/PYTHON/Password%20Manager/android/app/build.gradle)
- Add dependencies: SQLCipher, Room, Argon2 native, AndroidX Biometric

---

### Phase 2: AutofillService — Fill Passwords

**Goal:** Android recognizes SecureVault as an autofill provider. When a user taps a login field in any app, matching credentials appear.

#### [NEW] `android/.../autofill/SecureVaultAutofillService.kt`
- Extends `android.service.autofill.AutofillService`
- `onFillRequest()`:
  1. Extract the requesting app's package name OR web domain from `AssistStructure`
  2. Normalize the domain (using the domain matching engine)
  3. If vault is **locked** → return a single `Dataset` that launches the unlock Activity
  4. If vault is **unlocked** → query `VaultRepository.findByDomain()` → build `Dataset` objects → return `FillResponse`
- `onSaveRequest()`: deferred to Phase 4

#### [NEW] `android/.../autofill/AutofillHelper.kt`
- Parses `AssistStructure` to find username/password fields
- Uses heuristics: `autofillHints`, `inputType`, view IDs like `username`, `email`, `password`
- Handles both native Android apps and Chrome Custom Tabs (web domains)

#### [NEW] `android/.../autofill/DomainMatcher.kt`
- Full domain normalization engine
- Strips protocol, `www.`, extracts root domain using Public Suffix List
- Supports app-package → domain mapping (e.g., `com.netflix.mediaclient` → `netflix.com`)
- Known-app mapping table for top 100 apps as bootstrap data

#### [NEW] `android/app/src/main/res/xml/autofill_service_config.xml`
- Declares service metadata for the OS

#### [MODIFY] [android/app/src/main/AndroidManifest.xml](file:///d:/PYTHON/Password%20Manager/android/app/src/main/AndroidManifest.xml)
- Register `SecureVaultAutofillService` with `BIND_AUTOFILL_SERVICE` permission
- Add `<meta-data>` pointing to `autofill_service_config.xml`

---

### Phase 3: Biometric Unlock for Autofill

**Goal:** Vault stays locked until the user authenticates via fingerprint/face. No silently leaking passwords.

#### [NEW] `android/.../security/BiometricVaultUnlocker.kt`
- Uses `BiometricPrompt` API (AndroidX)
- On success → retrieves the master key from Android Keystore → decrypts the vault encryption key
- Vault unlock state held in-memory with configurable timeout (mirrors the `autoLockTimeout` setting)
- Re-locks after timeout period (reads from the [AppSettings](file:///d:/PYTHON/Password%20Manager/src/app/store.ts#40-45) synced via Capacitor)

#### [NEW] `android/.../security/KeystoreManager.kt`
- Generates or retrieves AES master key from Android Keystore
- The master key wraps the Argon2id-derived encryption key
- Key is invalidated if biometric enrollment changes (security requirement)

#### [NEW] `android/.../autofill/UnlockVaultActivity.kt`
- Transparent Activity launched by the AutofillService when vault is locked
- Shows BiometricPrompt → on success → sends result back to AutofillService → re-triggers fill
- On cancel → returns empty FillResponse (no passwords shown)

#### [MODIFY] `android/.../autofill/SecureVaultAutofillService.kt`
- Integrate `BiometricVaultUnlocker` into the fill flow
- Check vault lock state before responding

---

### Phase 4: Save Password Flow

**Goal:** When a user logs into a new site, Android asks "Save to SecureVault?"

#### [MODIFY] `android/.../autofill/SecureVaultAutofillService.kt`
- Implement `onSaveRequest()`:
  1. Extract username + password from the `AssistStructure`
  2. Extract domain/package from request context
  3. Create new [VaultItem](file:///d:/PYTHON/Password%20Manager/src/app/store.ts#27-39) in native DB
  4. Push the new item back into the WebView vault via a reverse bridge mechanism (or flag for next full sync)

#### [NEW] `android/.../autofill/SaveConfirmationActivity.kt`
- Optional UI: "Save to SecureVault?" with editable title/username/URL fields
- Lets user confirm before saving (better UX than silent save)

#### [MODIFY] `android/.../autofill/AutofillHelper.kt`
- Add save-detection logic: identify which fields are `username` vs `password` vs `confirm-password`
- Set `SaveInfo` flags in `FillResponse` to tell Android to call `onSaveRequest` after form submission

#### [MODIFY] [src/app/store.ts](file:///d:/PYTHON/Password%20Manager/src/app/store.ts) (or new listener)
- On WebView resume, check native DB for newly saved items and merge into the cloud-synced vault

---

### Phase 5: Smart Matching + Polish

**Goal:** Production-grade domain matching, performance tuning, settings UI.

#### [MODIFY] `android/.../autofill/DomainMatcher.kt`
- Import full **Public Suffix List** (Mozilla's `publicsuffix.org` list)
- Handle edge cases: `signin.amazon.co.uk` → `amazon.co.uk`, not `co.uk`
- Subdomain strategies: exact match, base-domain match, host match

#### [NEW] Settings UI — "Autofill Settings" section in React
- Toggle to enable/disable autofill
- Link to Android Settings → Autofill Service picker
- Blocklist: sites to never autofill (banking apps where user prefers manual entry)

#### Performance
- Pre-build domain index on vault unlock
- In-memory LRU cache for recent lookups in AutofillService
- Target: respond to `onFillRequest()` in <200ms

#### [NEW] `android/.../autofill/AccessibilityFallbackService.kt` *(optional, stretch goal)*
- For apps that explicitly block AutofillService
- Uses Accessibility API to detect login fields and show a floating button
- Many serious password managers include this as a fallback

---

## File Summary

| Phase | New Files | Modified Files |
|---|---|---|
| 1 | `NativeVaultDatabase.kt`, `VaultRepository.kt`, `VaultBridgePlugin.kt` | [store.ts](file:///d:/PYTHON/Password%20Manager/src/app/store.ts), [MainActivity](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/MainActivity.java#5-6), [build.gradle](file:///d:/PYTHON/Password%20Manager/android/build.gradle), [capacitor.config.ts](file:///d:/PYTHON/Password%20Manager/capacitor.config.ts) |
| 2 | `SecureVaultAutofillService.kt`, `AutofillHelper.kt`, `DomainMatcher.kt`, `autofill_service_config.xml` | [AndroidManifest.xml](file:///d:/PYTHON/Password%20Manager/android/app/src/main/AndroidManifest.xml) |
| 3 | `BiometricVaultUnlocker.kt`, `KeystoreManager.kt`, `UnlockVaultActivity.kt` | `SecureVaultAutofillService.kt` |
| 4 | `SaveConfirmationActivity.kt` | `SecureVaultAutofillService.kt`, `AutofillHelper.kt`, [store.ts](file:///d:/PYTHON/Password%20Manager/src/app/store.ts) |
| 5 | Autofill settings UI component, `AccessibilityFallbackService.kt` | `DomainMatcher.kt`, settings screen |

---

## Verification Plan

### Phase 1 — Native Vault Mirror
- Build APK, add a password in the WebView UI
- Use Android Studio Database Inspector to confirm the item appears in the SQLCipher DB
- Delete and re-add items — verify CRUD parity between WebView and native DB

### Phase 2 — Basic Autofill
- Go to **Android Settings → Passwords & Autofill → Autofill service** → select "SecureVault"
- Open Netflix / Twitter in the APK or Chrome
- Tap the email field → verify SecureVault suggestions appear
- Tap a suggestion → verify username + password fill correctly

### Phase 3 — Biometric Lock
- Kill the app → open Netflix → tap login field
- Verify BiometricPrompt appears → authenticate → passwords fill
- Deny biometric → verify no passwords leak

### Phase 4 — Save Flow
- Log into a new site with fresh credentials
- Verify "Save to SecureVault?" prompt appears
- Confirm → re-open SecureVault WebView → verify the new entry exists in the vault

### Phase 5 — Smart Matching
- Test `signin.amazon.co.uk` matching against `amazon.co.uk` vault entry
- Test app-package matching: `com.twitter.android` matching against `twitter.com`
- Verify <200ms response time on vault with 500+ entries

---

## Dependencies to Add

```groovy
// android/app/build.gradle
implementation "net.zetetic:android-database-sqlcipher:4.5.6"
implementation "androidx.room:room-runtime:2.6.1"
kapt "androidx.room:room-compiler:2.6.1"
implementation "androidx.biometric:biometric:1.2.0-alpha05"
implementation "de.nickyg.argon2:argon2-android:1.0.0" // or equivalent native Argon2
```
