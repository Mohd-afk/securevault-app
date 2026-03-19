# Biometric Unlock Implementation Plan

## Goal
Allow users to unlock the main SecureVault application using their device's built-in biometric hardware (Fingerprint, Face ID, etc.), bypassing the need to type the Master Password every time.

## When and Where Will This Be Implemented?
1. **Configuration (Settings):** Available in `Settings > Security` as a "Biometric Unlock" toggle.
2. **Execution (Login Screen):** Implemented in `AuthScreen.tsx`. When the user opens the application and the vault is locked, the application will detect if biometric unlock is enabled and immediately prompt the user (or provide an "Unlock with Biometrics" button).

## Architecture & Security Model
We must treat the Master Password with extreme care. We cannot simply store it in `localStorage` or `IndexedDB` in plaintext. 
Instead, we will use the OS's native hardware-backed Keystore (Android Keystore / iOS Secure Enclave), which allows us to encrypt a string (the Master Password) such that the OS *requires* a successful biometric authentication before it will decrypt that string.

We will either use a community plugin like `@capacitor-community/native-biometrics` or write our own native Capacitor bridge plugin leveraging the `BiometricPrompt` logic we already built for the Autofill service.

---

## Phased Implementation Steps

### Phase 1: Native Biometric Storage Integration
**File Targets:** `android/.../bridge/BiometricAuthPlugin.kt` (or package json for a community plugin)
- Establish the mechanism to securely store and retrieve a string (the master password) utilizing a biometric-bound Keystore key.
- Provide JavaScript/TypeScript methods: `setCredentials(password)`, `getCredentials()`, `deleteCredentials()`, and `isAvailable()`.

### Phase 2: Settings UI Toggle
**File Targets:** [src/app/components/Settings.tsx](file:///d:/PYTHON/Password%20Manager/src/app/components/Settings.tsx)
- Add a "Biometric Unlock" toggle under the Security section.
- **When toggled ON:** Prompt the user to enter their current master password to verify identity, then call the native `setCredentials()` to bind it to their biometrics.
- **When toggled OFF:** Call `deleteCredentials()` to remove the biometric-bound password from the device entirely.
- State should be preserved in the [AppSettings](file:///d:/PYTHON/Password%20Manager/src/app/store.ts#48-53).

### Phase 3: AuthScreen Integration
**File Targets:** [src/app/components/AuthScreen.tsx](file:///d:/PYTHON/Password%20Manager/src/app/components/AuthScreen.tsx)
- On mount, check if biometric unlock is enabled via Settings *and* if biometric credentials exist on the device.
- If true, display a prominent "Unlock with Biometrics" button (and ideally auto-prompt the user upon launching the app).
- On successful biometric auth, take the decrypted master password returned from the plugin, pass it into the existing [loadVault](file:///d:/PYTHON/Password%20Manager/src/app/store.ts#253-277) / [deriveAuthKey](file:///d:/PYTHON/Password%20Manager/src/app/crypto.ts#90-107) logic, and unlock the vault seamlessly without the user typing anything.
- Fallback: The standard master password input box will always remain visible just in case biometrics fail or the user has wearing gloves/glasses.

---

## User Review Required
Please review this plan. If you approve, please let me know whether you would prefer me to install a pre-built capacitor plugin for this (like `@capacitor-community/native-biometrics`) or if you'd like me to build a custom `BiometricBridgePlugin` in Kotlin reusing our existing native Autofill security mechanisms.
