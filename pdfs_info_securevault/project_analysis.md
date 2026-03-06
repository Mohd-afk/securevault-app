# SecureVault — Project Analysis & Roadmap

## Technology Stack Summary

### Frontend
| Layer | Technology | Version |
|---|---|---|
| **UI Framework** | React | 18.3.1 |
| **Build Tool** | Vite | 6.3.5 |
| **Routing** | React Router (Data mode) | 7.13.0 |
| **Styling** | Tailwind CSS (v4, Vite plugin) | 4.1.12 |
| **Icons** | Lucide React | 0.487.0 |
| **Animations** | Motion (Framer Motion) | 12.23.24 |
| **Toasts** | Sonner | 2.0.3 |
| **UI Primitives** | Radix UI (full suite) | Various |
| **Utilities** | clsx, tailwind-merge, class-variance-authority | — |

### Backend
| Layer | Technology | Notes |
|---|---|---|
| **Server** | ❌ **None** | No backend server exists |
| **Auth** | Client-side SHA-256 hash | Master password hashed via Web Crypto API, stored in `localStorage` |
| **Encryption** | ❌ **None** | Passwords are stored in **plaintext** JSON in `localStorage` |

### Database
| Layer | Technology | Notes |
|---|---|---|
| **Storage** | Browser `localStorage` | Keys: `securevault_items`, `securevault_master_hash` |
| **Format** | JSON array | No encryption, no indexing, no backup mechanism |

---

## Current State of the App

The app is a **fully functional frontend prototype** with:
- ✅ Lock screen with master password setup/verify flow
- ✅ Home screen with grouped, searchable password list
- ✅ Add / Edit / Delete vault items (full CRUD)
- ✅ Detail view with copy-to-clipboard, show/hide password
- ✅ 6 item types (Website, App, Phone, Door Lock, Card, Other)
- ✅ Clean, polished dark-mode UI with a well-documented design system
- ✅ Sample data seeding for demo purposes

### What's Missing for a Real, Deployable App

| Gap | Severity | Details |
|---|---|---|
| **No encryption at rest** | 🔴 Critical | Passwords are stored as plaintext JSON in `localStorage`. Anyone with browser access can read them. |
| **No backend / API** | 🔴 Critical | No server, no database, no user accounts. Everything lives in one browser's `localStorage`. |
| **No cloud sync** | 🟡 Major | Data can't be accessed across devices or browsers. |
| **No real auth** | 🟡 Major | SHA-256 hash comparison is not a proper key-derivation function (should be PBKDF2 / Argon2). |
| **No auto-lock** | 🟠 Moderate | The [overview.md](file:///d:/PYTHON/Password%20Manager/overview.md) spec requires auto-lock after timeout — not implemented yet. |
| **No export / import** | 🟠 Moderate | No CSV import from Chrome, no encrypted backup export. |
| **No settings screen** | 🟢 Minor | No way to change master password, toggle biometrics, set timeout, etc. |

---

## Suggested Next Course of Action

### Phase 1 — Client-Side Security Hardening (No paid services needed)
1. **Encrypt vault data** — Use the Web Crypto API (AES-GCM) to encrypt/decrypt all vault items with a key derived from the master password via PBKDF2.
2. **Replace SHA-256 with PBKDF2** — Use a proper key derivation function with salt + iterations for the master password.
3. **Add auto-lock** — Lock the vault on tab blur / inactivity timeout.
4. **Add a Settings screen** — Change master password, set auto-lock timeout.

### Phase 2 — Backend + Database (Needed for a real deployable app)
5. **Build a backend API** — e.g. Node.js + Express, or a serverless option (Cloudflare Workers, Vercel Edge Functions).
6. **Add a real database** — PostgreSQL (via Supabase/Neon), MongoDB Atlas, or SQLite (via Turso).
7. **User authentication** — Email/password sign-up with JWT sessions, or an auth provider (Supabase Auth, Firebase Auth, Clerk).
8. **Cloud sync** — Store the encrypted vault blob server-side so it's accessible across devices.

### Phase 3 — Polish & Distribution
9. **CSV import** from Chrome / Google Password Manager.
10. **Encrypted backup export**.
11. **PWA support** — Add a service worker + manifest for install-to-home-screen and offline access.
12. **Android wrapper** — Use Capacitor or TWA to ship as a Play Store app.

---

## Paid Services Assessment

| Service | Purpose | Free Tier? | Paid Cost (approx.) |
|---|---|---|---|
| **Supabase** | Database + Auth + Realtime sync | ✅ Generous free tier (500 MB DB, 50K MAU) | ~$25/mo Pro |
| **Firebase** | Auth + Firestore DB | ✅ Free Spark plan | ~$25/mo Blaze (pay-as-you-go) |
| **Vercel** | Frontend hosting + Serverless functions | ✅ Free hobby tier | ~$20/mo Pro |
| **Neon** | Serverless PostgreSQL | ✅ Free tier (0.5 GB) | ~$19/mo Pro |
| **Clerk** | Auth (if not using Supabase) | ✅ Free up to 10K MAU | ~$25/mo after |
| **Play Store** | Android app distribution | ❌ | **$25 one-time** developer fee |
| **Apple Developer** | iOS app distribution | ❌ | **$99/year** |
| **Domain name** | Custom domain for web app | ❌ | ~$10-15/year |

### Minimum Viable Deployment (completely free)
> You can deploy a **web-only** version for **$0** using:
> - **Vercel** (free hobby tier) for hosting
> - **Supabase** (free tier) for database + auth
> - Keep end-to-end encryption client-side so the server never sees plaintext passwords

### If targeting Android
> Add the **$25 one-time** Google Play Store developer fee.

### If targeting iOS
> Add the **$99/year** Apple Developer Program fee.

---

> [!TIP]
> The **highest-impact next step** is Phase 1 (client-side encryption). It requires **zero paid services**, makes the app genuinely secure, and can be done entirely within the existing React + Vite codebase.
