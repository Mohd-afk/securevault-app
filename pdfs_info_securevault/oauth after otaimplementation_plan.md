# Fix Biometric Unlock Flow

The current implementation has two significant issues with the Biometric flow:
1. **Wrong Location:** Biometric unlock is currently placed in the Account Login screen (`AuthScreen.tsx`). When triggered, it successfully decrypts the vault but fails to sign the user into Firebase Auth, causing an immediate redirect back to the login page.
2. **State Mismanagement:** When using biometrics, we obtain the encryption key directly (`_sessionCryptoKey`) but not the original master password (`_sessionPassword`). Most vault operations in `store.ts` incorrectly assume that an empty `_sessionPassword` means the vault is locked and throw "Vault is locked" errors despite the vault being successfully decrypted via `_sessionCryptoKey`.

## Proposed Changes

### 1. `src/app/store.ts`

#### [MODIFY] store.ts
- Introduce an `isVaultUnlocked()` helper that checks: `return !!_sessionPassword || !!_sessionCryptoKey;`.
- Replace all instances of `if (!_sessionPassword) throw new Error('Vault is locked');` with `if (!isVaultUnlocked()) throw new Error('Vault is locked');`.
- Replace `if (!_sessionPassword) return;` with `if (!isVaultUnlocked()) return;` for background sync methods like `syncToCloud` and `checkAndMergeAutofillItems`.
- Update function calls to `saveVaultEverywhere(items, _sessionPassword || '');` to ensure the empty string is passed gracefully when `_sessionPassword` is null. `saveVaultEverywhere` already short-circuits using `_sessionCryptoKey` so this is safe.

---

### 2. UI Components

#### [MODIFY] `src/app/components/AuthScreen.tsx`
- **Action:** Remove the "Unlock with Biometric" feature.
- **Reason:** `AuthScreen` handles Firebase Account Authentication. Biometric Unlock only decrypts the vault (DEK) and does not perform Firebase authentication.

#### [MODIFY] `src/app/components/LockScreen.tsx`
- **Action:** Implement "Unlock with Biometric" logic here.
- **Reason:** `LockScreen` is strictly responsible for unlocking an existing, configured vault when the user is *already* authenticated.
- **Implementation:** 
  - On mount, if the vault `isSetup`, check `checkBiometricAvailability()`. 
  - If available and enabled (or last used), auto-prompt the biometric dialog via `unlockWithBiometric()`.
  - Add a manual "Unlock with Biometrics" button as a fallback below the master password input.


## Open Questions
- In `LockScreen.tsx`, should we automatically prompt for biometric unlock as soon as the screen loads, or only provide a button? I suggest auto-prompting for convenience, while ignoring user-cancel errors (`ERROR_10`, `ERROR_13`) so they can seamlessly fall back to entering their master password manually.

## Verification
- Test signing in with email/password -> should hit LockScreen.
- In LockScreen, verify Biometric Unlock triggers successfully.
- Ensure that tapping the "Cancel" button on the biometric prompt gracefully falls back to the master password input.
- Validate that adding/editing vault items succeeds *after* unlocking via biometrics (proving that `isVaultUnlocked()` fixed the previous errors).
