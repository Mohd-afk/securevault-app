# SecureVault Audit Tasks (2026-03-25)

## Scope covered
- Reviewed core web app code (`src/app/**`), OTA scripts/config (`scripts/**`, `capacitor.config.ts`, `firebase.json`, `ota-updates/README.md`), and Android autofill/session components.
- Focused on issues that can explain repeated OTA failures and high-impact reliability/security correctness problems.

---

## Main maintenance task: investigate repeated OTA failure loop

### Why this is likely recurring
`initUpdater()` only checks `remote.version !== activeVersion`, not semantic ordering or compatibility. That means any mismatch (including accidental downgrade, malformed version, or incompatible bundle) triggers download+apply repeatedly on every launch if promotion never completes. The logic also does not gate by `minAppVersion`, even though this field exists in metadata type. Combined with `set()` immediate reload behavior, this can create repeated retry loops when a bad OTA is published.

### Evidence
- `checkForUpdate()` uses equality-only compare (`if (remote.version === activeVersion) return;`) then updates on any mismatch.
- `VersionMetadata` includes `minAppVersion?: string` but no code uses it.
- `downloadAndApply()` always calls `CapacitorUpdater.set()` (immediate reload).

### Proposed task
**Task: Add robust OTA eligibility + loop protection before applying bundles.**

#### Acceptance criteria
1. Replace equality-only check with semantic version comparison (`remote > active` only).
2. Enforce `minAppVersion` against native app version and skip incompatible OTA with explicit logs.
3. Add retry guard for failed bundle IDs/versions (e.g., cooldown + failure counter in localStorage).
4. Emit a structured telemetry event for each OTA state transition (`check`, `downloaded`, `set_called`, `promoted`, `rollback_detected`).
5. Add a rollback-safe fallback path that avoids re-downloading the same known-bad version forever.

---

## Required task 1 — typo fix

### Issue
A success toast in Settings shows a literal template token instead of the real domain due an escaped interpolation sequence.

### Evidence
`toast.success(`Added \${site} to blocklist`);`

### Proposed task
**Task: Fix interpolated toast message typo/escaping so users see the actual blocked domain.**

#### Acceptance criteria
1. Update message to `Added ${site} to blocklist`.
2. Verify manually in UI by adding a blocked domain.
3. Add a small unit/UI test for this message formatting.

---

## Required task 2 — bug fix

### Issue
Device revocation listener subscribes to the current device document but does not act when it is deleted. This can cause revoked devices to remain logged in until a tokenVersion bump is observed (or forever in edge cases).

### Evidence
In `listenForRevocation()`, the `onSnapshot(deviceRef, ...)` callback body is effectively a no-op and never invokes `onRevoked()` when `!snap.exists()`.

### Proposed task
**Task: Implement missing revocation behavior for deleted current-device doc.**

#### Acceptance criteria
1. In device snapshot callback, if doc is deleted after initial registration, call `onRevoked()` once.
2. Guard against startup race conditions with an initialization flag.
3. Add tests for both revocation mechanisms: device-doc deletion and tokenVersion increment.

---

## Required task 3 — documentation/comment discrepancy

### Issue
OTA docs are inconsistent with release automation behavior.

### Evidence
- `scripts/release-ota.mjs` already updates `app_config/latest_version` after Hosting deploy.
- `ota-updates/README.md` says to deploy and then update Firestore doc manually.

### Proposed task
**Task: Align OTA documentation with actual release script behavior.**

#### Acceptance criteria
1. Update `ota-updates/README.md` to describe that `npm run release` performs build, zip, hosting deploy, and Firestore metadata update.
2. Add a “manual recovery path” section for when Firestore write fails.
3. Link to a single authoritative OTA runbook.

---

## Test improvement opportunities

1. **Add updater unit tests for version gating and loop prevention**
   - Cases: equal version, remote older version, remote newer version, malformed version, minAppVersion unmet, previous failed bundle cooldown.

2. **Add integration test around OTA pending→active promotion path**
   - Mock `CapacitorUpdater.current/download/set` and verify state keys transition correctly across simulated app restart.

3. **Strengthen Android revocation tests**
   - Add listener tests proving `onRevoked()` fires on device-doc delete and tokenVersion bump.

4. **Add release-script dry-run validation test**
   - Verify generated URL, version source, and Firestore payload before live deploy.

