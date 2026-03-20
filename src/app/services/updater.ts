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

/** Key used in localStorage to track the currently running bundle version */
const LOCAL_VERSION_KEY = 'sv_ota_current_version';

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
  log.info(`Remote version: ${remote.version}`, { critical: remote.critical });

  // 2. Compare with locally stored version
  const localVersion = localStorage.getItem(LOCAL_VERSION_KEY) || '0.0.0';
  log.info(`Local version: ${localVersion}`);

  if (remote.version === localVersion) {
    log.info('Already on latest version — no update needed');
    return;
  }

  // 3. New version available — download it
  log.info(`New version available: ${remote.version} (current: ${localVersion})`);

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
  log.info(`Downloading update bundle from: ${remote.url}`);

  try {
    // Step 1: Download the zip bundle to device storage
    const bundle = await CapacitorUpdater.download({
      url: remote.url,
      version: remote.version,
    });

    log.info(`Download complete — bundle ID: ${bundle.version}`);

    // Step 2: Apply the bundle (triggers app reload)
    await CapacitorUpdater.set(bundle);
    log.info(`Bundle set successfully — version ${remote.version}`);

    // Step 3: ONLY persist version AFTER successful set()
    localStorage.setItem(LOCAL_VERSION_KEY, remote.version);
    log.info(`Version ${remote.version} persisted to localStorage`);

  } catch (err) {
    log.error('Failed to download or apply update bundle', err);
    // DO NOT update the local version key — ensures retry on next launch
    throw err;
  }
}
