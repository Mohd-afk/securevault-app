# Keeguard — Android Autofill Architecture

> **Branding alias:** This app was previously called **SecureVault** and is now called **Keeguard**. `Keeguard` = `SecureVault` — same app, new name. The class `SecureVaultAutofillService` and package `com.mohdj.securevault` retain the old name intentionally (changing them would break existing installs).

> **Version**: 3.2.2  
> **Last Updated**: 2026-04-19  
> **Status**: Production

---

## Overview

Keeguard implements the Android [AutofillService](https://developer.android.com/reference/android/service/autofill/AutofillService) API to suggest saved credentials in third-party apps and browsers. This document describes the data flow, security boundaries, and design decisions for the native autofill subsystem.


---

## Data Flow: JS Vault → Native Autofill DB → Fill Response

```
           JS Vault (in memory, decrypted)
                        │
                        │ VaultItem.password = PLAINTEXT
                        ▼
              store.ts :: syncToNativeVault()
                        │
                        │ VaultBridge.fullSync({ items })
                        ▼
            VaultBridgePlugin.kt :: fullSync()
                        │
                        │ VaultItemEntity(password = plaintext)
                        ▼
     ┌──────────────────────────────────────────────┐
     │   native_secure_vault.db  (SQLCipher + KEK)  │ ← ENCRYPTION BOUNDARY
     │   DatabaseKeyManager: AES-256 per-device key  │
     │   Keystore: hardware-backed on TEE devices    │
     └──────────────────────────────────────────────┘
                        │
                        │ VaultRepository.findByDomain(identity)
                        ▼
      SecureVaultAutofillService :: onFillRequest()
                        │
                        │ Dataset.Builder().setValue(AutofillValue.forText(item.password))
                        ▼
           Android AutofillManager → Target App
```

---

## Security Boundary

### What is Encrypted

The **SQLCipher database file** (`native_secure_vault.db`) is the encryption boundary for the native autofill credential cache. The entire database file is AES-256 encrypted by SQLCipher.

| Layer              | Key Source               | Protects                      |
|--------------------|--------------------------|-------------------------------|
| SQLCipher (DB file) | `DatabaseKeyManager` KEK | All rows including passwords  |
| Android Keystore   | Hardware TEE (if present) | The SQLCipher passphrase     |
| Android app sandbox | OS-level isolation       | DB access from other apps    |

### What is NOT Separately Encrypted

- Individual `password` column values are **plaintext inside** the SQLCipher-encrypted DB
- This is intentional — duplicating encryption with additional AES layers would create a key management problem the native autofill service cannot solve (see below)

---

## Why Plaintext Inside SQLCipher (and Not Double-Encrypted)

There are **two incompatible encryption keys** in this system:

| Key                    | Owner     | Used for                              | Available in native?        |
|------------------------|-----------|---------------------------------------|-----------------------------|
| JS Master Password Key | WebView   | Encrypting the cloud vault blob       | ❌ Never (JS-only context)  |
| Biometric DEK          | Keystore  | Session unlock state tracking         | ✅ Yes, but wrong for this   |
| SQLCipher KEK          | Keystore  | Encrypting the native DB file itself  | ✅ Yes — this is the correct key |

The JS vault encryption key is a PBKDF2-derived key from the user's master password. This key:
- Exists only in the WebView/JS memory layer
- Is never exported to native code
- Changes if the user changes their master password

If a second AES layer were applied to password column values using the JS key, the native autofill service would have no way to decrypt them. Any attempt to use the biometric DEK as a surrogate would also fail — it is a different key with a different purpose.

**The correct model**: plaintext passwords inside a SQLCipher database. This is used by [1Password](https://1password.com/security/), [Bitwarden](https://bitwarden.com/), and other leading password managers for their local encrypted vault caches.

---

## Identity Resolution: Web vs Package

The service differentiates two types of contexts:

### Browser / WebView (`identityType = "web"`)
- Android provides `parsed.webDomain` directly from the browser's URL bar
- Example: Chrome visiting `login.example.com` → `webDomain = "login.example.com"` → normalized to `"example.com"` via PSL
- High confidence — the browser guarantees the domain is correct
- Confidence filtering is applied (≥ 0.8 required)

### Native App (`identityType = "package"`)
- `parsed.webDomain` is `null` because the view hierarchy is native (not a WebView)
- Package name is used as identity: `com.instagram.android`
- Resolution order:
  1. Check `DomainMatcher.appMappings` → `"instagram.com"` (if known)
  2. Fall back to package name itself → `"com.instagram.android"` (for unknown apps)
- The fallback enables matching credentials the user saved specifically for this app
- No confidence filtering (package identity is exact by definition)

---

## Why Item Title Is NOT Used as Identity

Titles are human-assigned labels. A user might name an item "My Bank" for `bank.com`, or name multiple items with similar titles. Using titles as match keys would:

1. Create ambiguous matches across unrelated sites
2. Risk filling credentials for site A into site B if their titles overlap
3. Open a social-engineering vector where a malicious app could be named to match a popular title

**Title is never used as an autofill identity key.** Credentials are matched only by:
- Normalized web domain (PSL-reduced)
- Android package name (exact or mapped)

---

## Password-Only Form Handling

### Web Context
Multi-step web login flows (username → password on separate pages) use `LoginSessionCache` to track the username entered on step 1. If a password-only form is seen in a browser context with no cached username, autofill is suppressed to prevent phishing.

### Native App Context
Native apps frequently show a single combined login screen, or a password-only screen independent of any web flow. The session cache check is **skipped** for native app contexts (`identityType = "package"`). The package name match provides the required identity assurance.

---

## Observability — adb logcat Tags

Filter autofill logs with:
```
adb logcat -s SecureVaultAutofill
```

| Log Tag                           | Meaning                                        |
|-----------------------------------|------------------------------------------------|
| `AUTOFILL_REQUEST_RECEIVED`       | onFillRequest was called by Android            |
| `AUTOFILL_PARSED_FIELDS`          | Field detection completed                      |
| `AUTOFILL_IDENTITY_RESOLVED`      | Domain/package identity determined             |
| `AUTOFILL_VAULT_LOCKED`           | Returning biometric authentication intent      |
| `AUTOFILL_MATCH_COUNT`            | Number of DB matches found                     |
| `AUTOFILL_SUPPRESSED_REASON=...`  | Why autofill was suppressed (no_identity, naked_password_web_no_cache, blocked_domain, etc.) |
| `AUTOFILL_FILL_RESPONSE_SENT`     | Fill response returned to Android              |
| `AUTOFILL_SAVE_REQUEST_RECEIVED`  | onSaveRequest was called                       |
| `AUTOFILL_SAVE_SUCCESS`           | New credential saved to native DB              |

---

## Re-Sync After Upgrade

The Kotlin field rename (`encryptedPassword` → `password`) is a code-level rename only. The underlying SQL column name (`encrypted_password`) is unchanged. **No Room database migration is required.**

However: any items synced to the native DB **before v3.2.2** stored wrong data in the `encrypted_password` column (they stored the result of the incorrect AES-GCM encrypt path in `onSaveRequest`). These items will have an empty password in the autofill fill path and log a warning. The fix is:

1. Open SecureVault while the vault is unlocked
2. The unlock flow calls `syncToNativeVault()` which overwrites all rows with correct plaintext data
3. From that point, autofill will fill passwords correctly

---

## Files in the Autofill Subsystem

| File | Role |
|------|------|
| `SecureVaultAutofillService.kt` | Core fill/save request handler |
| `UnlockVaultActivity.kt` | Biometric prompt + fill response builder for locked-vault path |
| `AutofillHelper.kt` | View hierarchy parser (username/password field detection) |
| `DomainMatcher.kt` | Domain normalization (PSL) + package→domain mappings |
| `LoginSessionCache.kt` | Short-lived (~60 s) username session cache (web multi-step flows) |
| `VaultItemEntity.kt` | Room entity; `password` field (column: `encrypted_password`) |
| `VaultRepository.kt` | DAO wrapper |
| `VaultBridgePlugin.kt` | Capacitor bridge receiving plaintext sync from JS |
| `store.ts` | JS-side `syncToNativeVault()` — syncs on unlock and on every vault mutation |
