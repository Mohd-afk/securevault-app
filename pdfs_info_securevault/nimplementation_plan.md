# Architectural Fix — Vault Decryption Strict Separation

The previous patch treated the issue as a cosmetic control flow bug. The root architectural flaw is that **vault decryption was happening inside the authentication layer ([AuthScreen.tsx](file:///d:/PYTHON/Password%20Manager/src/app/components/AuthScreen.tsx)).** 

This violates the fundamental separation of concerns in a zero-knowledge architecture:
1. **Layer 1 (AuthScreen):** Authenticates the account identity (Firebase UID) using a derived key or Google OAuth. **It must never decrypt vault data.**
2. **Layer 2 (LockScreen):** Handles the vault encryption/decryption lifecycle using the master password. 

Because [AuthScreen](file:///d:/PYTHON/Password%20Manager/src/app/components/AuthScreen.tsx#49-733) was decrypting the vault (`await unlockVault(password)`), the keys were loaded into memory outside the designated [LockScreen](file:///d:/PYTHON/Password%20Manager/src/app/components/LockScreen.tsx#21-191) boundaries, creating race conditions and session mismatches depending on the entry path (Google vs Email).

## Proposed Changes

### 1. AppShell Component

**Remove the `shouldAutoUnlock` bypass completely.** [AppShell](file:///d:/PYTHON/Password%20Manager/src/app/components/AppShell.tsx#13-180) will now rigidly enforce that ANY authentication event routes the user to the [LockScreen](file:///d:/PYTHON/Password%20Manager/src/app/components/LockScreen.tsx#21-191) to manage their vault state.

```diff
-  if (!user || magicLinkActive) {
-    return <AuthScreen onAuthenticated={(shouldAutoUnlock?: boolean) => {
-      setMagicLinkActive(false);
-      setUser(auth.currentUser);
-      if (shouldAutoUnlock) {
-        setUnlocked(true);
-      }
-    }} />;
-  }
+  if (!user || magicLinkActive) {
+    return <AuthScreen onAuthenticated={() => {
+      // Completed account authentication ONLY
+      setMagicLinkActive(false);
+      setUser(auth.currentUser);
+      // Force LockScreen to handle ANY vault decryption/interaction
+      setUnlocked(false); 
+    }} />;
+  }
```

---

### 2. AuthScreen Component

**Remove [unlockVault()](file:///d:/PYTHON/Password%20Manager/src/app/store.ts#306-377) from [handleLogin](file:///d:/PYTHON/Password%20Manager/src/app/components/AuthScreen.tsx#126-151).** Update all `onAuthenticated()` calls to pass no arguments, as auto-unlocking is completely eliminated. 

```diff
 // In handleLogin():
             const authKey = await deriveAuthKey(password, email);
             await signInWithDerivedKey(email, authKey);
 
-            // Load and decrypt vault data from cloud so it's ready immediately
-            await unlockVault(password);
             log.info('Login successful');
-            onAuthenticated(true);
+            onAuthenticated();
```

All other paths ([handleGoogleSignIn](file:///d:/PYTHON/Password%20Manager/src/app/components/AuthScreen.tsx#196-236), [handleSetupMaster](file:///d:/PYTHON/Password%20Manager/src/app/components/AuthScreen.tsx#283-350)) will also simply call `onAuthenticated()`. 

> **Implication for UX vs Security:** By strictly separating these layers, a user signing in with Email + Master Password via [AuthScreen](file:///d:/PYTHON/Password%20Manager/src/app/components/AuthScreen.tsx#49-733) will authenticate the Firebase session, but then immediately land on the [LockScreen](file:///d:/PYTHON/Password%20Manager/src/app/components/LockScreen.tsx#21-191) where they must enter their master password *again* to actually decrypt the vault. This guarantees that [LockScreen](file:///d:/PYTHON/Password%20Manager/src/app/components/LockScreen.tsx#21-191) is the absolute single source of truth for vault decryption in the application architecture, eliminating race conditions.

### 3. Firebase Provider Linking ([auth.ts](file:///d:/PYTHON/Password%20Manager/src/app/auth.ts) & [AuthScreen.tsx](file:///d:/PYTHON/Password%20Manager/src/app/components/AuthScreen.tsx))

**The Issue:** A user signing up with Google OAuth generates a `google.com` provider credential in Firebase but no `password` credential. When they set their Master Password via [finalizeMasterPasswordSetup](file:///d:/PYTHON/Password%20Manager/src/app/auth.ts#64-84), the previous logic used `updatePassword`. However, `updatePassword` does **not** create a new Email/Password credential for Google-only users. Thus, when the user logged out and tried to sign in with their Email/Master Password later, Firebase rejected it.

**The Fix:**
* Modified [finalizeMasterPasswordSetup](file:///d:/PYTHON/Password%20Manager/src/app/auth.ts#64-84) in [auth.ts](file:///d:/PYTHON/Password%20Manager/src/app/auth.ts) to inspect the user's `providerData`.
* If a `password` provider exists (e.g., Email Magic Link signup), it calls `updatePassword`.
* If the `password` provider is missing (e.g., Google OAuth signup), it uses `linkWithCredential(user, EmailAuthProvider.credential(email, password))` to explicitly link the user's email and new AuthKey as a native Firebase password credential.
* Updated [AuthScreen.tsx](file:///d:/PYTHON/Password%20Manager/src/app/components/AuthScreen.tsx) to pass the `email` field to [finalizeMasterPasswordSetup](file:///d:/PYTHON/Password%20Manager/src/app/auth.ts#64-84).

## Verification Plan

1. **Email Login Flow:** User logs in with email/password → Lands on LockScreen → Enters password again → Vault unlocks.
2. **Google Login Flow:** User logs in with Google → Lands on LockScreen → Enters password → Vault unlocks.
3. **Provider Cross-Pollination (Bug 3):** 
   - Sign up with Google OAuth.
   - Enter Master Password (automatically links Email/Password credential behind the scenes).
   - Log out.
   - Sign back in using the **Email/Password** form with the Master Password. The login must succeed.
4. No vault data is ever fetched or decrypted during the [AuthScreen](file:///d:/PYTHON/Password%20Manager/src/app/components/AuthScreen.tsx#49-733) lifecycle.
