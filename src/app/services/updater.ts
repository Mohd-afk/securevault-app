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

const log = createLogger('OTA');

// ─── Constants ──────────────────────────────────────────────────────

/** Keys used in localStorage to track the OTA update state */
const PENDING_VERSION_KEY = 'sv_ota_pending_version';
const PENDING_BUNDLE_ID_KEY = 'sv_ota_pending_bundle_id';
const ACTIVE_VERSION_KEY = 'sv_ota_active_version';

/** Firestore path: app_config/latest_version */
const VERSION_DOC_PATH = 'app_config';
const VERSION_DOC_ID = 'latest_version';

// ─── Types ──────────────────────────────────────────────────────────

interface VersionMetadata {
  version: string;
  url: string;
  critical: boolean;
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

  // Verification step: check if we just rebooted from an update
  try {
    const pendingVersion = localStorage.getItem(PENDING_VERSION_KEY);
    const pendingBundleId = localStorage.getItem(PENDING_BUNDLE_ID_KEY);
    
    const current = await CapacitorUpdater.current();
    log.info(`Post-boot verification - Current CapacitorUpdater bundle:`, current);

    if (pendingBundleId && current?.bundle?.id === pendingBundleId) {
      log.info(`Promoting pending OTA version ${pendingVersion} to ACTIVE post-restart`);
      if (pendingVersion) localStorage.setItem(ACTIVE_VERSION_KEY, pendingVersion);
      localStorage.removeItem(PENDING_VERSION_KEY);
      localStorage.removeItem(PENDING_BUNDLE_ID_KEY);
    } else if (pendingBundleId && current?.bundle?.id === 'builtin') {
      log.warn(`OTA update failed to apply. Capgo is still on 'builtin'. Clearing pending state.`);
      localStorage.removeItem(PENDING_VERSION_KEY);
      localStorage.removeItem(PENDING_BUNDLE_ID_KEY);
    } else if (pendingVersion && !pendingBundleId) {
      log.warn(`Found pending version without bundle ID. Skipping promotion to prevent false success state.`);
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
  console.log("Updater started");
  log.info('Checking for updates...');

  // 1. Read the latest version doc from Firestore
  const db = getFirebaseDb();
  const versionRef = doc(db, VERSION_DOC_PATH, VERSION_DOC_ID);
  const snapshot = await getDoc(versionRef);

  if (!snapshot.exists()) {
    log.warn('No version document found in Firestore — skipping update check');
    return;
  }

  const remote = snapshot.data() as VersionMetadata;
  console.log("Remote version:", remote.version);
  log.info(`Remote version: ${remote.version}`, { critical: remote.critical });

  // 2. Compare with locally stored active version
  const activeVersion = localStorage.getItem(ACTIVE_VERSION_KEY) || '0.0.0';
  log.info(`Local active version: ${activeVersion}`);

  if (remote.version === activeVersion) {
    log.info('Already on latest version — no update needed');
    return;
  }

  // 3. New version available — download it
  log.info(`New version available: ${remote.version} (active: ${activeVersion})`);

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
  console.log("Updater started: Downloading update bundle from:", remote.url);

  try {
    // Step 1: Download the zip bundle to device storage
    const bundle = await CapacitorUpdater.download({
      url: remote.url,
      version: remote.version,
    });

    console.log("Downloaded bundle:", bundle);

    // Step 2: Persist state as PENDING before applying.
    // We do NOT set it as active until the next successful boot.
    localStorage.setItem(PENDING_VERSION_KEY, remote.version);
    localStorage.setItem(PENDING_BUNDLE_ID_KEY, bundle.id);
    console.log(`Version ${remote.version} (bundle: ${bundle.id}) marked as pending in localStorage`);

    // Step 3: Apply the bundle (triggers immediate app reload)
    // NOTE: We are intentionally using .set() for immediate validation testing.
    // For normal releases later, .next() is safer.
    await CapacitorUpdater.set({ id: bundle.id });
    
    console.log("SET CALLED SUCCESSFULLY (You should not see this if the bridge correctly reloads the WebView)");
  } catch (err) {
    console.error('Failed to download or apply update bundle', err);
    // Remove pending keys if we failed to call set()
    localStorage.removeItem(PENDING_VERSION_KEY);
    localStorage.removeItem(PENDING_BUNDLE_ID_KEY);
    throw err;
  }
}

