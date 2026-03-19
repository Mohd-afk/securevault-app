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

## How bundles are created

Run `npm run release` which:
1. Builds the Vite project (`dist/`)
2. Zips `dist/*` into `ota-updates/bundles/{version}.zip`

## Deploying

```bash
firebase deploy --only hosting
```

Then update the Firestore document `app_config/latest_version` with the new version info.
