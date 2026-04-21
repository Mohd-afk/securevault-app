# Objectives
Diagnose and resolve the four reported production issues affecting the SecureVault Android application:
1. **OTA Update Failure** for existing overriding updates.
2. **Google OAuth 404 Error** on Android 14.
3. **Vault Locking Bug** occurring after new vault setup.
4. **Environment Audit compatibility constraint** regarding the Firebase CLI.

## Proposed Changes

### Issue 1: OTA Update Failure
The OTA application logic relies on `localStorage` state (e.g., `sv_ota_active_version`) to track versions and prevent infinite update loops. However, when users manually install a newer major APK version via GitHub Releases (e.g., v3.0.0 over v2.0.4), the existing OTA `localStorage` values are maintained but desynchronize with the base bundle layer, thus unintentionally skipping actual active OTA updates (e.g., skipping `v3.0.2` if it thinks `v3.0.1` was active).

#### [MODIFY] [updater.ts](file:///d:/PYTHON/Password%20Manager/src/app/services/updater.ts)
- Insert an automatic synchronization migration check at the beginning of `initUpdater()`.
- Compare the current native app version (`App.getInfo().version`) with a dedicated `localStorage` key (`sv_ota_native_version`).
- If a version mismatch is detected, clear the OTA-related variables from `localStorage` (`sv_ota_active_version`, `sv_ota_failed_versions`, `sv_ota_pending_version`, `sv_ota_pending_bundle`) to give the OTA updating service a clean slate to pull updates on top of the new base native binary.

---

### Issue 2: Google OAuth 404 Error
On Android 14, in the event the native Credential Manager fails or gracefully falls back due to missing configurations (e.g. SHA-1 mismatches or Google Play Services unavailability), Capacitor redirects the sign-in intent via a web-based popup through the Firebase JS SDK. If `authDomain` or standard URL routing lacks integration, the redirect fails with a 404 when attempting to route back.

#### [MODIFY] [AndroidManifest.xml](file:///d:/PYTHON/Password%20Manager/android/app/src/main/AndroidManifest.xml)
- To ensure full compliance with default OAuth redirects and Google Sign-in flow handling, append an `intent-filter` into `.MainActivity` to explicitly capture the custom schema `com.mohdj.securevault`. 

---

### Issue 3: Vault Locking Bug
A race condition exists during the vault transition. In `store.ts`, when a new vault is instantiated via `setupInitialVault`, the method accurately encrypts and commits the new empty context locally and into Firestore, but fails to populate the internal volatile session keys (`_sessionCryptoKey`, `_sessionPassword`) into runtime memory. Consequently, when `AuthScreen.tsx` invokes `onAuthenticated()`, `isVaultUnlocked()` evaluates to false—causing the application to immediately navigate the authenticated user to the "Vault is locked" interstitial instead of the open interface.

#### [MODIFY] [store.ts](file:///d:/PYTHON/Password%20Manager/src/app/store.ts)
- Modify `setupInitialVault(password: string)` to hydrate the in-memory session exactly like `unlockVault` does.
- Assign the derived `key`, `password`, and empty cache parameters to `_sessionCryptoKey`, `_sessionPassword`, and `_cachedItems`.

---

### Issue 4: Compatibility Audit
The system development environment has a misconfigured PATH concerning Firebase, throwing "the term 'firebase' is not recognized". Because this prevents project-wide manual audits through the CLI, we will substitute instances of direct `firebase` executing with `npx firebase-tools` or invoke the integrated Firebase MCP server.

## Verification Plan

### Automated Tests
- Build native Android environment configurations to verify no Gradle errors.

### Manual Verification
- Simulate native version bump and execute application logic to watch `sv_ota_*` cache purge.
- Execute native Google login and Vault Setup to ensure immediate progression rather than lock screen redirect.
