# Autofill Not Showing — Root Cause Analysis & Fix Plan

## The Problem

Autofill is set as default, biometrics is configured, but **no autofill suggestion ever shows up** in any app or browser.

---

## Root Causes Found (5 separate bugs)

### 🔴 Bug 1 — FATAL: Password format mismatch between JS and native (PRIMARY CAUSE)

**The #1 reason autofill never works.**

The JS vault stores passwords encrypted with AES-256-GCM using the **web master password key** (PBKDF2-derived from master password). This produces a `base64iv:base64ciphertext` string.

When `VaultBridgePlugin.fullSync()` syncs items to the native SQLite DB, it puts this **JS-encrypted password** (keyed to master password) into `encryptedPassword` in the native DB.

But `SecureVaultAutofillService` tries to decrypt the password using the **biometric DEK** (a completely different 256-bit key from the Android Keystore):

```kotlin
// In SecureVaultAutofillService.kt line 187
val dek = BiometricVaultUnlocker.getUnlockedDek() ← biometric key
val secretKey: Key = SecretKeySpec(dek, "AES")
// Then tries to AES/GCM decrypt the password ← THIS WILL ALWAYS FAIL!
```

The biometric DEK and the JS master-password-derived key are **completely different keys**. AES-GCM decryption with the wrong key **silently throws an exception**, which is caught and swallowed (line 234-237), setting `decryptedPassword = ""`. With an empty password, the `if (decryptedPassword.isNotEmpty())` guard on line 239 means **no password field is ever filled**. The autofill popup shows but fills nothing, or may show then immediately disappear (which the user sees as "not showing").

**The fix:** The native DB must store plaintext passwords (protected by SQLCipher's own key + Android Keystore) so the autofill service can fill directly. The JS side must pass **plaintext** passwords during `fullSync`.

> [!CAUTION]  
> This requires care: passwords are in-memory decrypted on JS side only when vault is unlocked. We pass them decrypted only during sync, never in persistence.

---

### 🔴 Bug 2 — FATAL: The `rawDomain` is `null` for most apps and browsers

In `SecureVaultAutofillService.kt` lines 66-79:

```kotlin
var mappedDomain: String? = null
if (packageName.isNotEmpty()) {
    mappedDomain = domainMatcher.normalize(packageName)  // ← calls normalize("com.android.chrome")
}
val rawDomain = parsed.webDomain ?: mappedDomain
if (rawDomain == null) {
    // ← This fires for EVERY app not in the hardcoded lookup table!
    Log.e(...)
    callback.onSuccess(null)   ← RETURNS NULL = no autofill
    return
}
```

`domainMatcher.normalize("com.android.chrome")` is **not** in `appMappings` → goes through PSL normalize → the PSL parser gets "com.android.chrome" → strips nothing useful → might return `android.chrome` or fail. Result is `mappedDomain = null`.

In Chrome and other browsers, `parsed.webDomain` comes from the WebView and IS correctly set (e.g., `"google.com"`). But for **native apps** (Instagram, Gmail, Twitter app, etc.), `parsed.webDomain` is `null` AND the package isn't in the mapping OR `normalize()` returns null for unknown packages.

**Fix 1a:** For Chrome/Firefox/browsers: `webDomain` is correctly provided by the Android framework — this path already works if fields are detected.  
**Fix 1b:** For native apps: `normalize(packageName)` must return the package name itself when it can't map it — not `null`. There's no reason to abort if we can't normalize; we should fall back to using the raw package name as the domain key.

---

### 🟠 Bug 3 — SIGNIFICANT: Multi-step login security check kills all single-field forms

In `SecureVaultAutofillService.kt` lines 94-107:

```kotlin
} else if (hasPassword && !hasUsername) {
    // It's a password-only page (Step 2). Check the cache.
    cachedUsername = LoginSessionCache.get(normalizedDomain, packageName)
    
    // SECURITY CHECK: If password-only and no cached username context, abort.
    if (cachedUsername == null) {
        callback.onSuccess(null)   ← KILLS IT for Instagram, many banking apps
        return                     ← which only show a password field!
    }
}
```

Many apps (Instagram, banking apps, Twitter) show **a single password field with no username**. The cache TTL is 60 seconds. If the user navigated directly to the password field (didn't pass through a username field first, common in native apps), the cache is empty → autofill is completely suppressed.

**Fix:** The "naked password form" security check is too aggressive for native apps. For non-browser native apps, it should be relaxed to allow filling when the domain matches a vault entry.

---

### 🟡 Bug 4 — MODERATE: `uris` stored as JSON array but queried as string LIKE match

In `VaultDao.kt`:
```kotlin
@Query("SELECT * FROM vault_items WHERE uris LIKE '%' || :domain || '%' AND deleted_at IS NULL")
suspend fun findByDomain(domain: String): List<VaultItemEntity>
```

The `uris` column stores `["https://example.com"]` (a JSON array string). Querying for `domain = "example.com"` → `LIKE '%example.com%'` could false-match `badexample.com`. More importantly, if the vault item was saved with full URL `https://login.example.com/auth`, the query for `example.com` will still match. That's fine. But if the entry was saved from a native app with `uris = "[]"` (empty array, as in `VaultBridgePlugin.kt` line 42: `val urisString = urisArray?.toString() ?: "[]"`), the query for any domain will **never match**.

Items synced from JS with `url = ""` become `uris = "[]"` in native → no match → never suggested for autofill.

---

### 🟡 Bug 5 — MODERATE: `autofillHints` check is wrong for Chrome WebView fields

In `AutofillHelper.kt` lines 61-65:
```kotlin
if (node.autofillHints?.contains(android.view.View.AUTOFILL_HINT_USERNAME) == true ...
```

`AUTOFILL_HINT_USERNAME = "username"` and `AUTOFILL_HINT_EMAIL_ADDRESS = "email"` are valid. However, Chrome and WebView-based browsers **rarely populate autofillHints** from web HTML — they rely on `html_info` attributes instead. The heuristic fallback (Layer 4/5) should catch this, but the `htmlType == "text" && usernameKeywords.any { combinedWeb.contains(it) }` check on line 95 has an operator precedence bug:

```kotlin
htmlType == "text" && usernameKeywords.any { combinedWeb.contains(it) }
// This is parsed as:
(htmlType == "email") || ((htmlType == "text") && (usernameKeywords.any {...}))
// The || on line 94 binds the whole right side — OK actually
```

Actually this specific line is fine. The real issue is that `htmlType == "text"` is an extremely broad match (every generic text input in Chrome), and the filter `usernameKeywords.any { combinedWeb.contains(it) }` may be too strict if the web form doesn't use conventional naming.

---

## Proposed Fixes

### Fix 1 — Password storage: pass plaintext during sync (CRITICAL)

**In `store.ts` `syncToNativeVault()`:** The vault is already unlocked when this is called. Pass the plaintext `password` field directly — the SQLCipher database itself is protected by the Android Keystore key; no second layer of JS encryption is needed.

```typescript
// store.ts syncToNativeVault():
password: i.password || '',   // ← plain, SQLCipher + Android Keystore protects it
```

**In `SecureVaultAutofillService.kt`:** Remove all the `BiometricVaultUnlocker.getUnlockedDek()` / AES-GCM decryption code — just read `item.encryptedPassword` (which is now the plaintext password) and fill it.

Rename the field/column to `password` (or keep `encryptedPassword` for the column name but store plaintext, just updating the comments). The SQLCipher encryption IS the protection for the DB file.

> [!IMPORTANT]
> The `NativeVaultDatabase` uses `SupportFactory(passphrase)` from `DatabaseKeyManager` — the entire `.db` file is AES-256 encrypted by SQLCipher. Storing plaintext passwords inside this encrypted DB is completely correct and is how all major password managers (1Password, Bitwarden) work with their local vaults.

### Fix 2 — Domain resolution: don't abort on unmapped packages

**In `SecureVaultAutofillService.kt`:** When `rawDomain` is null because the package isn't mapped, fall back to using the package name itself as the lookup key. The `VaultDao.findByDomain()` LIKE query will then look for entries with the package name in their URI — which works if the user saved a credential with the app package as the URI.

```kotlin
val rawDomain = parsed.webDomain ?: packageName.ifEmpty { null }
// Don't abort if webDomain is null — use the package name as domain
```

Also add Chrome (`com.android.chrome`) and other common browsers to `appMappings` — but even better: don't block filling just because we can't map the package.

### Fix 3 — Relax the "naked password" security check

For native apps (non-webDomain), skip the `LoginSessionCache` check — there's no multi-step web flow concern.

```kotlin
val isWebContext = parsed.webDomain != null
if (hasPassword && !hasUsername && isWebContext) {  // Only enforce for web forms
    // check cache
}
```

### Fix 4 — Handle items with empty URIs

Items from the vault with no URL (`url = ""`) get `uris = "[]"` in native. Autofill can't match them.

Two-part fix:
1. **In `syncToNativeVault()`:** If `url` is empty, use the item `title` as the URI (it's often the domain/app name).
2. **In `VaultDao`:** Enhanced query that also matches by title.

---

## Files to Change

### [MODIFY] `store.ts`
- In `syncToNativeVault()`: pass plaintext `password` instead of the JS-encrypted string
- In `syncToNativeVault()`: use `title` as fallback URI when `url` is empty

### [MODIFY] `SecureVaultAutofillService.kt`
- Remove biometric DEK decryption block — read password directly from `encryptedPassword` field (which now holds plaintext protected by SQLCipher)
- Fix `rawDomain` null handling — use `packageName` as fallback, don't abort
- Relax "naked password" security check to only apply in web contexts

### [MODIFY] `VaultDao.kt`
- Add `OR title LIKE '%' || :domain || '%'` to `findByDomain` query as secondary fallback

### [MODIFY] `VaultItemEntity.kt` _(optional rename for clarity)_
- Rename/comment `encryptedPassword` → document it holds plaintext (SQLCipher encrypts the DB)

### [MODIFY] `DomainMatcher.kt`
- Add more browser package mappings (`com.android.chrome`, `org.mozilla.firefox`, `com.microsoft.emmx`, etc.)

---

## Verification Plan

1. Build and install debug APK
2. Open SecureVault, unlock vault — this triggers `syncToNativeVault(plaintext)`
3. Open Chrome, navigate to google.com login — should show "Unlock SecureVault" or credential suggestions
4. Open Instagram — should show credential suggestions (package not in mapping but domain fallback works)
5. Check `adb logcat -s SecureVaultAutofill` for log output confirming fill
