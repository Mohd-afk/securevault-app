// ─── APK Update Checker ───────────────────────────────────────────────────
// Checks whether the installed native APK version meets the minimum required
// version stored in Firestore. If not, returns an update prompt with a URL.
//
// This is SEPARATE from the OTA (Capgo) update system which handles JS-only
// changes. This service handles native-level updates that require a full APK.
//
// Flow:
//   1. Get app version via App.getInfo() (e.g. "3.1.0") — full semver
//   2. Fetch min_apk_version + apk_download_url from Firestore
//      min_apk_version can be stored as a string ("3.1.0") or a number (3)
//   3. Compare using semver and return { updateRequired, downloadUrl? }
//
// NEVER throws — if anything fails, returns { updateRequired: false }
// ─────────────────────────────────────────────────────────────────────────────

import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseDb } from '../firebase';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
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
 * Compare two semantic version strings.
 * Returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal.
 * Supports "3", "3.0", "3.1.0" formats.
 */
function compareVersions(v1: string, v2: string): number {
  if (!v1 || !v2) return 0;
  const p1 = v1.split('.').map(Number);
  const p2 = v2.split('.').map(Number);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const num1 = isNaN(p1[i]) ? 0 : (p1[i] ?? 0);
    const num2 = isNaN(p2[i]) ? 0 : (p2[i] ?? 0);
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

/**
 * Normalise whatever is stored in Firestore as min_apk_version into a
 * semver-compatible string.
 *
 * Firestore may store:
 *   - a number  → 4        means major version 4 (i.e. "4.0.0")
 *   - a string  → "3.1.0"  means exact semver
 *
 * Returns null if the value cannot be normalised.
 */
function normaliseMinVersion(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;

  if (typeof raw === 'number') {
    if (isNaN(raw)) return null;
    return `${raw}.0.0`;
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    // Validate: must at least have one numeric segment
    if (isNaN(Number(trimmed.split('.')[0]))) return null;
    return trimmed;
  }

  return null;
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
    // ── Step 1: Get installed native APK version via App.getInfo() ──────────
    // App.getInfo() returns the versionName from build.gradle ("3.1.0"),
    // which is the full semver that we must compare against min_apk_version.
    // This is consistent with how updater.ts reads the native version.
    let installedVersionRaw: string | null = null;

    try {
      if (Capacitor.isPluginAvailable('CapacitorUpdater')) {
        const updaterInfo = await CapacitorUpdater.current();
        installedVersionRaw = updaterInfo.native ?? null;
        log.info(`[APK_UPDATE] CapacitorUpdater.current().native = "${installedVersionRaw}"`);
      }
      
      // Fallback to App.getInfo() if CapacitorUpdater didn't provide a native version
      // or the plugin is entirely missing.
      if (!installedVersionRaw) {
        const appInfo = await App.getInfo();
        installedVersionRaw = appInfo.version ?? null;
        log.info(`[APK_UPDATE] App.getInfo().version = "${installedVersionRaw}"`);
      }
    } catch (e) {
      log.warn('[APK_UPDATE] Failed to determine installed version:', e);
    }

    if (!installedVersionRaw) {
      log.warn('[APK_UPDATE] Could not determine installed APK version — skipping check');
      return { updateRequired: false };
    }

    // Ensure it is parseable
    const installedParts = installedVersionRaw.trim().split('.').map(Number);
    if (installedParts.length === 0 || isNaN(installedParts[0])) {
      log.warn(`[APK_UPDATE] Unparseable version string "${installedVersionRaw}" — skipping check`);
      return { updateRequired: false };
    }

    const installedVersion = installedVersionRaw.trim();
    log.info(`[APK_UPDATE] Installed APK version: "${installedVersion}"`);

    // ── Step 2: Fetch Firestore version document ─────────────────────────
    const db = getFirebaseDb();
    const versionRef = doc(db, VERSION_DOC_PATH, VERSION_DOC_ID);
    const snapshot = await getDoc(versionRef);

    if (!snapshot.exists()) {
      log.warn('[APK_UPDATE] Firestore version document does not exist — skipping check');
      return { updateRequired: false };
    }

    const data = snapshot.data();
    const rawMinApkVersion = data?.min_apk_version;
    const apkDownloadUrl: string | undefined = data?.apk_download_url;

    log.info(`[APK_UPDATE] Firestore raw min_apk_version: ${JSON.stringify(rawMinApkVersion)}, type: ${typeof rawMinApkVersion}`);

    const minApkVersion = normaliseMinVersion(rawMinApkVersion);

    if (minApkVersion === null) {
      log.debug('[APK_UPDATE] min_apk_version not set or invalid in Firestore — no APK requirement active');
      return { updateRequired: false };
    }

    log.info(`[APK_UPDATE] Normalised min_apk_version: "${minApkVersion}", installed: "${installedVersion}"`);

    // ── Step 3: Compare and return result ────────────────────────────────
    if (compareVersions(installedVersion, minApkVersion) < 0) {
      log.warn(`[APK_UPDATE] UPDATE REQUIRED — installed: "${installedVersion}", required: ">= ${minApkVersion}"`);
      return {
        updateRequired: true,
        downloadUrl: apkDownloadUrl || 'https://github.com/Mohd-afk/securevault-app/releases/latest',
      };
    }

    log.info(`[APK_UPDATE] APK version OK (installed: "${installedVersion}" >= required: "${minApkVersion}")`);
    return { updateRequired: false };

  } catch (err) {
    // Any error → fail silently. Never crash the app for a version check.
    log.warn('[APK_UPDATE] Check failed (non-fatal) — assuming no update required:', err);
    return { updateRequired: false };
  }
}
