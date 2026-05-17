// ─── Self-Hosted OTA Update Service ─────────────────────────────────
// Checks Firebase for new versions on app boot, downloads update bundles
// from Firebase Hosting, and applies them silently or with a force-screen.
// Uses @capgo/capacitor-updater for native bundle swapping.
//
// NOTE: notifyAppReady() is NOT called here.
// It is called DIRECTLY in App.tsx boot() BEFORE this service is invoked.
// This guarantees the ready signal fires even if Firebase init fails.
// ─────────────────────────────────────────────────────────────────────

import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseDb } from '../firebase';
import { createLogger } from '../utils/logger';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { toast } from 'sonner';

const log = createLogger('OTA');

// ─── Constants ──────────────────────────────────────────────────────

/** Keys used in localStorage to track the OTA update state */
const PENDING_VERSION_KEY = 'sv_ota_pending_version';
const PENDING_BUNDLE_ID_KEY = 'sv_ota_pending_bundle_id';
const ACTIVE_VERSION_KEY = 'sv_ota_active_version';
const FAILED_VERSIONS_KEY = 'sv_ota_failed_versions';
/** Written before reload() — read by App.tsx on next boot to show the success toast */
export const OTA_JUST_UPDATED_KEY = 'sv_ota_just_updated';
/**
 * Tracks the native binary version (from App.getInfo()) that was running
 * when OTA state was last written. If the native version changes (i.e. the
 * user installed a new APK from GitHub Releases), all OTA state becomes
 * invalid and must be cleared to prevent the false-rollback poisoning path.
 */
const NATIVE_VERSION_KEY = 'sv_ota_native_version';

/** Firestore path: app_config/latest_version */
const VERSION_DOC_PATH = 'app_config';
const VERSION_DOC_ID = 'latest_version';

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Compare two semantic version strings.
 * Returns 1 if v1 > v2, -1 if v1 < v2, 0 if v1 === v2.
 */
function compareVersions(v1: string, v2: string): number {
  if (!v1 || !v2) return 0;
  const p1 = v1.split('.').map(Number);
  const p2 = v2.split('.').map(Number);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

function addFailedVersion(version: string) {
  if (!version) return;
  try {
    const list = JSON.parse(localStorage.getItem(FAILED_VERSIONS_KEY) || '[]');
    if (!list.includes(version)) {
      list.push(version);
      localStorage.setItem(FAILED_VERSIONS_KEY, JSON.stringify(list));
    }
  } catch (e) {
    // Ignore JSON parse errors
  }
}

function hasFailedVersion(version: string): boolean {
  try {
    const list = JSON.parse(localStorage.getItem(FAILED_VERSIONS_KEY) || '[]');
    return list.includes(version);
  } catch (e) {
    return false;
  }
}

// ─── Types ──────────────────────────────────────────────────────────

interface VersionMetadata {
  version: string;
  url: string;
  critical: boolean;
  checksum?: string;
  releaseNotes?: string;
  minAppVersion?: string;
  releasedAt?: string;
}

interface UpdaterOptions {
  /** Callback fired when a critical update is downloading — show blocker UI */
  onCriticalUpdate?: () => void;
}

// ─── Core Functions ─────────────────────────────────────────────────

/**
 * Check for OTA updates and apply if a newer version is found.
 * Call AFTER notifyAppReady() and AFTER initFirebase() have both been called.
 *
 * Flow:
 * 1. Fetch latest version metadata from Firestore
 * 2. Compare with locally stored version
 * 3. If newer: download bundle → set bundle → THEN persist version
 */
export async function initUpdater(options: UpdaterOptions = {}): Promise<void> {
  // OTA updates only work on native platforms (Android/iOS), not web
  if (!Capacitor.isNativePlatform()) {
    log.debug('Skipping OTA updater — not a native platform');
    return;
  }

  // ── MIGRATION GUARD: Detect native APK version changes ──────────────────
  // Problem: resetWhenUpdate=false means localStorage persists across APK
  // installs. If the user installs a new major APK (e.g. v3.0.0) while an OTA
  // download was in progress (sv_ota_pending_version = "3.0.2"), the new APK
  // boots with isBuiltin=true AND a stale pending version. The boot logic below
  // sees (isBuiltin + pendingVersion) and calls addFailedVersion("3.0.2"),
  // permanently blacklisting v3.0.2. The OTA check then sees
  // hasFailedVersion("3.0.2") === true and SKIPS IT FOREVER.
  //
  // Fix: compare current native binary version against what was stored when OTA
  // state was last written. On mismatch, wipe all OTA keys before any further
  // logic runs, giving the updater a clean slate on the new native base.
  try {
    let currentNativeVersion: string;
    try {
      const current = await CapacitorUpdater.current();
      currentNativeVersion = current.native || (await App.getInfo()).version;
    } catch(e) {
      currentNativeVersion = (await App.getInfo()).version;
    }
    const storedNativeVersion = localStorage.getItem(NATIVE_VERSION_KEY);

    if (storedNativeVersion && storedNativeVersion !== currentNativeVersion) {
      log.warn(
        `[OTA MIGRATION] Native APK version changed: ${storedNativeVersion} → ${currentNativeVersion}. ` +
        `Clearing all stale OTA state to prevent false-rollback poisoning.`
      );
      // Clear all OTA keys. Without this, a version that was mid-download when
      // the APK was replaced would be permanently marked as "failed" (rolled back)
      // and never re-attempted, silently blocking all future OTA updates.
      localStorage.removeItem(PENDING_VERSION_KEY);
      localStorage.removeItem(PENDING_BUNDLE_ID_KEY);
      localStorage.removeItem(ACTIVE_VERSION_KEY);
      localStorage.removeItem(FAILED_VERSIONS_KEY);
      log.info('[OTA MIGRATION] All OTA localStorage keys cleared. OTA state reset for new native base.');
    }

    // Always persist the current native version so future boots can detect changes.
    localStorage.setItem(NATIVE_VERSION_KEY, currentNativeVersion);
    log.debug(`[OTA MIGRATION] Native version recorded: ${currentNativeVersion}`);
  } catch (e) {
    log.warn('[OTA MIGRATION] Could not read native version for check. Skipping migration guard.', e);
  }

  // Verification step: check if we just rebooted from an update
  try {
    const pendingVersion = localStorage.getItem(PENDING_VERSION_KEY);
    const pendingBundleId = localStorage.getItem(PENDING_BUNDLE_ID_KEY);
    
    const current = await CapacitorUpdater.current();
    const currentBundleId = current?.bundle?.id || 'builtin';
    const currentBundleVersion = current?.bundle?.version || 'N/A';
    const isBuiltin = currentBundleId === 'builtin';
    const bundleIdMatch = !!(pendingBundleId && currentBundleId === pendingBundleId);

    log.info(`[OTA DIAGNOSTICS] Post-boot state:
      - pendingVersion: ${pendingVersion}
      - pendingBundleId: ${pendingBundleId}
      - current.bundle.id: ${currentBundleId}
      - current.bundle.version: ${currentBundleVersion}
      - isBuiltin: ${isBuiltin}
      - bundleIdMatch: ${bundleIdMatch}
    `);

    if (bundleIdMatch && !isBuiltin) {
      log.info(`[OTA_EVENT: promoted] Promoting pending OTA version ${pendingVersion} to ACTIVE post-restart`);
      if (pendingVersion) localStorage.setItem(ACTIVE_VERSION_KEY, pendingVersion);
      localStorage.removeItem(PENDING_VERSION_KEY);
      localStorage.removeItem(PENDING_BUNDLE_ID_KEY);
    } else if (isBuiltin) {
      if (pendingBundleId || pendingVersion) {
        log.warn(`OTA update failed or was cleared. Capgo is on 'builtin'. Clearing any pending state to prevent false success loops.`);
        if (pendingVersion) addFailedVersion(pendingVersion);
        log.warn(`[OTA_EVENT: rollback_detected] Version ${pendingVersion || 'unknown'} failed to boot native bundle. Recorded as failed.`);
        localStorage.removeItem(PENDING_VERSION_KEY);
        localStorage.removeItem(PENDING_BUNDLE_ID_KEY);
      } else {
        // ── POISON CLEAR ─────────────────────────────────────────────────
        // We are on builtin with no pending download — a clean boot.
        // Clear ACTIVE_VERSION_KEY so the next update check sees 0.0.0
        // and always attempts a fresh download. Also wipe the failed list
        // because previous failures were tied to a different bundle slot.
        const activeV = localStorage.getItem(ACTIVE_VERSION_KEY);
        if (activeV) {
          log.warn(`[OTA POISON CLEAR] On builtin with no pending. Clearing ACTIVE_VERSION_KEY=${activeV} and FAILED_VERSIONS_KEY to unblock updates.`);
          localStorage.removeItem(ACTIVE_VERSION_KEY);
          localStorage.removeItem(FAILED_VERSIONS_KEY);
        }
      }
    } else if (!bundleIdMatch) {
      log.warn(`Bundle mismatch. Expected ${pendingBundleId}, got ${currentBundleId}. Not promoting pending version.`);
    }

  } catch (e) {
    log.warn(`Could not verify current bundle from CapacitorUpdater:`, e);
  }

  try {
    await checkForUpdate(options);
  } catch (err) {
    // Never crash the app because of an update check failure
    log.error('Update check failed — user stays on current version', err);
  }
}

/**
 * Fetch version metadata from Firestore, compare, and apply if newer.
 */
async function checkForUpdate(options: UpdaterOptions): Promise<void> {
  log.info(`[OTA_EVENT: check] Starting OTA check sequence...`);

  // 1. Read the latest version doc from Firestore
  const db = getFirebaseDb();
  const versionRef = doc(db, VERSION_DOC_PATH, VERSION_DOC_ID);
  const snapshot = await getDoc(versionRef);

  if (!snapshot.exists()) {
    log.warn('No version document found in Firestore — skipping update check');
    return;
  }

  const remote = snapshot.data() as VersionMetadata;
  log.info(`Remote version: ${remote.version}`, { critical: remote.critical, minAppVersion: remote.minAppVersion });

  // 2. Compare with locally stored active version
  const activeVersion = localStorage.getItem(ACTIVE_VERSION_KEY) || '0.0.0';
  log.info(`Local active version: ${activeVersion}`);

  if (compareVersions(remote.version, activeVersion) <= 0) {
    log.info(`[OTA_EVENT: check_skip] Already on latest or newer version (${activeVersion} >= ${remote.version}). No update needed.`);
    return;
  }

  // 2.5 Ensure native minimum app version requirements are met
  if (remote.minAppVersion) {
    try {
      let nativeVersion: string;
      try {
        const currentInfo = await CapacitorUpdater.current();
        nativeVersion = currentInfo.native || (await App.getInfo()).version;
      } catch(e) {
        nativeVersion = (await App.getInfo()).version;
      }
      if (compareVersions(nativeVersion, remote.minAppVersion) < 0) {
        log.warn(`[OTA_EVENT: check_failed] Remote update requires minAppVersion ${remote.minAppVersion}, but native app is ${nativeVersion}. Skipping.`);
        return;
      }
    } catch (e) {
      log.warn('Could not check native version for minAppVersion enforcement', e);
    }
  }

  // 2.6 Reject known broken bundles
  if (hasFailedVersion(remote.version)) {
    log.warn(`[OTA_EVENT: skip_failed] Remote version ${remote.version} previously failed to boot. Skipping to prevent infinite crash loop.`);
    return;
  }

  // 3. New version available — download it
  log.info(`New version available: ${remote.version} (active: ${activeVersion})`);

  // Guard: if the bundle URL is empty/missing, this is an APK-only release.
  // There is no OTA zip to fetch. Skip silently — the APK update checker will
  // handle notifying the user via ApkUpdateBanner instead.
  if (!remote.url || !remote.url.trim()) {
    log.warn(
      `[OTA_EVENT: skip_no_url] Remote version ${remote.version} has no OTA bundle URL. ` +
      `This is an APK-only release. Skipping OTA download to avoid breaking the app.`
    );
    return;
  }

  if (remote.critical) {
    log.warn('CRITICAL update — showing force-update screen');
    options.onCriticalUpdate?.();
  }

  await downloadAndApply(remote);
}

/**
 * Download the update bundle and apply it.
 *
 * IMPORTANT: Version is persisted ONLY AFTER a successful set().
 * If download or set fails, the local version key is NOT updated,
 * ensuring the app retries on next launch.
 */
async function downloadAndApply(remote: VersionMetadata): Promise<void> {
  log.info(`[OTA_EVENT: downloading] Downloading bundle from: ${remote.url}`);

  // Show a persistent loading toast so the user knows something is happening
  const toastId = toast.loading('⬇️ Downloading update...', {
    description: `Keeguard v${remote.version} is being installed`,
    duration: Infinity,
  });

  try {
    // Step 1: Download the zip bundle to device storage
    // NOTE: Do NOT pass checksum — Capgo uses its own internal format.
    // Passing a plain SHA-256 hex string causes silent checksum mismatch failures.
    const bundle = await CapacitorUpdater.download({
      url: remote.url,
      version: remote.version,
    });

    log.info(`[OTA_EVENT: downloaded] Bundle: ${bundle.id}`);

    // Step 2: Persist state as PENDING before applying.
    // We do NOT set it as active until the next successful boot.
    localStorage.setItem(PENDING_VERSION_KEY, remote.version);
    localStorage.setItem(PENDING_BUNDLE_ID_KEY, bundle.id);
    log.info(`Version ${remote.version} (bundle: ${bundle.id}) marked as pending in localStorage`);

    // Step 3: Write the "just updated" key BEFORE reloading.
    // The new bundle will boot, read this key in App.tsx, and show the success toast.
    localStorage.setItem(OTA_JUST_UPDATED_KEY, remote.version);

    // Dismiss loading toast and show brief "restarting" message
    toast.dismiss(toastId);
    toast.success('Update downloaded! Restarting...', { duration: 2000 });

    // Small grace period so the toast is visible before reload
    await new Promise(r => setTimeout(r, 1800));

    // Step 4: Stage the bundle for next boot, then reload cleanly.
    log.info(`[OTA_EVENT: set_called] Staging bundle ${bundle.id} via next(), then reloading...`);
    await CapacitorUpdater.next({ id: bundle.id });
    await CapacitorUpdater.reload();
  } catch (err) {
    toast.dismiss(toastId);
    toast.error('Update failed', {
      description: 'Could not download the update. Will retry next launch.',
      duration: 5000,
    });
    console.error('Failed to download or apply update bundle', err);
    // Remove pending keys if we failed to call set()
    localStorage.removeItem(PENDING_VERSION_KEY);
    localStorage.removeItem(PENDING_BUNDLE_ID_KEY);
    localStorage.removeItem(OTA_JUST_UPDATED_KEY);
    throw err;
  }
}

