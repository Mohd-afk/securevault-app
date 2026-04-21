# OTA White Screen Fix — Root Cause Analysis & Implementation Plan

## Root Cause

The white screen after OTA update is caused by **CSP (Content Security Policy) blocking all network requests** in the new bundle.

### Why CSP Breaks OTA Bundles

The [index.html](file:///D:/PYTHON/Password%20Manager/index.html) has `connect-src 'self'` in its CSP. When the app runs from Capacitor's built-in web server, `'self'` = `http://localhost`. But when CapacitorUpdater loads the new bundle from its **internal storage path** (e.g., `file:///data/data/...`), `'self'` changes. Firebase SDK calls to `*.googleapis.com`, `*.firebaseio.com` etc. are now **blocked by CSP**. This causes:

1. The React app renders the root `<div>` (dark background)
2. Firebase Auth/Firestore calls fail silently (CSP violation)
3. The app shows a blank white/dark screen — no data, no auth, no UI

### Secondary Bug: localStorage Version Bookkeeping

In [updater.ts](file:///D:/PYTHON/Password%20Manager/src/app/services/updater.ts), `localStorage.setItem(LOCAL_VERSION_KEY, remote.version)` is called **BEFORE** `CapacitorUpdater.set()`. If the new bundle fails (e.g., due to CSP), the version is already marked as "current", so the app never retries the update.

## Proposed Changes

### CSP Fix
#### [MODIFY] [index.html](file:///D:/PYTHON/Password%20Manager/index.html)

Add wildcard `*` to `connect-src` and `https:` to ensure network requests work regardless of origin context. On native platforms, CSP `'self'` is unreliable because the serving origin changes between built-in and OTA bundles.

### Updater Fix  
#### [MODIFY] [updater.ts](file:///D:/PYTHON/Password%20Manager/src/app/services/updater.ts)

1. Move `localStorage.setItem()` to **AFTER** `CapacitorUpdater.set()` returns successfully
2. Add robust error handling and logging for the download+apply lifecycle
3. Add `appReadyTimeout` to [capacitor.config.ts](file:///D:/PYTHON/Password%20Manager/capacitor.config.ts) for debugging

### Config Fix
#### [MODIFY] [capacitor.config.ts](file:///D:/PYTHON/Password%20Manager/capacitor.config.ts)

Add `appReadyTimeout: 15000` to give the new bundle more time to call `notifyAppReady()`.

## Verification Plan

### Steps
1. Apply fixes, rebuild (`npm run build`), create new bundle (0.0.4)
2. Deploy to Firebase Hosting
3. Update Firestore version doc to 0.0.4
4. User force-closes app and reopens — should see updated UI
