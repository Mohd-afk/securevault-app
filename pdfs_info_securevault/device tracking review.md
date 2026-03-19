# Device Session Tracking

This plan outlines how we will track active devices for a user, display them in the Security Settings, and enable remote session revocation.

## Proposed Changes

### Dependencies
#### [NEW] `ua-parser-js`
*   Install package to reliably parse browser and OS device names from the User-Agent string.

---

### Logic & Services Layer
#### [NEW] `src/app/services/deviceSession.ts`
*   Create a module containing functions to interact with local device state and the Firestore devices collection.
*   `getLocalDeviceId()`: Looks up `securevault_device_id` in `localStorage`. If missing, generates a random UUID and saves it.
*   `registerCurrentDevice(uid: string)`: Grabs user agent via `ua-parser-js`, assembles a payload `{ browser: 'Chrome', os: 'Windows', lastActive: serverTimestamp() }`, and writes it to `users/{uid}/devices/{deviceId}`.
*   `revokeDevice(uid: string, deviceId: string)`: Deletes the specified device document from Firestore.
*   `subscribeToDevices(uid: string)`: A listener returning the list of active devices for the UI.
*   `listenForRevocation(uid: string, onRevoked: () => void)`: A listener targeting only the *current* device document. If it represents a deletion event, it fires the callback.

#### [MODIFY] [src/app/auth.ts](file:///d:/PYTHON/Password%20Manager/src/app/auth.ts) (or [src/app/components/AppShell.tsx](file:///d:/PYTHON/Password%20Manager/src/app/components/AppShell.tsx))
*   Inject a call to `registerCurrentDevice(user.uid)` triggered on successful login / active authentication.
*   In `AppShell.tsx` (which wraps the authenticated app), initialize `listenForRevocation` so that if the user's current device is revoked remotely, the app immediately executes [signOut()](file:///d:/PYTHON/Password%20Manager/src/app/auth.ts#127-132), redirects to the login screen, and clears any local memory state ([clearSession()](file:///d:/PYTHON/Password%20Manager/src/app/store.ts#67-78)).

---

### UI Components
#### [MODIFY] [src/app/components/Settings.tsx](file:///d:/PYTHON/Password%20Manager/src/app/components/Settings.tsx)
*   Add a new "Active Devices" or "Active Sessions" section.
*   Use `subscribeToDevices` to show a real-time list of all devices logged into the account.
*   Format: `[Icon for Browser/OS] {Browser} — {OS}`
*   Highlight the current device by appending [(This Device)](file:///d:/PYTHON/Password%20Manager/src/app/App.tsx#5-23).
*   Provide a "Log out this device" action (e.g. an "X" or trash can button) for all *other* devices.

## Verification Plan

### Automated Tests
*   We'll rely on functional testing via the browser since the setup mostly impacts UI and Firestore listeners.

### Manual Verification
1.  Log in to the app on your primary browser (e.g. Edge on Windows).
2.  Open the settings and verify it shows `Edge - Windows (This Device)`.
3.  Open an incognito window or alternate browser (e.g. Chrome) and log into the same account.
4.  Navigate to Settings in the new browser; confirm both `Edge` and `Chrome` are listed.
5.  In the Chrome browser, click "Log out this device" on the `Edge` device row.
6.  Observe the Edge browser. It should instantly log out, clear its state, and return to the auth/welcome screen.
