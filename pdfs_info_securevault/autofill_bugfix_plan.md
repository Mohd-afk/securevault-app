# Autofill Edge-Case Bug Fixes — Implementation Plan

## Gap Analysis (Current State vs Bugs Doc)

| # | Bug | Status | Notes |
|---|-----|--------|-------|
| 1 | Multi-step login (email page → password page) | ❌ Missing | We assume both fields exist simultaneously |
| 2 | Apps that hide login fields (custom views) | ⚠️ Partial | We check `autofillHints` → `inputType` → `viewId` heuristic, but **no hint text** check |
| 3 | Same domain, multiple accounts | ✅ Done | Already iterate all matches and add multiple `Dataset` entries sorted by MRU |
| 4 | Mobile web vs app package mismatch | ✅ Done | [DomainMatcher.kt](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/autofill/DomainMatcher.kt) has 18-entry `appMappings` table |
| 5 | Login forms inside WebViews | ⚠️ Partial | We extract `node.webDomain`, but no fallback to package map when domain is null |
| — | Security: never auto-fill without user tap | ✅ Done | Android `Dataset` system requires tap by design |
| — | 3 defensive checks (field type, domain confidence, user interaction) | ⚠️ Partial | We verify field type + domain match; no confidence threshold |

---

## Proposed Changes

### Fix 1: Multi-Step Login Session Cache (HIGH priority)

**Problem:** Google, Amazon, Microsoft split login across two pages. Page 2 only has a password field and no username context, so we can't match or we match without knowing which account.

#### [NEW] `LoginSessionCache.kt`
- In-memory `ConcurrentHashMap<String, CachedLogin>` keyed by normalized domain
- `CachedLogin` holds: `username`, `timestamp`, `domain`
- TTL = 60 seconds (configurable)
- Cleaned on each fill or via a scheduled sweep

#### [MODIFY] [SecureVaultAutofillService.kt](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/autofill/SecureVaultAutofillService.kt)
- **In [onFillRequest](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/autofill/SecureVaultAutofillService.kt#45-211)**: After filling a username-only request, cache [(domain → username)](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/security/VaultUnlockManager.kt#16-19) via `LoginSessionCache.put(domain, username)`
- **In [onFillRequest](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/autofill/SecureVaultAutofillService.kt#45-211)**: When only a password field is detected (no username nodes), query `LoginSessionCache.get(domain)` to restore the username context and filter vault matches accordingly
- **In [onSaveRequest](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/autofill/SecureVaultAutofillService.kt#212-289)**: If password page has no username, pull from `LoginSessionCache` before saving

---

### Fix 2: Enhanced Heuristic Field Detection (MEDIUM priority)

**Problem:** Instagram, Snapchat, Uber, banking apps use custom views without standard `autofillHints` or `inputType`. Our parser misses them.

#### [MODIFY] [AutofillHelper.kt](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/autofill/AutofillHelper.kt) → [traverseNode()](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/autofill/AutofillHelper.kt#52-93)
Current detection layers:
1. ✅ `autofillHints`
2. ✅ `inputType`
3. ⚠️ `viewId` heuristic (limited keywords)

Add a **4th layer — hint text & content description heuristic**:

```kotlin
// Layer 4: Check hint text and content description
val hintText = node.hint?.lowercase() ?: ""
val contentDesc = node.contentDescription?.toString()?.lowercase() ?: ""
val combined = "$viewId $hintText $contentDesc"

// Password patterns
if (combined.containsAny("password", "passcode", "pin", "secret", "contraseña")) {
    result.passwordNodes.add(node)
}
// Username patterns  
else if (combined.containsAny("username", "email", "phone", "login", "user id",
                               "account", "e-mail", "correo")) {
    if (isEditableNode(node)) result.usernameNodes.add(node)
}
```

Also add a helper:
```kotlin
private fun isEditableNode(node: ViewNode): Boolean {
    return node.className?.contains("EditText") == true
        || node.className?.contains("TextInputLayout") == true
        || node.htmlInfo?.tag == "input"
        || (node.inputType and InputType.TYPE_CLASS_TEXT) != 0
}
```

---

### Fix 3: WebView Fallback to Package Mapping (LOW priority)

**Problem:** Some apps (Spotify, Discord, banks) load login inside a WebView but Android reports no domain — only the view hierarchy.

#### [MODIFY] [SecureVaultAutofillService.kt](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/autofill/SecureVaultAutofillService.kt) → [onFillRequest()](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/autofill/SecureVaultAutofillService.kt#45-211)
- After `parsed.webDomain ?: packageName`, if `webDomain` is null AND `packageName` is in `DomainMatcher.appMappings`, use the mapped domain instead of the raw package name
- This is already partially handled, but the current code falls through to `packageName` without checking the map

```kotlin
val rawDomain = parsed.webDomain 
    ?: domainMatcher.getAppMapping(packageName) 
    ?: packageName
```

#### [MODIFY] [DomainMatcher.kt](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/autofill/DomainMatcher.kt)
- Expose `fun getAppMapping(packageName: String): String?` to make the lookup explicit

---

### Fix 4: Domain Match Confidence Threshold (LOW priority)

**Problem:** Filling credentials based on a weak/guessed domain match is a phishing vector.

#### [MODIFY] [SecureVaultAutofillService.kt](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/autofill/SecureVaultAutofillService.kt)
- Add a confidence score to the domain matching logic:
  - `1.0` — exact domain match
  - `0.8` — base-domain match (subdomain differs)
  - `0.5` — package-name heuristic guess (no app mapping exists)
- Only fill if confidence ≥ `0.8`
- Log low-confidence matches to telemetry as `UNMATCHED_DOMAIN` with `confidence` metadata

---

## Verification Plan

### Automated
- Unit tests for `LoginSessionCache` (put, get, TTL expiry, clear-on-fill)
- Unit tests for [AutofillHelper](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/autofill/AutofillHelper.kt#9-94) with mock `ViewNode`s that have no `autofillHints` but do have `hint` text
- Unit tests for `DomainMatcher.getAppMapping()`

### Manual (on device)
1. **Multi-step login**: Open Google login in Chrome → enter email → tap Next → verify SecureVault still suggests password
2. **Custom views**: Install Instagram → tap login → verify SecureVault suggestion appears
3. **WebView**: Open Spotify in-app browser login → verify domain is correctly resolved
4. **Confidence**: Save a credential for `example.com`, then visit `evil-example.com` → verify no autofill suggestion

---

## Priority Order

| Phase | Fix | Effort | Impact |
|-------|-----|--------|--------|
| A | Fix 1 — Multi-step login cache | ~2 files, ~80 lines | **High** — affects Google, Amazon, Microsoft |
| B | Fix 2 — Enhanced heuristics | ~1 file, ~30 lines | **Medium** — affects Instagram, Snapchat, banks |
| C | Fix 3 — WebView fallback | ~2 files, ~10 lines | **Low** — improves Spotify, Discord |
| D | Fix 4 — Confidence threshold | ~2 files, ~25 lines | **Low** — security hardening |
