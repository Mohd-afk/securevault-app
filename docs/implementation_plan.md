# SecureVault Feature Expansion — Implementation Plan

## Codebase Analysis Summary

| File | Role |
|---|---|
| `src/app/store.ts` | Core vault state — `VaultItem`, `addVaultItem`, `updateVaultItem` etc. |
| `src/app/components/PasswordList.tsx` | Main homepage list — **heavily modified** |
| `src/app/components/AppShell.tsx` | Auth/lock gate + `<Outlet>` — minimal changes |
| `src/app/routes.ts` | React Router config — add `/security`, `/generator` routes |
| `src/app/components/HomeWrapper.tsx` | Passes context to PasswordList — update props |
| `src/app/components/AddEditForm.tsx` | Add/edit form — add `isFavorite` + `totpSecret` fields |
| `src/app/components/ItemDetail.tsx` | Item detail view — add star toggle |

---

## Phase 1 — Data Model Extension (`store.ts`)
**Commit: `feat(store): extend VaultItem with isFavorite and totpSecret`**

### Changes to `VaultItem` interface:
```ts
export interface VaultItem {
  // ... existing fields
  isFavorite?: boolean;   // NEW — favorites system
  totpSecret?: string;    // NEW — 2FA missing check
}
```
### New store exports:
- `toggleFavorite(id: string): Promise<void>` — updates `isFavorite` + saves

---

## Phase 2 — Smart Search Hook (`src/app/hooks/useSmartSearch.ts`)
**Commit: `feat(search): fuzzy multi-field smart search`**

### New file: `src/app/hooks/useSmartSearch.ts`
- Fuzzy match across `title`, `url`, `username` simultaneously
- Tokenizes query — `"goo acc 123"` → matches Google account `safe123@gmail.com`

---

## Phase 3 — Sorting Hook (`src/app/hooks/useSort.ts`)
**Commit: `feat(sort): sortable vault list hook`**

### New file: `src/app/hooks/useSort.ts`
- Sort options: `title-asc`, `title-desc`, `modified-new`, `modified-old`, `created-new`, `created-old`, `size-asc`
- Returns `[sortedItems, sortOption, setSortOption]`

---

## Phase 4 — Sidebar Component (`src/app/components/Sidebar.tsx`)
**Commit: `feat(ui): sidebar navigation drawer`**

### New file: `src/app/components/Sidebar.tsx`
- Sections: All (count), Categories, Labels, System
- Takes `activeFilter` and `onFilterChange` props
- Animated slide-in overlay, closes on backdrop click

---

## Phase 5 — Sorting Modal (`src/app/components/SortModal.tsx`)
**Commit: `feat(ui): bottom-sheet sort modal with radio options`**

### New file: `src/app/components/SortModal.tsx`
- Bottom-sheet with radio buttons matching reference screenshots
- Dark rounded card with Cancel button

---

## Phase 6 — PasswordList Complete Overhaul (`PasswordList.tsx`)
**Commit: `feat(home): complete home screen redesign with all filters`**

### Major changes:
- New header: Hamburger → Sidebar, "Safe" title, avatar icon
- Smart search bar (always visible, rounded)
- Smart search empty state with example hint
- Horizontal category chips: `All | Codes | Passkeys | Cards | Notes`
- Favorites star icon in header to toggle favorites filter
- Sort icon opens `SortModal`
- Each item card gets a ⭐ star button
- Filters chain: `category → favorites → search → sort`
- Bottom nav bar: Safe | Security | Tools | Search tabs

---

## Phase 7 — Security Dashboard (`src/app/components/SecurityDashboard.tsx`)
**Commit: `feat(security): full security health dashboard with HIBP k-Anonymity`**

### New file: `src/app/components/SecurityDashboard.tsx`

**States rendered:**
1. `idle` — Gauge + 4 metric cards + "Security check" button
2. `checking` — Progress bar, shield+magnifier icon, privacy text
3. `results` — Red shield alert with compromised count
4. `list` — Compromised items list with site logos

**Logic:**
- `weak`: length < 10 OR lacks uppercase OR lacks digits
- `reused`: group by exact password string, flag if count > 1
- `2fa_missing`: has password but no `totpSecret`
- `compromised`: SHA-1 hash → send first 5 chars to `https://api.pwnedpasswords.com/range/{prefix}` → check suffix locally (k-Anonymity)

> ⚠️ **Security constraint**: Full SHA-1 hash is NEVER sent to HIBP. Only the 5-char prefix. Suffix matching happens client-side.

---

## Phase 8 — Password Generator (`src/app/components/PasswordGenerator.tsx`)
**Commit: `feat(generator): cryptographically-secure password generator`**

### New file: `src/app/components/PasswordGenerator.tsx`

**UI:** Dark card, color-coded password display (letters=white, digits=blue, symbols=yellow), slider (8–64), strength badge, toggle switches

**Logic:**
- `window.crypto.getRandomValues(new Uint32Array(n))` — NO `Math.random()`
- Exclude similar: removes `i`, `l`, `1`, `L`, `o`, `0`, `O`
- Must guarantee at least 1 char from each enabled set (rejection sampling)

---

## Phase 9 — Routes & Bottom Nav Update
**Commit: `feat(nav): add Security and Generator routes + bottom tab bar`**

### Modified files:
- `routes.ts` — add `/security` and `/generator` routes
- `AppShell.tsx` — optional: pass nav context

---

## File Manifest

| Status | File | Feature |
|---|---|---|
| MODIFIED | `src/app/store.ts` | `isFavorite`, `totpSecret`, `toggleFavorite()` |
| MODIFIED | `src/app/routes.ts` | `/security`, `/generator` routes |
| MODIFIED | `src/app/components/PasswordList.tsx` | Complete overhaul |
| MODIFIED | `src/app/components/AddEditForm.tsx` | `isFavorite` + `totpSecret` fields |
| MODIFIED | `src/app/components/ItemDetail.tsx` | Star toggle |
| NEW | `src/app/hooks/useSmartSearch.ts` | Smart fuzzy search |
| NEW | `src/app/hooks/useSort.ts` | Sorting state |
| NEW | `src/app/components/Sidebar.tsx` | Nav drawer |
| NEW | `src/app/components/SortModal.tsx` | Sort bottom sheet |
| NEW | `src/app/components/SecurityDashboard.tsx` | Security tab |
| NEW | `src/app/components/PasswordGenerator.tsx` | Generator screen |

---

## Security Constraints Acknowledged

1. **HIBP k-Anonymity**: SHA-1 hash computed client-side. Only first 5 hex chars sent to API. Full hash never leaves device.
2. **Password Generation**: Exclusively uses `window.crypto.getRandomValues()`. `Math.random()` is NOT used anywhere in generation.
3. **Favorites**: `isFavorite` stored in encrypted vault — persists through sync.
4. **OTA Compatibility**: No native changes. All new features are pure JS/React — OTA deployable.
