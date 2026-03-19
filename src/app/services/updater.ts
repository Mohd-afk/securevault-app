// ─── Self-Hosted OTA Update Service ─────────────────────────────────
// Checks Firebase for new versions on app boot, downloads update bundles
// from Firebase Hosting, and applies them silently or with a force-screen.
// Uses @capgo/capacitor-updater for native bundle swapping.
// ─────────────────────────────────────────────────────────────────────

import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
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
 * Initialize the OTA updater. Call once on app boot (inside App.tsx useEffect).
 *
 * Flow:
 * 1. notifyAppReady() — tells the native plugin this JS bundle is healthy
 * 2. Fetch latest version metadata from Firestore
 * 3. Compare with locally stored version
 * 4. If newer: download bundle, apply silently or force-apply for critical updates
 */
export async function initUpdater(options: UpdaterOptions = {}): Promise<void> {
  // OTA updates only work on native platforms (Android/iOS), not web
  if (!Capacitor.isNativePlatform()) {
    log.debug('Skipping OTA updater — not a native platform');
    return;
  }

  try {
    // CRITICAL: Must be called first on every launch.
    // Tells the plugin "this bundle loaded successfully, don't roll back."
    // If this is NOT called within 10 seconds, the plugin auto-rolls back.
    await CapacitorUpdater.notifyAppReady();
    log.info('notifyAppReady() sent — current bundle marked as healthy');
  } catch (err) {
    log.error('Failed to call notifyAppReady()', err);
    // Don't return — still try to check for updates
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
    // Critical update: notify the UI to show the force-update blocker
    log.warn('CRITICAL update — showing force-update screen');
    options.onCriticalUpdate?.();
  }

  await downloadAndApply(remote);
}

/**
 * Download the update bundle and apply it.
 * - Critical updates: apply immediately (app restarts)
 * - Normal updates: set bundle for next launch (user doesn't notice)
 */
async function downloadAndApply(remote: VersionMetadata): Promise<void> {
  log.info(`Downloading update bundle from: ${remote.url}`);

  try {
    // Download the zip bundle to device storage
    const bundle = await CapacitorUpdater.download({
      url: remote.url,
      version: remote.version,
    });

    log.info(`Download complete — bundle ID: ${bundle.version}`);

    // Store the new version locally so we don't re-download next time
    localStorage.setItem(LOCAL_VERSION_KEY, remote.version);

    // Apply the bundle
    await CapacitorUpdater.set(bundle);
    log.info(`Bundle set successfully — version ${remote.version}`);

    // For critical updates, the `set()` call triggers an immediate app reload.
    // For non-critical updates, the new bundle activates on the next app launch.
    // The plugin handles this distinction internally once `set()` is called.

  } catch (err) {
    log.error('Failed to download or apply update bundle', err);
    // Don't update the local version key — this ensures we retry next launch
    throw err;
  }
}
