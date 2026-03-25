#!/usr/bin/env node
// ─── OTA Release Script ────────────────────────────────────────────
// Zips the dist/ folder, deploys to Firebase Hosting, and updates
// the Firestore latest_version document all in one step.
// Run after `vite build`: node scripts/release-ota.mjs
// ─────────────────────────────────────────────────────────────────────

import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { execSync } from 'child_process';
import admin from 'firebase-admin';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const OTA_DIR = join(ROOT, 'ota-updates', 'bundles');

// ─── 1. Read version from package.json ──────────────────────────────
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
const version = pkg.version;

if (!version) {
  console.error('❌ No "version" field found in package.json');
  process.exit(1);
}

if (!existsSync(DIST)) {
  console.error('❌ dist/ folder not found. Run "npm run build" first.');
  process.exit(1);
}

// ─── 2. Create output directory ──────────────────────────────────────
mkdirSync(OTA_DIR, { recursive: true });

const zipPath = join(OTA_DIR, `${version}.zip`);

// ─── 3. Zip the dist folder ──────────────────────────────────────────
console.log(`📦 Zipping dist/ → ota-updates/bundles/${version}.zip`);

try {
  if (process.platform === 'win32') {
    execSync(
      `powershell -Command "Compress-Archive -Path '${DIST}\\*' -DestinationPath '${zipPath}' -Force"`,
      { stdio: 'inherit' }
    );
  } else {
    execSync(`cd "${DIST}" && zip -r "${zipPath}" .`, { stdio: 'inherit' });
  }
} catch (err) {
  console.error('❌ Failed to create zip:', err.message);
  process.exit(1);
}
console.log(`✅ Bundle created: ota-updates/bundles/${version}.zip\n`);

// ─── 4. Deploy to Firebase Hosting ──────────────────────────────────
console.log(`🚀 Deploying to Firebase Hosting...`);
try {
  execSync('npx firebase-tools deploy --only hosting', { stdio: 'inherit', cwd: ROOT });
} catch (err) {
  console.error('❌ Firebase Hosting deploy failed. Aborting Firestore update.');
  process.exit(1); // Release gate: don't update Firestore if hosting fails
}
console.log(`✅ Hosting deployment successful.\n`);

// ─── 5. Update Firestore Metadata ───────────────────────────────────
console.log(`📝 Updating Firestore app_config/latest_version...`);

// Find the service account file
const files = readdirSync(ROOT);
const serviceAccountFile = files.find(f => f.startsWith('vault-app-ba6e2-firebase-adminsdk') && f.endsWith('.json'));

if (!serviceAccountFile) {
  console.error('❌ Could not find Firebase Admin service account JSON file matching vault-app-ba6e2-firebase-adminsdk... in root!');
  process.exit(1);
}

try {
  const serviceAccount = JSON.parse(readFileSync(join(ROOT, serviceAccountFile), 'utf-8'));
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  const db = admin.firestore();
  await db.collection('app_config').doc('latest_version').set({
    version: version,
    url: `https://vault-app-ba6e2.web.app/bundles/${version}.zip`,
    critical: false,
    releaseNotes: `Automated release ${version}`,
    releasedAt: new Date().toISOString()
  });
  
  console.log(`✅ Firestore successfully updated to version ${version}`);
} catch (err) {
  console.error('❌ Failed to update Firestore:', err);
  process.exit(1);
}

console.log('\n🎉 OTA Release completely finished successfully!');
process.exit(0);
