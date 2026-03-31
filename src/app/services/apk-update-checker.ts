// ─── APK Update Checker ───────────────────────────────────────────────────
// Checks whether the installed native APK version meets the minimum required
// version stored in Firestore. If not, returns an update prompt with a URL.
//
// This is SEPARATE from the OTA (Capgo) update system which handles JS-only
// changes. This service handles native-level updates that require a full APK.
//
// Flow:
//   1. Get current.native from CapacitorUpdater (e.g. "3.0", "1.0")
//   2. Fetch min_apk_version + apk_download_url from Firestore
//   3. Compare and return { updateRequired, downloadUrl? }
//
// NEVER throws — if anything fails, returns { updateRequired: false }
// ─────────────────────────────────────────────────────────────────────────────

import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseDb } from '../firebase';
import { Capacitor } from '@capacitor/core';
import { createLogger } from '../utils/logger';

const log = createLogger('APK_UPDATE');

/** Firestore document that holds both OTA and APK version metadata */
const VERSION_DOC_PATH = 'app_config';
const VERSION_DOC_ID = 'latest_version';

export interface ApkUpdateCheckResult {
  updateRequired: boolean;
  downloadUrl?: string;
}

/**
 * Parse a native version string like "2.0", "3.0", "1" into an integer.
 * Takes the major component only.
 * Returns null if the string cannot be parsed.
 */
function parseNativeVersion(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  // Accept "3", "3.0", "3.0.0" — take only the first numeric segment
  const major = parseInt(trimmed.split('.')[0], 10);
  if (isNaN(major)) return null;
  return major;
}

/**
 * Check whether the installed APK version meets the minimum required version.
 *
 * @returns { updateRequired: true, downloadUrl } when an APK update is needed.
 * @returns { updateRequired: false } in all other cases (up-to-date or error).
 */
export async function checkApkUpdateRequired(): Promise<ApkUpdateCheckResult> {
  // Only meaningful on native platforms — always OK on web
  if (!Capacitor.isNativePlatform()) {
    log.debug('Skipping APK update check — not a native platform');
    return { updateRequired: false };
  }

  try {
    // ── Step 1: Get installed native APK version ─────────────────────────
    const current = await CapacitorUpdater.current();
    const nativeVersionRaw = current?.native;

    log.info(`[APK_UPDATE] CapacitorUpdater.current().native = "${nativeVersionRaw}"`);

    const installedApkVersion = parseNativeVersion(nativeVersionRaw);
    if (installedApkVersion === null) {
      log.warn('[APK_UPDATE] Could not parse native version string — skipping check');
      return { updateRequired: false };
    }

    log.info(`[APK_UPDATE] Parsed installed APK version: ${installedApkVersion}`);

    // ── Step 2: Fetch Firestore version document ─────────────────────────
    const db = getFirebaseDb();
    const versionRef = doc(db, VERSION_DOC_PATH, VERSION_DOC_ID);
    const snapshot = await getDoc(versionRef);

    if (!snapshot.exists()) {
      log.warn('[APK_UPDATE] Firestore version document does not exist — skipping check');
      return { updateRequired: false };
    }

    const data = snapshot.data();
    const minApkVersion: number | undefined = data?.min_apk_version;
    const apkDownloadUrl: string | undefined = data?.apk_download_url;

    if (typeof minApkVersion !== 'number') {
      log.debug('[APK_UPDATE] min_apk_version not set in Firestore — no APK requirement active');
      return { updateRequired: false };
    }

    log.info(`[APK_UPDATE] Firestore min_apk_version: ${minApkVersion}, apk_download_url: ${apkDownloadUrl}`);

    // ── Step 3: Compare and return result ────────────────────────────────
    if (installedApkVersion < minApkVersion) {
      log.warn(`[APK_UPDATE] UPDATE REQUIRED — installed: ${installedApkVersion}, required: ${minApkVersion}`);
      return {
        updateRequired: true,
        downloadUrl: apkDownloadUrl || 'https://github.com/Mohd-afk/securevault-app/releases/latest',
      };
    }

    log.info(`[APK_UPDATE] APK version OK (installed: ${installedApkVersion} >= required: ${minApkVersion})`);
    return { updateRequired: false };

  } catch (err) {
    // Any error → fail silently. Never crash the app for a version check.
    log.warn('[APK_UPDATE] Check failed (non-fatal) — assuming no update required:', err);
    return { updateRequired: false };
  }
}
