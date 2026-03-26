# OTA Update Bundles

This directory is served by Firebase Hosting. It contains the `.zip` bundles
that the `@capgo/capacitor-updater` plugin downloads to update the app.

## Structure

```
ota-updates/
└── bundles/
    ├── 2.1.0.zip
    ├── 2.2.0.zip
    └── ...
```

## How bundles are created & deployed

Automated deployment is handled by a single script. Simply run:
```bash
npm run release
```
This script sequentially:
1. Builds the Vite project (`dist/`).
2. Zips the contents into `ota-updates/bundles/{version}.zip`.
3. Deploys the new bundle to Firebase Hosting.
4. Atomically updates the Firestore document `app_config/latest_version` with the new version metadata to trigger the OTA update on client devices.

## Manual Recovery

If the automated script fails after deploying to Hosting, but before updating Firestore, you can manually update the `app_config/latest_version` document in the Firebase Console with the newly deployed version and URL.
