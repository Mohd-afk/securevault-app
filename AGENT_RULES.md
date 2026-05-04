# Agent Instructions for Keeguard

> [!IMPORTANT]
> **Branding Note:** This app was previously called **SecureVault**. It is now called **Keeguard**.
> `Keeguard` = `SecureVault` — they are the **same app**, just old vs. new name.
> The Android package ID (`com.mohdj.securevault`) and internal storage keys (`securevault_*`) intentionally
> retain the old name to avoid breaking existing installs and user data. All user-visible text uses "Keeguard".
> When asked about either name, treat them as identical.


## Deployment Protocol
Every time we update something:
1. **OTA Updates (Web/JS Only)**:
   - If the update only involves web/JS changes and can be delivered Over-The-Air (OTA), deploy it immediately after making changes without needing to ask the user. 
   - *Procedure*: Run `npm run release` (which triggers `node scripts/release-ota.mjs`).

2. **Native APK Updates**:
   - If the update requires changing native Android code (Java/Kotlin/Gradle/AndroidManifest) or Capacitor plugins, push the changes to GitHub.
   - You MUST update the `app_config/latest_version` document in Firestore to set `min_apk_version` to the new version and `apk_download_url` to the GitHub Actions artifact URL (or the repo releases URL) so that the user sees an update screen prompting them to download the new APK.
   - *Procedure*: 
     - Bump version in `package.json` and `android/app/build.gradle`.
     - `git commit` and `git push`.
     - Update Firestore `min_apk_version` and `apk_download_url` to trigger the in-app APK update screen.
