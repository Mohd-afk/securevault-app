# SecureVault — Phase 1: Production-Grade Security Layer Implementation Plan

> **Scope:** Foundational backend security layer with zero-trust enforcement  
> **Status:** Awaiting review  
> **Generated:** 2026-03-20

---

## Executive Summary

This plan addresses the **critical gap** between SecureVault's strong client-side cryptography (Argon2id, AES-256-GCM, dual-key architecture) and its **completely absent backend enforcement**. Currently, ALL database operations flow directly from the client to Firestore with only Security Rules-based protection — meaning security is one misconfigured rule away from a total breach.

This plan introduces **Cloud Functions as the mandatory backend control layer**, **Firebase App Check for client attestation**, hardened **Firestore Security Rules**, and server-side **rate limiting and input validation** — turning SecureVault from a client-trusting app into a zero-trust system.

---

## Current State Assessment (What ChatGPT Missed)

ChatGPT's output (chatp2.md) was **structurally correct** but **generically authored**. It did not account for:

| Gap | Reality |
|---|---|
| **Existing crypto layer** | SecureVault already uses Argon2id + AES-GCM + dual-key + secret scrubbing. ChatGPT re-explained this from scratch as if nothing existed. |
| **No `functions/` directory** | There is literally zero backend code. The entire app is client → Firestore direct. ChatGPT didn't call this out as the #1 priority. |
| **Client-only rate limiting** | [rateLimit.ts](file:///D:/PYTHON/Password%20Manager/src/app/utils/rateLimit.ts) uses `localStorage` — an attacker can clear it or bypass entirely via DevTools. ChatGPT mentioned rate limiting but didn't audit the existing code. |
| **Firestore rules are permissive** | `allow read, write: if request.auth != null && request.auth.uid == userId` — no schema validation, no size limits, no write-rate constraints. |
| **Password storage confusion** | ChatGPT discussed hashing master passwords (Argon2/bcrypt), but SecureVault is a **password manager** — user vault passwords are **encrypted** (AES-GCM), NOT hashed. Only the master password verification uses Argon2id-derived key comparison. This is a critical distinction. |
| **Missing App Check entirely** | [firebase.ts](file:///D:/PYTHON/Password%20Manager/src/app/firebase.ts) doesn't import or initialize App Check at all. |

---

# 1. SYSTEM ARCHITECTURE

## Current (Insecure) Data Flow

```
[ Client (Web / Android) ]
        |
        |  HTTPS (Firebase SDK Direct)
        v
[ Firestore ] ← protected ONLY by Security Rules
[ Firebase Auth ] ← rate limiting is client-side only
```

**Trust boundary violation:** The client directly writes to Firestore. Any authenticated user can craft arbitrary writes to their own document subtree.

## Target (Zero-Trust) Data Flow

```
[ Client (Web / Android) ]
        |
        |  (HTTPS + App Check Token + Auth ID Token)
        v
[ Cloud Functions v2 (API Gateway Layer) ]
   ├── Verify App Check token (is this a real app?)
   ├── Verify Auth ID token (who is this user?)
   ├── Validate input schema (Zod)
   ├── Server-side rate limiting (Firestore-backed)
   ├── Execute business logic
        |
        |  (Admin SDK — FULL ACCESS, bypasses rules)
        v
[ Firestore ] ← Rules locked to DENY direct client access for sensitive ops
[ Cloud Logging ] ← All security events logged
```

## Trust Boundaries (Explicit)

| Layer | Trust Level | Justification |
|---|---|---|
| Client (Web/Android) | ❌ **NEVER** | JavaScript can be modified, DevTools can intercept, APK can be decompiled |
| Firebase Security Rules | ⚠️ **Partial** | Defense-in-depth only; NOT the primary enforcement layer |
| Cloud Functions | ✅ **Trusted** | Server-side code the attacker cannot modify; primary enforcement point |
| Firestore (via Admin SDK) | ✅ **Trusted** | Accessed only through validated Cloud Functions |
| Firebase Auth tokens | ✅ **Trusted** | Cryptographically signed by Google; verified server-side |
| App Check tokens | ⚠️ **Reduces abuse** | Attests client legitimacy; not a security guarantee against determined attackers |

---

# 2. COMPONENT-BY-COMPONENT IMPLEMENTATION

---

## Component 1: Cloud Functions (Backend Control Layer)

### A. Purpose
- Act as the **sole gateway** between the client and sensitive Firestore data
- Enforce authentication, app attestation, input validation, and rate limiting at the server level
- Remove the ability for clients to directly write vault data, preventing injection and data corruption

### B. Implementation Steps

**1. Initialize Firebase Functions**
```bash
# From project root
firebase init functions
# Choose: TypeScript, ESLint, install dependencies
```

This creates `functions/` with `src/index.ts`, `package.json`, `tsconfig.json`.

**2. Core Dependencies**
```bash
cd functions
npm install firebase-admin firebase-functions zod rate-limiter-flexible
```

**3. Callable Functions to Create**

| Function | Purpose | Replaces |
|---|---|---|
| [saveVault](file:///D:/PYTHON/Password%20Manager/src/app/firestore.ts#83-96) | Encrypt-validated vault write | Direct `setDoc` to vault |
| [loadVault](file:///D:/PYTHON/Password%20Manager/src/app/firestore.ts#97-114) | Authenticated vault read | Direct `getDoc` from vault |
| `deleteVault` | Full account data deletion | Direct `deleteDoc` |
| [saveSettings](file:///D:/PYTHON/Password%20Manager/src/app/firestore.ts#150-161) | Settings write with schema validation | Direct `setDoc` to settings |
| [registerEmail](file:///D:/PYTHON/Password%20Manager/src/app/firestore.ts#64-74) | Email hash registration | Direct client write |
| [claimUsername](file:///D:/PYTHON/Password%20Manager/src/app/firestore.ts#208-219) | Atomic username claim with server validation | Direct `writeBatch` |
| [changeUsername](file:///D:/PYTHON/Password%20Manager/src/app/firestore.ts#235-247) | Atomic username swap | Direct `writeBatch` |

**4. Base Function Template (All functions follow this pattern)**

```typescript
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { z } from "zod";

export const saveVault = onCall(
  {
    enforceAppCheck: true,     // ← CRITICAL: Block non-genuine clients
    region: "asia-south1",
    memory: "256MiB",
    maxInstances: 100,         // ← Prevent runaway scaling / DDoS costs
  },
  async (request) => {
    // 1. Auth enforcement
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }
    const uid = request.auth.uid;

    // 2. Input validation (Zod schema)
    const schema = z.object({
      encryptedPayload: z.string().min(1).max(5_000_000), // 5MB max
      masterHash: z.string().min(1).max(1000),
    });
    const parsed = schema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError("invalid-argument", "Invalid vault data format.");
    }

    // 3. Server-side rate limiting (see Component 6)
    await enforceRateLimit(uid, "saveVault", { maxPerMinute: 30 });

    // 4. Write via Admin SDK (bypasses rules — WE are the rules now)
    const db = getFirestore();
    await db.doc(`users/${uid}/data/vault`).set({
      encryptedPayload: parsed.data.encryptedPayload,
      masterHash: parsed.data.masterHash,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { success: true };
  }
);
```

### C. Security Design Decisions

| Decision | Why |
|---|---|
| **Callable Functions only** (no raw HTTPS) | Callable functions auto-parse Auth context and App Check; raw HTTPS endpoints require manual header parsing and are more error-prone |
| **`enforceAppCheck: true`** on every function | Without this, anyone with Postman and a valid JWT can hit your API |
| **Zod for validation** | Type-safe, composable, throws structured errors. Prevents injection of unexpected fields |
| **`maxInstances` cap** | Prevents an attacker from scaling your billing to infinity |
| **Admin SDK (not client SDK)** | Functions bypass Firestore rules — they ARE the rules |

### D. Failure Cases

| Misconfiguration | Consequence |
|---|---|
| ❌ Missing `enforceAppCheck` | Bots and scripts hit API freely |
| ❌ No `request.auth` check | Public API disguised as private |
| ❌ No Zod validation | Arbitrary JSON injected into Firestore |
| ❌ No `maxInstances` | $10,000 surprise GCP bill from DDoS |
| ❌ Using `onRequest` instead of `onCall` | Must manually parse auth headers, easy to skip |

---

## Component 2: Firebase App Check (Client Attestation)

### A. Purpose
- Verify that API requests originate from the **genuine SecureVault app**, not scripts/bots/Postman
- App Check ≠ authentication. It answers "is this a real app?" not "who is this user?"

### B. Implementation Steps

**1. Enable App Check in Firebase Console**
- Go to Firebase Console → App Check
- Register providers:
  - **Web:** reCAPTCHA Enterprise (requires creating a reCAPTCHA Enterprise key in GCP)
  - **Android:** Play Integrity API

**2. Client-Side Initialization ([firebase.ts](file:///D:/PYTHON/Password%20Manager/src/app/firebase.ts))**

```typescript
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';

// Initialize App Check AFTER initializeApp()
const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider(
    import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY
  ),
  isTokenAutoRefreshEnabled: true,
});
```

**3. Debug Token for Development**
```typescript
if (import.meta.env.DEV) {
  // @ts-ignore — Firebase debug token for local development
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}
```

**4. Enforce on All Cloud Functions** (already done via `enforceAppCheck: true`)

**5. Enforce on Firestore Rules** (defense-in-depth)
```
allow read, write: if request.auth != null
  && request.auth.uid == userId
  && request.appCheckToken != null;  // ← ADD THIS
```

### C. Security Design Decisions

| Decision | Why |
|---|---|
| reCAPTCHA Enterprise (not v3) | Enterprise is the current recommended provider; v3 is deprecated for App Check |
| `isTokenAutoRefreshEnabled: true` | Avoids token expiry-related failures |
| **Still require Auth** | App Check proves "legitimate app," Auth proves "legitimate user." Both are required. |

### D. Failure Cases

| Misconfiguration | Consequence |
|---|---|
| ❌ App Check initialized but not enforced on functions | Provides zero protection |
| ❌ Confusing App Check with Auth | Catastrophic: "The app is real" ≠ "the user is authorized" |
| ❌ Hardcoded reCAPTCHA key in source | Not a security risk per se (keys are public), but should use env vars for flexibility |
| ❌ Missing debug token in dev | Cannot test locally |

---

## Component 3: Authentication System (Hardening)

### A. Purpose
- The existing Firebase Auth setup works but lacks server-side token verification and MFA

### B. Implementation Steps (Incremental)

**1. Server-Side Token Verification (Already handled by Callable Functions)**
- `onCall` automatically verifies the ID token before passing `request.auth`
- No additional code needed — this is why we use `onCall` not `onRequest`

**2. Enable MFA (Phase 1.5 — recommended but optional for initial deploy)**
- Requires Firebase Identity Platform upgrade
- SMS-based TOTP as second factor
- Blocking functions to enforce MFA on sensitive operations

**3. Custom Claims (Future Phase)**
- `admin` claim for potential admin dashboard
- `tier` claim for future paid tiers

### C. Security Design Decisions

| Decision | Why |
|---|---|
| NO custom token minting | Firebase's built-in Auth tokens (JWTs) are sufficient; custom minting adds complexity and attack surface |
| Short token expiry (1 hour, Firebase default) | Limits window of stolen token reuse |
| Token revocation via `tokenVersion` | Already implemented in device session tracking — forces re-auth |

### D. Token Flow

```
User enters master password
  → Argon2id derives auth key (client-side)
  → signInWithEmailAndPassword(email, authKey)
  → Firebase issues ID Token (JWT, 1hr expiry)
  → App Check issues attestation token

Every API call:
  → ID Token + App Check Token → Cloud Function
  → Function verifies both before executing
```

### E. Failure Cases

| Misconfiguration | Consequence |
|---|---|
| ❌ Trusting `uid` from client-submitted data | Impersonation — attacker sets uid to another user's |
| ❌ Not handling token expiry gracefully | UX failures when token expires mid-session |
| ❌ No token revocation check | Stolen tokens remain valid for full hour |

---

## Component 4: Encryption System (Audit & Gaps)

### A. Current State (STRONG — No Changes Needed)

The existing encryption system is already production-grade:

| Aspect | Implementation | Status |
|---|---|---|
| Key Derivation | Argon2id (64MB, 3 iterations) | ✅ Excellent |
| Vault Encryption | AES-256-GCM | ✅ Industry standard |
| Key Separation | Auth key ≠ Encryption key (different salts) | ✅ Zero-knowledge |
| Memory Scrubbing | `Uint8Array` + explicit `fill(0)` | ✅ Best-effort in JS |
| Key Extractability | `CryptoKey { extractable: false }` | ✅ Locked in WebCrypto |

### B. What an Attacker Sees if They Dump Firestore

```json
{
  "encryptedPayload": "{\"ciphertext\":\"base64...\",\"iv\":\"base64...\"}",
  "masterHash": "{\"hash\":\"base64...\",\"salt\":\"base64...\"}"
}
```

They **cannot** decrypt without the user's master password. The server never sees the raw DEK. This is true zero-knowledge architecture.

### C. Key Insight (ChatGPT Said It Right)

> If your backend can decrypt everything, you built Google Drive, not SecureVault.

SecureVault's encryption key never leaves the client (or Android Keystore for biometrics). The backend is a dumb blob store. **This is correct and should not change.**

### D. One Gap: IV Reuse Risk

The current [generateIV()](file:///D:/PYTHON/Password%20Manager/src/app/crypto.ts#45-48) uses `crypto.getRandomValues(new Uint8Array(12))`. With a 96-bit random IV, after ~2^32 encryptions the birthday paradox makes collision probable. For a password manager this is practically impossible (billions of saves), but **documenting this limit** is good practice.

---

## Component 5: Password Storage Logic (Clarification)

### A. Critical Distinction ChatGPT Got Wrong

SecureVault is a **password manager**. There are TWO types of "passwords":

| Password Type | How It's Handled | Correct Approach |
|---|---|---|
| **Master Password** | Argon2id → derive auth key + encryption key. The auth key is used to authenticate with Firebase. A verification hash is stored for local comparison. | ✅ Already implemented correctly |
| **Vault Passwords** (stored credentials) | **Encrypted** with AES-256-GCM using the derived encryption key. Stored as an encrypted blob. | ✅ Correct — these MUST be reversible (user needs to see/copy them) |

ChatGPT's section on "why NOT to use encryption for passwords" applies to **server-side user authentication** (like Django/Rails login systems), NOT password managers. For a vault, encryption is the **only correct approach**.

### B. Brute-Force Protection (What Needs to Change)

**Current (Client-Side Only — Insecure):**
- [rateLimit.ts](file:///D:/PYTHON/Password%20Manager/src/app/utils/rateLimit.ts) stores failed attempts in `localStorage`
- Attacker can: `localStorage.clear()` → unlimited attempts

**Target (Server-Side Enforcement):**
- Cloud Function tracks failed auth attempts in Firestore
- Firebase Auth's built-in brute-force protection (already active)
- Cloud Function rate limiting per UID per operation

---

## Component 6: Cloud Functions Security Hardening

### A. Required Controls (Every Function Must Have)

```
┌─────────────────────────────────────────┐
│ 1. App Check enforcement (enforceAppCheck: true)     │
│ 2. Auth verification (request.auth check)              │
│ 3. Input validation (Zod schema.safeParse)             │
│ 4. Server-side rate limiting (Firestore-backed)        │
│ 5. Structured error responses (HttpsError codes)       │
│ 6. Cloud Logging (structured audit logs)               │
│ 7. maxInstances cap                                    │
└─────────────────────────────────────────┘
```

### B. Server-Side Rate Limiting Implementation

```typescript
// functions/src/rateLimit.ts
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

interface RateLimitConfig {
  maxPerMinute: number;
}

export async function enforceRateLimit(
  uid: string,
  operation: string,
  config: RateLimitConfig
): Promise<void> {
  const db = getFirestore();
  const ref = db.doc(`rate_limits/${uid}_${operation}`);
  
  const now = Date.now();
  const windowStart = now - 60_000; // 1-minute window
  
  const snap = await ref.get();
  const data = snap.data();
  
  if (data) {
    // Filter timestamps within the window
    const recentCalls = (data.timestamps as number[])
      .filter(t => t > windowStart);
    
    if (recentCalls.length >= config.maxPerMinute) {
      throw new HttpsError(
        "resource-exhausted",
        `Rate limit exceeded. Max ${config.maxPerMinute} calls per minute.`
      );
    }
    
    await ref.update({
      timestamps: FieldValue.arrayUnion(now),
      lastCall: now,
    });
  } else {
    await ref.set({
      timestamps: [now],
      lastCall: now,
    });
  }
}
```

### C. Anti-Loop Prevention

- No Firestore triggers (`onDocumentWrite`) that write back to the same collection
- All writes are explicit via Callable Functions — no event-driven chains

### D. Input Validation Schemas

```typescript
// functions/src/schemas.ts
import { z } from "zod";

export const saveVaultSchema = z.object({
  encryptedPayload: z.string().min(1).max(5_000_000),
  masterHash: z.string().min(1).max(1000),
});

export const saveSettingsSchema = z.object({
  autoLockTimeout: z.number().int().min(1).max(60),
  lockOnHide: z.boolean(),
  allowScreenshots: z.boolean(),
});

export const claimUsernameSchema = z.object({
  username: z.string()
    .min(3).max(20)
    .regex(/^[a-z0-9_]+$/, "Username must be lowercase alphanumeric + underscores"),
});
```

---

# 3. SECURITY MODEL

## Three Layers Defined

| Layer | Question It Answers | Technology | Required? |
|---|---|---|---|
| **App Check** | Is this a real app? | reCAPTCHA Enterprise / Play Integrity | ✅ Yes |
| **Authentication** | Who is this user? | Firebase Auth (ID Token / JWT) | ✅ Yes |
| **Authorization** | What can this user access? | Cloud Function logic (`request.auth.uid === targetUid`) | ✅ Yes |

## Combined Validation Flow (Every Request)

```
Client Request
  ├── App Check token ──→ Is this the real SecureVault app? ── No → 403 BLOCKED
  ├── Auth ID token ───→ Is this a valid, authenticated user? ── No → 401 UNAUTHENTICATED
  ├── UID ownership ───→ Is uid(request) === uid(targetResource)? ── No → 403 FORBIDDEN
  ├── Input schema ────→ Does the data match expected shape? ── No → 400 INVALID
  ├── Rate limit ──────→ Too many calls this minute? ── Yes → 429 RATE_LIMITED
  └── Execute logic ───→ ✅ Write to Firestore via Admin SDK
```

## Why Firestore Rules Alone Are Insufficient

Cloud Functions bypass Firestore Security Rules entirely (they use Admin SDK with full access). Rules are a secondary defense layer. If you rely on rules as your ONLY protection, a single misconfigured rule = total data breach.

## Principle of Least Privilege

- Clients **never** write vault data directly to Firestore
- Cloud Functions use Admin SDK but validate every operation
- Each function has explicit `maxInstances` to limit blast radius
- Firestore rules remain as defense-in-depth backup

---

# 4. ENCRYPTION STRATEGY (Summary)

| Layer | Protection | Implementation |
|---|---|---|
| **In Transit** | TLS 1.3 | Firebase default — all HTTPS |
| **At Rest (Google)** | Google-managed encryption | Firebase default — AES-256 on disk |
| **At Rest (App-Level)** | Client-side E2E encryption | AES-256-GCM with Argon2id-derived key |
| **Key Management** | Key never stored or transmitted | Derived on-demand from master password |

**Threat: Attacker gains full Firestore access**

They see encrypted blobs. No keys. No plaintext. They'd need to brute-force Argon2id (64MB memory × 3 iterations per attempt), which at scale is computationally prohibitive.

---

# 5. REAL-WORLD ATTACK SCENARIOS

| Attack | How SecureVault Handles It |
|---|---|
| **API calls without genuine app** | App Check blocks non-attested requests; `enforceAppCheck: true` on all Cloud Functions |
| **Stolen JWT token reuse** | Firebase tokens expire in 1 hour; `tokenVersion` in Firestore enables immediate revocation; device session tracking detects anomalies |
| **Reverse-engineered APK/web app** | App Check (Play Integrity) slows this; not a full stop. Backend validation prevents any actual damage even if API is called directly. |
| **Insider modifying Firestore rules** | Cloud Functions use Admin SDK, bypassing rules entirely. Even if rules are misconfigured, functions still enforce auth + validation + rate limits. |
| **Bot flooding endpoints** | Server-side rate limiting + App Check + `maxInstances` cap = bounded cost and limiting |
| **Attacker gains DB read access** | Zero-knowledge encryption — all vault data is AES-256-GCM encrypted. No server-side keys exist to decrypt. |

---

# 6. COMMON DEVELOPER MISTAKES (Called Out)

| Mistake | Why It's Dangerous | SecureVault Risk |
|---|---|---|
| **Trusting client-submitted UIDs** | Attacker sends `uid: "victimUID"` → reads their vault | 🔴 **CURRENT RISK** — Firestore rules prevent cross-user access, but Cloud Functions will add explicit `request.auth.uid` enforcement |
| **Client-side-only rate limiting** | `localStorage.clear()` → unlimited brute force | 🔴 **CURRENT RISK** — [rateLimit.ts](file:///D:/PYTHON/Password%20Manager/src/app/utils/rateLimit.ts) is client-only |
| **No App Check = public API** | Anyone with cURL can call your functions | 🔴 **CURRENT GAP** — App Check not initialized |
| **Using `onRequest` instead of `onCall`** | Must manually parse auth headers; easy to forget | ✅ Plan uses `onCall` exclusively |
| **Storing encryption keys on server** | Insider access = total breach | ✅ Already correct — keys never leave client |
| **No schema validation on writes** | Attacker injects arbitrary fields, bloats storage | 🔴 **CURRENT RISK** — no server-side Zod validation |
| **Assuming Firebase = secure by default** | Firebase provides tools, not a security posture | ⚠️ Partially addressed; this plan completes it |

---

# 7. FIRESTORE RULES HARDENING

The current rules will be updated to add defense-in-depth:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // ── User data ──
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null
        && request.auth.uid == userId;
      // Future: add && request.appCheckToken != null when enforced
    }

    // ── Usernames ──
    match /usernames/{username} {
      allow read: if request.auth != null;
      allow create: if request.auth != null
        && request.resource.data.uid == request.auth.uid
        && username.matches('^[a-z0-9_]{3,20}$');  // ← ADD: validate format
      allow delete: if request.auth != null
        && resource.data.uid == request.auth.uid;
    }

    // ── Registered emails ──
    match /registered_emails/{hash} {
      allow get: if true;
      allow create: if request.auth != null;
    }

    // ── Rate limits (server-managed) ──
    match /rate_limits/{document=**} {
      allow read, write: if false;  // ← Admin SDK only
    }
  }
}
```

---

# 8. FINAL DEPLOYMENT CHECKLIST

## Pre-Deploy

- [ ] Cloud Functions created, tested locally with Firebase Emulator
- [ ] App Check enabled in Firebase Console
- [ ] reCAPTCHA Enterprise site key created (GCP Console)
- [ ] Play Integrity API enabled (Google Play Console)
- [ ] Debug tokens configured for local development
- [ ] All Cloud Functions have `enforceAppCheck: true`
- [ ] All Cloud Functions validate `request.auth`
- [ ] All Cloud Functions validate input with Zod
- [ ] All Cloud Functions have `maxInstances` set
- [ ] Server-side rate limiting tested
- [ ] Client refactored from direct Firestore to Cloud Function calls
- [ ] Firestore rules updated (App Check token check, rate_limits deny)

## Security Audit

- [ ] Can an attacker call APIs without the genuine app? → **No** (App Check)
- [ ] Can vault data be read directly from Firestore? → Rules require auth + uid match
- [ ] Can the backend decrypt vault data? → **No** (zero-knowledge)
- [ ] Can an attacker brute-force the master password? → Server-side rate limiting
- [ ] Can an attacker inject arbitrary data? → Zod schema validation
- [ ] Are all tokens validated server-side? → `onCall` auto-validates

## Monitoring

- [ ] Cloud Logging enabled for all function invocations
- [ ] Alert on `resource-exhausted` (rate limit hits)
- [ ] Alert on `unauthenticated` spikes (potential bot activity)
- [ ] Alert on billing anomalies (DDoS cost protection)

---

## User Review Required

> [!IMPORTANT]
> **This is a planning document, not an implementation plan for immediate code changes.** This document addresses the prompt from [chatp1.md](file:///D:/PYTHON/Password%20Manager/pdfs_info_securevault/chatp1.md) and refines ChatGPT's output ([chatp2.md](file:///D:/PYTHON/Password%20Manager/pdfs_info_securevault/chatp2.md)) with SecureVault-specific context.
>
> To proceed with ACTUAL implementation, we would need to:
> 1. Set up the `functions/` directory with Firebase Cloud Functions
> 2. Refactor all client-side Firestore calls to use Cloud Function calls instead
> 3. Set up App Check with reCAPTCHA Enterprise credentials
> 4. Deploy and test with Firebase Emulator Suite
>
> **Do you want me to proceed with creating a concrete implementation plan for any or all of these components?**

> [!WARNING]
> **Breaking change:** Migrating from direct Firestore access to Cloud Functions will require refactoring [firestore.ts](file:///D:/PYTHON/Password%20Manager/src/app/firestore.ts) and [store.ts](file:///D:/PYTHON/Password%20Manager/src/app/firestore.ts) significantly. All `setDoc`/`getDoc` calls for vault operations will become `httpsCallable()` calls. This is a major change.

---

## Verification Plan

Since this is a **planning document** (not a code implementation), verification involves:

### Document Review
- User reviews this plan against the original prompt ([chatp1.md](file:///D:/PYTHON/Password%20Manager/pdfs_info_securevault/chatp1.md))
- User confirms this addresses all 9 sections from the prompt
- User confirms the gap analysis (ChatGPT critique) is accurate

### Future Implementation Testing (When Approved)
- Firebase Emulator Suite for local testing of Cloud Functions
- Browser-based testing of App Check integration
- Manual penetration testing of rate limiting
- Verify Firestore rules with Firebase Rules Playground
