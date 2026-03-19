#!/usr/bin/env node
// ─── OTA Release Script ────────────────────────────────────────────
// Zips the dist/ folder into ota-updates/bundles/{version}.zip
// Run after `vite build`: npm run release
//
// After this script finishes:
//   1. firebase deploy --only hosting
//   2. Update Firestore doc: app_config/latest_version
// ─────────────────────────────────────────────────────────────────────

import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { execSync } from 'child_process';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const OTA_DIR = join(ROOT, 'ota-updates', 'bundles');

// ─── Read version from package.json ─────────────────────────────────
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

// ─── Create output directory ────────────────────────────────────────
mkdirSync(OTA_DIR, { recursive: true });

const zipPath = join(OTA_DIR, `${version}.zip`);

// ─── Zip the dist folder ────────────────────────────────────────────
// Uses PowerShell on Windows, zip on Unix
console.log(`📦 Zipping dist/ → ota-updates/bundles/${version}.zip`);

try {
  if (process.platform === 'win32') {
    // PowerShell Compress-Archive
    execSync(
      `powershell -Command "Compress-Archive -Path '${DIST}\\*' -DestinationPath '${zipPath}' -Force"`,
      { stdio: 'inherit' }
    );
  } else {
    // Unix zip
    execSync(`cd "${DIST}" && zip -r "${zipPath}" .`, { stdio: 'inherit' });
  }
} catch (err) {
  console.error('❌ Failed to create zip:', err.message);
  process.exit(1);
}

console.log('');
console.log(`✅ Bundle created: ota-updates/bundles/${version}.zip`);
console.log('');
console.log('─── Next Steps ───────────────────────────────────────');
console.log('');
console.log('  1. Deploy to Firebase Hosting:');
console.log('     firebase deploy --only hosting');
console.log('');
console.log('  2. Update Firestore document: app_config/latest_version');
console.log(`     {`);
console.log(`       "version": "${version}",`);
console.log(`       "url": "https://<your-project>.web.app/bundles/${version}.zip",`);
console.log(`       "critical": false,`);
console.log(`       "releaseNotes": "...",`);
console.log(`       "releasedAt": "${new Date().toISOString()}"`);
console.log(`     }`);
console.log('');
console.log('─────────────────────────────────────────────────────');
