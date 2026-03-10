# SecureVault Phase 2 — Implementation Plan

## Goal

Migrate SecureVault from a local-only password manager to a cloud-enabled app with:

1. **Firebase Authentication** — Email+password with email verification (OTP-like), Google Sign-In
2. **Remember Me / Quick Unlock** — Persistent sessions; returning users only need master password (biometric future-proofed)
3. **Real-Time Sync** — Firestore-backed encrypted vault that syncs across devices
4. **Free Domain** — Continue using Vercel's `.vercel.app` domain (already deployed)
5. **CSV Import** — Import passwords from Chrome's CSV export format
6. **Firebase for everything** — Auth, database, hosting (optional) all through Firebase

## User Review Required

> [!IMPORTANT]
> **Firebase Project Setup Required**: You'll need to create a Firebase project in the [Firebase Console](https://console.firebase.google.com/) and provide the config keys. I'll guide you through this during implementation.

> [!IMPORTANT]
> **Email Verification vs True OTP**: Firebase Auth supports email verification links (click-to-verify) out of the box. True 6-digit OTP codes sent via email require a custom backend (Firebase Cloud Functions). I'll implement email verification links first since they're free and serverless. If you want numeric OTP codes later, that would require a Cloud Function + email service (SendGrid/etc). Let me know if this approach works.

> [!WARNING]
> **Data Migration**: Phase 1 users have data in localStorage only. The migration path will be: user signs up → existing local vault gets uploaded to Firestore as encrypted blob. After that, sync takes over.

---

## Architecture Overview

```mermaid
graph TB
    subgraph "Client (React + Vite)"
        A[AuthScreen] -->|Sign Up/Login| B[Firebase Auth]
        A -->|Google Sign-In| B
        B -->|Authenticated| C[AppShell]
        C -->|Master Password| D[Vault Unlock]
        D --> E[PasswordList / ItemDetail / etc.]
    end

    subgraph "Firebase"
        B
        F[Firestore]
    end

    D -->|Read/Write Encrypted Data| F
    F -->|onSnapshot Real-Time| D

    subgraph "Data Flow"
        G[VaultItem[]] -->|Encrypt with Master PW| H[EncryptedPayload]
        H -->|Store in| F
        F -->|Fetch| H
        H -->|Decrypt with Master PW| G
    end
```

**Key Principle**: Vault data is **always encrypted client-side** with the user's master password before being sent to Firestore. Firebase never sees plaintext passwords.

---

## Proposed Changes

### 1. Firebase Core Setup

#### [NEW] [firebase.ts](file:///d:/PYTHON/Password%20Manager/src/app/firebase.ts)

Initialize Firebase app, Auth, and Firestore instances. Reads config from environment variables.

```typescript
// Firebase app initialization
// Exports: app, auth, db
```

#### [NEW] [.env](file:///d:/PYTHON/Password%20Manager/.env)

Firebase configuration keys (gitignored). User will fill these from Firebase Console.

#### [MODIFY] [vite.config.ts](file:///d:/PYTHON/Password%20Manager/vite.config.ts)

No changes needed — Vite supports `import.meta.env.VITE_*` out of the box.

#### [MODIFY] [.gitignore](file:///d:/PYTHON/Password%20Manager/.gitignore)

Add `.env` to gitignore.

---

### 2. Authentication System

#### [NEW] [auth.ts](file:///d:/PYTHON/Password%20Manager/src/app/auth.ts)

Auth helper module with:
- `signUpWithEmail(email, password)` — creates account + sends verification email
- `signInWithEmail(email, password)` — signs in + checks email verified
- `signInWithGoogle()` — popup-based Google auth
- `signOut()` — Firebase sign out
- `onAuthChange(callback)` — auth state observer
- `getCurrentUser()` — get current Firebase user

#### [NEW] [AuthScreen.tsx](file:///d:/PYTHON/Password%20Manager/src/app/components/AuthScreen.tsx)

New authentication screen with three states:
1. **Sign Up**: Email + password fields → create account → show "check your email" message
2. **Sign In**: Email + password fields → sign in → verify email is confirmed → proceed
3. **Verify Email**: "We sent a verification link to your email" with a resend button + "I've verified" button

Includes a "Sign in with Google" button with the Google icon.

Follows the existing design system (dark surfaces, cyan accent, rounded-xl, etc).

#### [MODIFY] [AppShell.tsx](file:///d:/PYTHON/Password%20Manager/src/app/components/AppShell.tsx)

Refactor the shell to have a **two-gate system**:
1. **Gate 1 — Auth Gate**: If no Firebase user → show `AuthScreen`
2. **Gate 2 — Lock Gate**: If authenticated but vault locked → show [LockScreen](file:///d:/PYTHON/Password%20Manager/src/app/components/LockScreen.tsx#16-140)

For "Remember Me" (default on), Firebase's `browserLocalPersistence` keeps the session across browser restarts. So returning users skip Gate 1 and go straight to Gate 2 (master password).

#### [MODIFY] [LockScreen.tsx](file:///d:/PYTHON/Password%20Manager/src/app/components/LockScreen.tsx)

- Add a "Sign Out" link at the bottom for returning users who want to switch accounts
- Add user's email display at the top so they know which account they're unlocking
- First-time setup (no master password hash yet) → create vault encryption key
- Keep existing master password verify flow for returning users

---

### 3. Firestore Data Layer & Real-Time Sync

#### [NEW] [firestore.ts](file:///d:/PYTHON/Password%20Manager/src/app/firestore.ts)

Firestore sync module:

**Data Structure in Firestore:**
```
users/{uid}/
  vault: {
    encryptedPayload: string  // JSON of EncryptedPayload
    masterHash: string        // JSON of StoredMasterHash
    updatedAt: Timestamp
  }
  settings: {
    autoLockTimeout: number
    lockOnHide: boolean
  }
```

**Functions:**
- `saveVaultToCloud(uid, encryptedPayload)` — write encrypted vault
- `loadVaultFromCloud(uid)` — read encrypted vault
- `subscribeToVault(uid, callback)` — `onSnapshot` listener for real-time sync
- `saveMasterHashToCloud(uid, hash)` — store master password hash
- `loadMasterHashFromCloud(uid)` — load master password hash
- `saveSettingsToCloud(uid, settings)` — sync settings
- `loadSettingsFromCloud(uid)` — load settings

#### [MODIFY] [store.ts](file:///d:/PYTHON/Password%20Manager/src/app/store.ts)

Major refactor:
- All CRUD operations now write to **both** localStorage (cache) and Firestore (cloud)
- On unlock, load from Firestore first, fall back to localStorage
- [setupMasterPassword](file:///d:/PYTHON/Password%20Manager/src/app/store.ts#71-79) → also saves hash to Firestore
- [verifyMasterPassword](file:///d:/PYTHON/Password%20Manager/src/app/store.ts#80-97) → loads hash from Firestore (with localStorage fallback)
- Add `subscribeToVaultChanges()` — starts Firestore `onSnapshot` that updates the local cache when changes come from other devices
- Add `migrateLocalToCloud()` — one-time migration of localStorage data to Firestore for existing Phase 1 users

---

### 4. CSV Import

#### [MODIFY] [Settings.tsx](file:///d:/PYTHON/Password%20Manager/src/app/components/Settings.tsx)

Add a new "Data" section with:
- **Import Passwords** button — opens file picker for `.csv`
- CSV parser that handles Chrome's export format: `name,url,username,password`
- Preview count: "Found X passwords. Import all?"
- Bulk-adds parsed items as VaultItems
- Success/error toast notifications via Sonner

---

### 5. Route Updates

#### [MODIFY] [routes.ts](file:///d:/PYTHON/Password%20Manager/src/app/routes.ts)

No new routes needed — the auth flow is handled inside [AppShell](file:///d:/PYTHON/Password%20Manager/src/app/components/AppShell.tsx#6-77) as a gate, not as a separate route. This is simpler and prevents users from navigating to `/auth` manually when already signed in.

---

### 6. Header & Sign-Out

#### [MODIFY] [PasswordList.tsx](file:///d:/PYTHON/Password%20Manager/src/app/components/PasswordList.tsx)

Add user avatar/initial in the header that shows the signed-in account. Tapping shows a small menu with "Sign Out" option.

---

## File Change Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/app/firebase.ts` | NEW | Firebase initialization |
| `src/app/auth.ts` | NEW | Auth helper functions |
| `src/app/firestore.ts` | NEW | Firestore sync layer |
| `src/app/components/AuthScreen.tsx` | NEW | Login/signup UI |
| `.env` | NEW | Firebase config (gitignored) |
| [.gitignore](file:///d:/PYTHON/Password%20Manager/.gitignore) | MODIFY | Add .env |
| [src/app/store.ts](file:///d:/PYTHON/Password%20Manager/src/app/store.ts) | MODIFY | Dual storage (local + cloud) |
| [src/app/components/AppShell.tsx](file:///d:/PYTHON/Password%20Manager/src/app/components/AppShell.tsx) | MODIFY | Auth gate + lock gate |
| [src/app/components/LockScreen.tsx](file:///d:/PYTHON/Password%20Manager/src/app/components/LockScreen.tsx) | MODIFY | Show email, add sign-out |
| [src/app/components/Settings.tsx](file:///d:/PYTHON/Password%20Manager/src/app/components/Settings.tsx) | MODIFY | CSV import, sign-out |
| [src/app/components/PasswordList.tsx](file:///d:/PYTHON/Password%20Manager/src/app/components/PasswordList.tsx) | MODIFY | User display in header |
| [package.json](file:///d:/PYTHON/Password%20Manager/package.json) | MODIFY | Add firebase dependency |

---

## Verification Plan

### Build Verification
- Run `npm run build` to ensure TypeScript compilation succeeds with no errors

### Browser Testing (Manual — I'll walk through these with you)

1. **Sign Up Flow**: Open app → AuthScreen appears → enter email + password → click Sign Up → "check email" screen appears → verify email → return to app → click "I've verified" → proceed to LockScreen → create master password → vault loads with sample data

2. **Sign In Flow**: Refresh page (or sign out first) → AuthScreen → enter credentials → sign in → LockScreen → enter master password → vault unlocks

3. **Google Sign-In**: Click "Sign in with Google" → Google popup → select account → proceed to LockScreen

4. **Remember Me**: Close browser tab → reopen app → should skip AuthScreen, go directly to LockScreen (master password required)

5. **Real-Time Sync**: Open app in two browser tabs → add an item in tab 1 → item appears in tab 2 automatically

6. **CSV Import**: Settings → Import Passwords → select a Chrome CSV file → passwords appear in vault

7. **Sign Out**: Settings → Sign Out → returns to AuthScreen → sign in again → vault data persists from Firestore

> [!NOTE]
> For testing, you'll need a Firebase project with Authentication (Email/Password + Google) and Firestore enabled. I'll guide you through the Firebase Console setup when we start implementation.
