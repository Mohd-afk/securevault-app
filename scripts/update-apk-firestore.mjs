import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import admin from 'firebase-admin';

const ROOT = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
const version = pkg.version;

const files = readdirSync(ROOT);
const serviceAccountFile = files.find(f => f.startsWith('vault-app-ba6e2-firebase-adminsdk') && f.endsWith('.json'));

if (!serviceAccountFile) {
  console.error('Could not find Firebase Admin service account JSON file matching vault-app-ba6e2-firebase-adminsdk... in root!');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(join(ROOT, serviceAccountFile), 'utf-8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
await db.collection('app_config').doc('latest_version').set({
  min_apk_version: version,
  apk_download_url: `https://github.com/Mohd-afk/Keeguard/releases/download/v${version}/app-debug.apk`
}, { merge: true });

console.log(`Successfully updated Firestore min_apk_version to ${version}`);
process.exit(0);
