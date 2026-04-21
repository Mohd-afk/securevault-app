import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import path from 'path';

// Dynamically use the path we found
const FIRETOOLS = 'C:/Users/mohdj/AppData/Local/npm-cache/_npx/7750544ccf494d8b/node_modules/firebase-tools';
const fireauth = require(FIRETOOLS + '/lib/auth.js');

const account = fireauth.getGlobalDefaultAccount();
const accessToken = account.tokens?.access_token;

if (!accessToken) {
  console.error('❌ No access token found. Please run: npx firebase-tools login');
  process.exit(1);
}
console.log('Got access token for:', account.user?.email);

const PROJECT = 'vault-app-ba6e2';
const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/app_config/latest_version`;

const body = {
  fields: {
    // OTA versioning (preserving current OTA state or bumping slightly)
    version:         { stringValue:  '3.2.0' },
    url:             { stringValue:  `https://${PROJECT}.web.app/bundles/3.2.0.zip` },
    critical:        { booleanValue: false },
    releaseNotes:    { stringValue:  'v3.2.0 - Android Autofill Native Service Release' },
    releasedAt:      { stringValue:  new Date().toISOString() },
    
    // APK versioning
    min_apk_version: { stringValue:  '3.2.0' },
    apk_download_url:{ stringValue:  'https://github.com/Mohd-afk/securevault-app/releases/tag/v3.2.0' },
    
    // Also store version code for internal tracking if needed
    versionCode:     { integerValue: '5' }
  }
};

console.log('Updating Firestore: app_config/latest_version to require v3.2.0 ...');
const resp = await fetch(url + '?updateMask.fieldPaths=version&updateMask.fieldPaths=url&updateMask.fieldPaths=critical&updateMask.fieldPaths=releaseNotes&updateMask.fieldPaths=releasedAt&updateMask.fieldPaths=min_apk_version&updateMask.fieldPaths=apk_download_url&updateMask.fieldPaths=versionCode', {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(body)
});

const json = await resp.json();

if (!resp.ok) {
  console.error('❌ Firestore REST API error:', JSON.stringify(json, null, 2));
  process.exit(1);
}

console.log('✅ Firestore document updated successfully!');
console.log('  New min_apk_version:', json.fields?.min_apk_version?.stringValue);
console.log('  New apk_download_url:', json.fields?.apk_download_url?.stringValue);
