// ─── APK Update Checker ───────────────────────────────────────────────────
// Checks whether the installed native APK version meets the minimum required
// version stored in Firestore. If not, returns an update prompt with a URL.
//
// This is SEPARATE from the OTA (Capgo) update system which handles JS-only
// changes. This service handles native-level updates that require a full APK.
//
// ─── ROOT CAUSE FIX (v3.2.6) ─────────────────────────────────────────────
//
// BUG 1 — "Update screen never appears":
//   Previously used CapacitorUpdater.current().native for the version check.
//   CapacitorUpdater.current().native returns the VERSION OF THE OTA BUNDLE,
//   not the actual installed APK version. If the app received an OTA update
//   to "3.3.1", the checker would read "3.3.1" and think no APK update is
//   needed — even if the actual APK binary is still "3.2.4".
//
//   FIX: ALWAYS use App.getInfo().version which reads the versionName
//   directly from the APK's build.gradle. This is the only reliable source
//   for the native binary version.
//
// BUG 2 — "Update screen stays after installing new APK":
//   The Firestore fetch was hitting Firestore's local SDK cache. After
//   installing a new APK, the cache might still serve stale data.
//   FIX: Use { source: 'server' } to force a fresh network fetch, bypassing
//   the local Firestore cache entirely.
//
// NEVER throws — if anything fails, returns { updateRequired: false }
// ─────────────────────────────────────────────────────────────────────────────

import { doc, getDocFromServer } from 'firebase/firestore';
import { getFirebaseDb } from '../firebase';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
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
    // ── Step 1: Get installed native APK version ─────────────────────────
    //
    // CRITICAL: Use App.getInfo().version — this reads the versionName field
    // directly from the compiled APK (set in build.gradle). This is the ONLY
    // reliable source for the native binary version.
    //
    // DO NOT use CapacitorUpdater.current().native — that value reflects the
    // OTA bundle version, not the APK binary version. On a device that received
    // an OTA update (e.g. "3.3.1"), that field would report "3.3.1" even if the
    // underlying APK binary is still "3.2.4", causing the version check to
    // incorrectly conclude no update is needed.
    let installedVersion: string | null = null;
    try {
      const appInfo = await App.getInfo();
      installedVersion = appInfo.version?.trim() ?? null;
      log.info(`[APK_UPDATE] App.getInfo().version = "${installedVersion}" (APK binary version)`);
    } catch (e) {
      log.warn('[APK_UPDATE] App.getInfo() failed:', e);
    }

    if (!installedVersion) {
      log.warn('[APK_UPDATE] Could not determine installed APK version — skipping check');
      return { updateRequired: false };
    }

    // Validate parseable semver
    const parts = installedVersion.split('.').map(Number);
    if (parts.length === 0 || isNaN(parts[0])) {
      log.warn(`[APK_UPDATE] Unparseable version string "${installedVersion}" — skipping check`);
      return { updateRequired: false };
    }

    log.info(`[APK_UPDATE] Installed APK version: "${installedVersion}"`);

    // ── Step 2: Fetch Firestore version document (always from server) ────
    //
    // CRITICAL: Use getDocFromServer() instead of getDoc().
    // getDoc() may serve stale data from the Firestore SDK local cache.
    // After the user installs a new APK, the old version of the JS bundle
    // (still running from the previous OTA) might cache the old Firestore
    // document. getDocFromServer() bypasses the local cache entirely and
    // always fetches the current value from Firestore servers.
    const db = getFirebaseDb();
    const versionRef = doc(db, VERSION_DOC_PATH, VERSION_DOC_ID);
    
    let snapshot;
    try {
      snapshot = await getDocFromServer(versionRef);
      log.info('[APK_UPDATE] Fetched version document fresh from Firestore server (cache bypassed)');
    } catch (networkErr) {
      // Network unavailable — fail open (don't block user)
      log.warn('[APK_UPDATE] Could not reach Firestore server — skipping check (offline?):', networkErr);
      return { updateRequired: false };
    }

    if (!snapshot.exists()) {
      log.warn('[APK_UPDATE] Firestore version document does not exist — skipping check');
      return { updateRequired: false };
    }

    const data = snapshot.data();
    const rawMinApkVersion = data?.min_apk_version;
    const apkDownloadUrl: string | undefined = data?.apk_download_url;

    log.info(`[APK_UPDATE] Firestore min_apk_version: ${JSON.stringify(rawMinApkVersion)} (type: ${typeof rawMinApkVersion})`);
    log.info(`[APK_UPDATE] Firestore apk_download_url: ${apkDownloadUrl}`);

    const minApkVersion = normaliseMinVersion(rawMinApkVersion);

    if (minApkVersion === null) {
      log.debug('[APK_UPDATE] min_apk_version not set or invalid in Firestore — no APK requirement active');
      return { updateRequired: false };
    }

    log.info(`[APK_UPDATE] Comparing: installed="${installedVersion}" vs required>="${minApkVersion}"`);

    // ── Step 3: Compare and return result ──────────────────────────────
    if (compareVersions(installedVersion, minApkVersion) < 0) {
      log.warn(`[APK_UPDATE] UPDATE REQUIRED — installed: "${installedVersion}", required: ">= ${minApkVersion}"`);
      // Normalise the download URL to the current (renamed) repo
      const url = (apkDownloadUrl || '')
        .replace('securevault-app', 'Keeguard') // fix old repo name
        || 'https://github.com/Mohd-afk/Keeguard/releases/latest';
      return { updateRequired: true, downloadUrl: url };
    }

    log.info(`[APK_UPDATE] APK version OK (installed: "${installedVersion}" >= required: "${minApkVersion}")`);
    return { updateRequired: false };

  } catch (err) {
    // Any error → fail silently. Never crash the app for a version check.
    log.warn('[APK_UPDATE] Check failed (non-fatal) — assuming no update required:', err);
    return { updateRequired: false };
  }
}
