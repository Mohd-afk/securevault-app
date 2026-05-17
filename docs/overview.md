# App Specification: Minimal Open‑Source Password Manager

## Working Name / App Name
Keeguard (**final name** — previously called SecureVault; same app, new branding)

## Platforms and Scope
- **Core Standard:** Mobile-First design philosophy.
- **Platforms:** Web App (PWA) designed to run perfectly on Android, iOS, and Desktop.
- **Syncing:** Real-time synchronization across multiple devices is a core pillar.
- **Focus:** Secure, zero-knowledge personal secret management.

## High‑Level Concept
A simple, modern, open‑source password manager that lets users store **all types of sensitive information** in one place:
- Website logins.
- App logins.
- Device passwords and PINs (phone lock, router, etc.).
- Door lock codes, vault codes, card PINs.
- Addresses and other sensitive notes.

The app should feel similar to Chrome’s Password Manager UI, but:
- Support **any** kind of password/secret.
- Show a clean list of entries.
- Provide a simple “Add” flow like Chrome’s manual add dialog.
- Show details for each entry, including **last changed** information and change history.

The design goal is: **clean, minimalist, modern, trustworthy, and easy to use**.

## Core User Flows

### 1. View list of saved items
- Home screen shows a vertically scrollable list of saved entries.
- Each list item shows:
  - Primary label (e.g., site name or title).
  - Optional subtitle (e.g., URL or type like “Door lock”, “Phone PIN”).
  - Optional favicon/icon for website entries.
- Tapping an item opens the **detail screen** for that entry.

### 2. Add a new item (Floating Action Button)
- On the home screen, show a **floating action button (FAB)** at the bottom‑right corner with a "+" icon.
- Tapping FAB opens an **"Add New Password" card/screen** (inspired by the screenshot provided).

#### Add Item Form Fields
- Site / Title (text):
  - For websites: domain or site name (e.g., `example.com`).
  - For non‑web entries: free‑text title (e.g., “Main door lock”, “Phone PIN”).
- Username (optional text).
- Password / Secret (password field, masked by default, with eye icon to toggle visibility).
- Type (dropdown or chips; can be simple in v1):
  - Examples: Website, App, Phone, Door Lock, Card, Other.
- URL (optional, for websites).
- Note (multiline text, optional) for extra info like address, instructions, backup codes.
- Automatically set:
  - Created timestamp.
  - Last changed timestamp (initially same as created).

#### Buttons
- Cancel (discard and go back).
- Save (enabled only when required fields like Title and Password are filled).

### 3. View and manage a saved item
- Tapping an entry in the list opens a **detail screen/card** similar to the Chrome example screenshot.

#### Detail Screen UI
- Show fields:
  - Title / Site.
  - URL (clickable if present, opens in browser).
  - Username (if any).
  - Password / Secret:
    - Masked by default.
    - Eye icon to toggle visibility.
    - Copy‑to‑clipboard icon.
  - Note.
- Metadata:
  - “Created on: <date>”.
  - “Last changed: <date>”.
  - (Optional for later) simple change history – for now, just track last changed date.
- Actions:
  - Edit (opens the same form as Add, prefilled).
  - Delete (with confirmation dialog).
  - (Future) Share/export options.

### 4. Edit an item
- From detail screen, tap **Edit**.
- Show the same form as Add, prepopulated with existing data.
- When user saves:
  - Update values.
  - Update **Last changed** timestamp.
  - Return to detail screen.

### 5. Delete an item
- From detail screen, tap **Delete**.
- Show confirmation dialog:
  - “Are you sure you want to delete this item? This action cannot be undone.”
- On confirm:
  - Remove item from storage.
  - Return to list.

## UI / UX Requirements

- Overall design:
  - Dark or light theme support (at least one theme in v1, but structure code to allow theming).
  - Flat, modern, minimalist design.
  - Avoid clutter and unnecessary graphics so it feels **simple but premium**, not cheap.
- Navigation:
  - Single‑activity / multi‑fragment or Compose navigation is acceptable.
  - Top app bar with app name and optional search icon.
- List screen:
  - Optional search bar or icon (even if search is simple).
- Icons:
  - Use standard Material icons (lock, key, visibility, edit, delete, etc.).

## Security Requirements (v1)

- All data must be **encrypted at rest** using strong, modern encryption.
- There should be a **master passphrase** or **device biometrics** (fingerprint/face) to unlock the vault:
  - On first app launch, user sets a master password (or chooses to rely on device screen lock, based on platform best practices).
  - On subsequent launches, app requires master password or biometrics to open the vault.
- Do **not** store the master password in plaintext anywhere.
- Use Android’s recommended secure storage APIs (e.g., Jetpack Security, EncryptedSharedPreferences, or an encrypted database) for the vault.
- Implement automatic lock:
  - Lock the vault when the app is closed or after a configurable timeout.

## Data Model (Simple Draft)

### Entity: VaultItem
- `id` (UUID or auto ID).
- `title` (string).
- `username` (string, optional).
- `password` (string, encrypted).
- `type` (enum/string: Website, App, Phone, Door Lock, Card, Other).
- `url` (string, optional).
- `note` (string, optional).
- `createdAt` (timestamp).
- `updatedAt` (timestamp).

### Entity: AppSettings
- `biometricsEnabled` (boolean).
- `autoLockTimeout` (integer / duration).
- (Future) sync configuration.

## Core Rules & Product Pillars

### 1. Mobile-First, Everywhere Access
The app is built as a **Mobile-First Web Application**. While it feels and behaves like a native mobile app, it is accessible via any web browser to ensure users can sync and access their vault across Android, iOS, and Desktop seamlessly.

### 2. Zero-Knowledge Sync
Synchronization must never compromise security. Encryption happens strictly on the device. The "Syncing" feature only moves encrypted "gibberish" between devices; the server never sees the keys or the raw data.
   - Allow user to sync their encrypted vault so they can access it on Android, iOS, and Web.
   - Options include self‑hosted server or a simple managed backend.

2. **Import passwords from Chrome or other browsers**
   - Support importing from a **CSV** file exported from Google Password Manager / Chrome.
   - Expected CSV columns: `url`, `username`, `password` (matching Chrome’s import/export format).[web:6][web:18]  

3. **Export / backup**
   - Export encrypted backup file.
   - Optional plaintext CSV export with strong warnings.

4. **Tags / categories**
   - Allow grouping items (e.g., Work, Personal, Home, Bank).

5. **Better change history**
   - Store previous passwords with timestamps for each item.

6. **Browser extensions and auto‑fill**
   - For Web and desktop apps (far future).

## Open‑Source and Trust

- The project should be **open source**, with code publicly available (e.g., GitHub).
- Clear README with:
  - Security design overview.
  - How encryption and key management are implemented.
  - Contributions and issue templates.

## Non‑Functional Requirements

- Code should be clean and modular to allow:
  - Future porting to iOS and Web.
  - Adding sync without major refactor.
- Follow Android best practices (MVVM or similar, Jetpack libraries, or Jetpack Compose for UI if preferred).
- App should be responsive and smooth on low‑end Android devices.
