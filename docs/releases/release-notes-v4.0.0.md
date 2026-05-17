## Keeguard v4.0.0 — Major Security & UX Overhaul

### 🔐 Security Hardening
- **TOTP Secret Isolation**: Secrets now encrypted with a separate Argon2id-derived key; never stored in the same encryption context as passwords
- **HIBP Service**: Production-grade breach checking with IndexedDB caching (24h TTL), 350ms rate-limiting, abort-able timeouts, and offline-graceful fallback
- **OTA Integrity**: SHA-256 checksum verification before any bundle is applied — prevents supply-chain attacks
- **Memory Hygiene**: Vault key, session password, and cached items are wiped on background, lock, or inactivity

### ✨ New Features
- Smart fuzzy search with multi-field tokenization
- Multi-criteria sorting (title, modified, created, size)
- Sidebar navigation drawer with category filters
- Password Generator with real entropy calculation
- Favorites (★) system
- Category chips: Codes, Passkeys, Cards, Notes

### 🛡️ Mandatory Update
This is a mandatory update. Users on older versions will be prompted to install v4.0.0.
