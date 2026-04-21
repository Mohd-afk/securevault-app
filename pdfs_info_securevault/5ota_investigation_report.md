# OTA Failure Investigation & Plan

## What We Did (Summary of OTA Fixes)

Over the past few updates, we implemented a robust isolation approach to fix the OTA pipeline in `0.0.7` and `0.0.8`. Here is a summary of the changes:

1. **Boot Sequence Rewrite ([App.tsx](file:///D:/PYTHON/Password%20Manager/src/app/App.tsx)):**
   - We decoupled `CapacitorUpdater.notifyAppReady()` from the update-checking process. It is now the **absolute first thing** that runs when the app boots. This guarantees the bundle is marked as "healthy" preventing automatic rollbacks.
2. **Deferred Firebase Init ([firebase.ts](file:///D:/PYTHON/Password%20Manager/src/app/firebase.ts)):** 
   - Firebase initialization was moved from module-load time into a deferred [initFirebase()](file:///D:/PYTHON/Password%20Manager/src/app/firebase.ts#44-90) function, preventing module-level crashes from halting the boot sequence.
3. **Safe Area Fixes (`0.0.8`):**
   - Added `max(env(safe-area-inset-bottom), 20px)` to [TrashBin](file:///D:/PYTHON/Password%20Manager/src/app/components/TrashBin.tsx#28-137), [Settings](file:///D:/PYTHON/Password%20Manager/src/app/components/Settings.tsx#93-1503), [ItemDetail](file:///D:/PYTHON/Password%20Manager/src/app/components/ItemDetail.tsx#28-328), and [AddEditForm](file:///D:/PYTHON/Password%20Manager/src/app/components/AddEditForm.tsx#9-207) to prevent overlapping with system navigation bars on mobile.
4. **Dynamic Version Display ([Settings.tsx](file:///D:/PYTHON/Password%20Manager/src/app/components/Settings.tsx)):**
   - Changed the "About" section to dynamically import the version from [package.json](file:///d:/PYTHON/Password%20Manager/package.json) instead of hardcoding `2.0.0`.

---

## Why The OTA Check Failed ("still on 2.0.0")

I have audited the system to understand why no update popups occurred and why the version remained on `2.0.0`. 

There are **two critical flaws** in [src/app/services/updater.ts](file:///D:/PYTHON/Password%20Manager/src/app/services/updater.ts):

### Flaw 1: Capacitor Native Bridge Strictness!
Currently, the update is applied via:
```typescript
const bundle = await CapacitorUpdater.download({ ... });
await CapacitorUpdater.set(bundle);
```
However, the `bundle` object returned by `.download()` contains many fields ([id](file:///D:/PYTHON/Password%20Manager/src/app/store.ts#157-160), `version`, `downloaded`, `status`). The `@capgo/capacitor-updater` `.set(options: BundleId)` method strictly expects **only** `{ id: string }`. 

In Capacitor, passing objects with unmapped properties across the native Swift/Java bridge often results in an immediate `MethodNotImplemented` or `Invalid arguments` error. 

Because [set()](file:///D:/PYTHON/Password%20Manager/node_modules/@capgo/capacitor-updater/dist/esm/definitions.d.ts#475-499) threw a hidden error:
- The update was never applied.
- The `catch` block caught the error silently.
- The app continued booting normally into the OLD version (`0.0.7`, which hardcodes "2.0.0").
- No infinite loops, no crashes, just a silent failure.

### Flaw 2: The Infinite Reload Trap (Awaiting us)
In [updater.ts](file:///D:/PYTHON/Password%20Manager/src/app/services/updater.ts), we currently persist the new version to localStorage **AFTER** `.set()` is called:
```typescript
await CapacitorUpdater.set(bundle); // <--- DESTROYS JS CONTEXT
localStorage.setItem(LOCAL_VERSION_KEY, remote.version); // <--- NEVER RUNS
```
`.set()` is a terminal action. It immediately destroys the WebView context and forces a reload. If we actually succeeded in calling `.set()`, the `localStorage` item would never be saved. 
On the next boot, the newly updated app would think its local version is still `"0.0.0"`, find `0.0.8`, redownload `0.0.8`, and reboot again—creating an inescapable infinite reload loop. 

---

## Implementation Plan

We will fix [updater.ts](file:///D:/PYTHON/Password%20Manager/src/app/services/updater.ts) and release version `0.0.9`.

### 1. Fix the Local Storage persistence order
Move `localStorage.setItem` to **before** `.set()` so the version is accurately recorded before the JS context dies.

### 2. Fix the Native arguments for `.set()`
Provide exactly the arguments the native plugin asks for: `{ id: bundle.id }`

### 3. Change `.set()` to `.next()` (Optional but recommended)
`.set()` forces an abrupt app reload which disrupts the user right after downloading. It is often better to use `.next({ id: bundle.id })`, which queues the update to install silently the next time the app is minimised or closed. This solves the JS context destruction issue entirely. However, to guarantee you can test it immediately, I will continue using `.set()` for now, but configured properly.

**Proposed fix for [updater.ts](file:///D:/PYTHON/Password%20Manager/src/app/services/updater.ts):**
```typescript
const bundle = await CapacitorUpdater.download({
  url: remote.url,
  version: remote.version,
});

log.info(`Download complete — bundle ID: ${bundle.version}`);

// Persist BEFORE setting, because set() kills the JavaScript context!
localStorage.setItem(LOCAL_VERSION_KEY, remote.version);
log.info(`Version ${remote.version} persisted to localStorage`);

// Pass strictly { id: bundle.id } to avoid Capacitor bridge errors
await CapacitorUpdater.set({ id: bundle.id });
```
