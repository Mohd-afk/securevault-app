# Phase 2 — Backend & Database Guide

Everything you need to know before building Phase 2 of SecureVault.

---

## 1. SQL vs NoSQL — What's the Difference?

|  | **SQL (Relational)** | **NoSQL (Document / Key-Value)** |
|---|---|---|
| **Structure** | Fixed tables with rows & columns. You define the schema upfront (like an Excel spreadsheet). | Flexible documents (JSON-like). Each document can have different fields. |
| **Query language** | SQL (`SELECT * FROM users WHERE email = ...`) | SDK methods, REST, or custom query builders (e.g. `db.collection('users').where(...)`) |
| **Relationships** | Great for linked data — foreign keys, JOINs across tables (e.g. users → vault_items) | Relationships are possible but awkward — you typically embed data or manually reference IDs |
| **Schema changes** | Need "migrations" — ALTER TABLE, add columns, etc. More rigid but safer. | Just add a new field to documents. Very flexible but can become messy over time. |
| **Scaling** | Scales **vertically** (bigger server). Horizontal scaling exists but is complex. | Designed to scale **horizontally** (more servers). Great for massive data. |
| **Best for** | Structured data with clear relationships, financial apps, CRUD apps, user accounts | Real-time data, chat apps, IoT, apps with rapidly changing schemas, huge scale |
| **Examples** | PostgreSQL, MySQL, SQLite | MongoDB, Firebase Firestore, DynamoDB, CouchDB |

### For SecureVault specifically

Your data is simple: users have vault items. That's essentially **one table** with a user ID foreign key. Either SQL or NoSQL works fine. The choice comes down to **which platform/service you want to use**, not the data model.

---

## 2. Free Backend / Auth APIs — Comparison

| Service | Type | Auth? | Database? | Free Tier | Best For | India Availability |
|---|---|---|---|---|---|---|
| **Firebase** | NoSQL (Firestore) | ✅ Full auth suite | ✅ Firestore (document DB) | Spark plan: 1 GB storage, 50K reads/day, 20K writes/day | Quick MVPs, real-time sync, mobile-first apps | ✅ Works in India |
| **Supabase** | SQL (PostgreSQL) | ✅ Full auth suite | ✅ Postgres (relational) | 500 MB DB, 50K MAU, 2 projects | Full-stack apps, SQL lovers, complex queries | ⚠️ **Reportedly blocked/restricted in India** |
| **Appwrite** | Both (flexible) | ✅ Full auth suite | ✅ Document DB (MariaDB under the hood) | Self-host = unlimited; Cloud = generous free tier | Devs who want Supabase alternative, self-hosting | ✅ Works in India |
| **Neon** | SQL (PostgreSQL) | ❌ (DB only) | ✅ Serverless Postgres | 0.5 GB, 100 hours compute/month | Just a database, pair with your own auth | ✅ Works in India |
| **PocketBase** | SQL (SQLite) | ✅ Built-in auth | ✅ SQLite-backed | Free forever (self-hosted, single binary) | Small personal projects, single-server deployment | ✅ Self-hosted |
| **MongoDB Atlas** | NoSQL (MongoDB) | ❌ (DB only) | ✅ Document DB | 512 MB shared cluster | If you already know MongoDB | ✅ Works in India |

---

## 3. Firebase — The Right Choice for India

Since Supabase is restricted in India, **Firebase is the best option** for SecureVault. Here's why:

### Pros
- ✅ **100% free** for a personal password manager (Spark plan is more than enough)
- ✅ **Firebase Auth** handles email/password sign-up, Google login, phone OTP — all built-in
- ✅ **Firestore** gives you real-time sync across devices out of the box
- ✅ **Firebase Hosting** for deploying the web app (free with generous bandwidth)
- ✅ **Massive community** — tons of tutorials, Stack Overflow answers, official Google docs
- ✅ **Works perfectly in India** — it's a Google product, no access issues

### Cons
- ⚠️ NoSQL (Firestore) means no SQL queries — but for SecureVault's simple data model, this doesn't matter
- ⚠️ Vendor lock-in — migrating away from Firebase later is more work than from Postgres
- ⚠️ Firestore pricing can spike at scale (but you'll never hit those limits for a personal app)

### Firebase Spark Plan (Free) Limits

| Resource | Limit |
|---|---|
| Firestore storage | 1 GB |
| Firestore reads | 50,000 / day |
| Firestore writes | 20,000 / day |
| Firestore deletes | 20,000 / day |
| Authentication | Unlimited users (email/password) |
| Hosting storage | 10 GB |
| Hosting bandwidth | 360 MB / day |

> For a personal password manager with even 1,000 vault items, you'll use < 1% of these limits.

---

## 4. Phase 2 Checklist — Detailed Breakdown

Here's every item you need to decide on before we start Phase 2:

---

### 4.1 Firebase Project Setup

**What**: Create a Firebase project and connect it to your React app.

**Steps**:
1. Go to [Firebase Console](https://console.firebase.google.com), create a new project
2. Enable Firestore Database (start in test mode, add rules later)
3. Enable Authentication → Email/Password provider
4. Install Firebase SDK: `npm install firebase`
5. Create a `firebase.ts` config file with your project credentials
6. Add Firebase config to environment variables (`.env` file)

**Decision needed**: Do you want Google Sign-In in addition to email/password?

---

### 4.2 User Authentication

**What**: Let users create accounts and sign in, replacing the local master-password-only flow.

**How it works with Phase 1 encryption**:
- User signs up with email + password → Firebase Auth creates the account
- User also sets a **master password** (separate from their login password) → used for PBKDF2 key derivation
- The master password is **never sent to Firebase** — it only lives client-side for encryption/decryption
- This gives you **zero-knowledge encryption**: your server stores encrypted blobs it can never read

**New screens needed**:
- **Sign Up screen**: Email, account password, master password (separate!)
- **Login screen**: Email, account password → then master password to decrypt vault
- **Forgot password flow**: Firebase handles email reset for the account password. If they forget the master password, data is unrecoverable (this is by design for security).

**Decision needed**: Should there be a "Remember me" / stay-logged-in option?

---

### 4.3 Firestore Database Design

**What**: Store encrypted vault blobs in Firestore.

**Proposed structure**:
```
users (collection)
  └── {userId} (document)
        ├── email: "john@example.com"
        ├── createdAt: timestamp
        └── vault (subcollection)
              └── encrypted_blob (single document)
                    ├── ciphertext: "base64..."
                    ├── salt: "base64..."
                    ├── iv: "base64..."
                    ├── updatedAt: timestamp
```

**Why a single encrypted blob** (not one document per vault item):
- The client already encrypts/decrypts the entire vault as one unit (Phase 1)
- Simpler Firestore security rules
- Fewer reads/writes = stays well within free tier
- The server **never** sees individual passwords — maximum zero-knowledge

**Firestore Security Rules**:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null
                         && request.auth.uid == userId;
    }
  }
}
```
This ensures users can **only** read/write their own data.

---

### 4.4 Cloud Sync

**What**: The encrypted vault blob syncs between devices.

**How it works**:
1. On login → fetch the encrypted blob from Firestore → decrypt with master password → show vault
2. On any change (add/edit/delete) → re-encrypt the entire vault → write the blob to Firestore
3. **Conflict resolution**: Use `updatedAt` timestamp — latest write wins (since it's a personal app, conflicts are rare; the user won't be editing from two devices simultaneously)
4. **Offline support**: Firestore has built-in offline persistence — the app works offline, syncs when back online

**Decision needed**: Do you want real-time listeners (vault updates live across open tabs/devices) or just sync-on-load?

---

### 4.5 Migration — Local Data → Cloud

**What**: Users who already have local vault data need a way to migrate it to the cloud.

**Flow**:
1. User signs up / logs in for the first time
2. App detects existing `localStorage` data
3. Prompt: "You have local vault data. Upload it to the cloud?"
4. On confirm → encrypt local data with their master password → push to Firestore
5. Optionally clear `localStorage` after successful migration

---

### 4.6 Firebase Hosting (Deployment)

**What**: Deploy the React app to Firebase Hosting (free, HTTPS, custom domain support).

**Steps**:
1. `npm install -g firebase-tools`
2. `firebase init hosting` → set `dist` as the public directory, enable SPA rewrites
3. `npm run build && firebase deploy`
4. Optional: connect a custom domain in Firebase Console

**Alternative**: You can also keep using Vercel/Netlify if you prefer; Firebase Hosting is just convenient since you're already using Firebase.

---

### 4.7 Summary of Decisions You Need to Make

| # | Question | Options |
|---|---|---|
| 1 | **Auth provider** | Email/Password only, or also Google Sign-In? |
| 2 | **Remember me** | Stay logged in between sessions, or always require login? |
| 3 | **Real-time sync** | Live sync across devices, or sync-on-load only? |
| 4 | **Hosting** | Firebase Hosting, Vercel, or Netlify? |
| 5 | **Custom domain** | Do you have a domain name, or use the free `.web.app` domain? |
| 6 | **Migration prompt** | Auto-prompt to migrate local data, or add a manual "Import" button in settings? |

> [!TIP]
> **My recommendation**: Start with Email/Password auth + sync-on-load + Firebase Hosting on the free `.web.app` domain. You can add Google Sign-In and real-time sync later — they're incremental additions, not architectural changes.

---

Once you've answered these questions, I can create a detailed Phase 2 implementation plan with exact file changes, just like the Phase 1 plan.
