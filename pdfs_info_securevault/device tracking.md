# Device Session Tracking

Track active devices per user, display them in Settings, and enable remote session revocation with server-enforced token invalidation.

## Proposed Changes

### Dependencies

#### [NEW] `ua-parser-js`
Parse User-Agent to get clean browser + OS names.

---

### Firestore Structure

```
users/{uid}/devices/{deviceId}
  ├── browser: "Chrome"
  ├── os: "Windows 10"
  ├── createdAt: serverTimestamp()
  └── lastActive: serverTimestamp()

users/{uid}/data/tokenVersion
  └── version: number (starts at 0)
```

---

### Service Layer

#### [NEW] `src/app/services/deviceSession.ts`

| Function | Description |
|---|---|
| `getLocalDeviceId()` | Read/create `securevault_device_id` in `localStorage` via `crypto.randomUUID()` |
| `getDeviceInfo()` | Parse `navigator.userAgent` with `ua-parser-js`, return `{ browser, os }` |
| `registerCurrentDevice(uid)` | Write to `users/{uid}/devices/{deviceId}` with browser, os, `createdAt`, `lastActive` (uses `serverTimestamp()`) |
| `updateLastActive(uid)` | Throttled (10 min) update of `lastActive` field on the current device doc. Called from [unlockVault()](file:///d:/PYTHON/Password%20Manager/src/app/store.ts#317-388), [addVaultItem()](file:///d:/PYTHON/Password%20Manager/src/app/store.ts#443-462), [updateVaultItem()](file:///d:/PYTHON/Password%20Manager/src/app/store.ts#463-486), etc. |
| `subscribeToDevices(uid, cb)` | `onSnapshot` on the `devices` collection → returns real-time list for the Settings UI |
| `revokeDevice(uid, deviceId)` | Delete the target device doc + bump `tokenVersion` on the user profile |
| `revokeAllOtherDevices(uid)` | Delete all device docs except the current one + bump `tokenVersion` |
| `listenForRevocation(uid, onRevoked)` | `onSnapshot` on current device doc. If doc deleted → fire callback. Also listens to `tokenVersion`; if server version > local version → force logout |

---

### Token Invalidation (Change 1)

When a user logs in:
1. Read `users/{uid}/data/tokenVersion` → store in memory as `_sessionTokenVersion`
2. A Firestore listener watches this doc

When a user revokes a device:
1. Delete the device doc
2. Increment `tokenVersion` by 1

All other active clients detect `tokenVersion` changed → compare with their `_sessionTokenVersion` → if mismatched → [signOut()](file:///d:/PYTHON/Password%20Manager/src/app/auth.ts#127-132) + [clearSession()](file:///d:/PYTHON/Password%20Manager/src/app/store.ts#67-78)

> [!NOTE]
> This is a **client-enforced** approach (no Cloud Functions needed). It's not as strong as server-side token revocation via Firebase Admin SDK, but it's the pragmatic approach for a client-only app and defeats all non-malicious sessions instantly.

---

### Auth Flow Integration

#### [MODIFY] [AppShell.tsx](file:///d:/PYTHON/Password%20Manager/src/app/components/AppShell.tsx)
- After vault is unlocked (`setUnlocked(true)`), call `registerCurrentDevice(user.uid)` and start `listenForRevocation(uid, handleSignOut)`
- Start `updateLastActive` heartbeat (every 10 min) while unlocked
- Cleanup listeners on unmount or lock

---

### Settings UI

#### [MODIFY] [Settings.tsx](file:///d:/PYTHON/Password%20Manager/src/app/components/Settings.tsx)
- Add **Active Devices** section between Security and Auto-Lock
- Show real-time list from `subscribeToDevices`
- Each row: `[Browser Icon] Browser — OS` with "Last active: X ago"
- Current device shows [(This Device)](file:///d:/PYTHON/Password%20Manager/src/app/App.tsx#5-23) badge
- Other devices get a `✕ Log out` button → calls `revokeDevice()`
- Bottom button: **Log out all other devices** → calls `revokeAllOtherDevices()`

---

## Verification Plan

### Manual Verification
1. Log in on browser A → Settings shows 1 device with "(This Device)"
2. Log in on browser B (incognito/different browser) → Settings shows 2 devices
3. From browser B, revoke browser A → browser A should auto-logout within seconds
4. Test "Log out all other devices" button
5. Verify `lastActive` updates after vault operations
