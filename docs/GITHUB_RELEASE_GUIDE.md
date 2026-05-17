# SecureVault — GitHub Release & APK Distribution Guide

> **Last Updated:** 2026-04-01  
> **Maintainer:** Mohd-afk  

This document defines the two-track update strategy for SecureVault. Read the decision guide first, then follow the appropriate workflow.

---

## Update Decision Guide

```
Code change needed?
       │
       ├── JS / UI / logic only (inside dist/)
       │         └── OTA update via Capgo
       │               └── npm run release → delivered silently ✅
       │
       └── Capacitor plugin / Kotlin / native Android change
                 └── Build new APK
                       └── Push GitHub Release (e.g. v2, v3)
                             └── App shows in-app banner:
                                 "App Update Required"
                                       └── User taps → GitHub releases page
                                             └── User downloads + installs APK
```

### When to use OTA (Capgo)
| Use OTA when you are changing... | Examples |
|---|---|
| UI components or screens | New button, redesigned header |
| TypeScript / React logic | Auth flow fix, store method change |
| New routes or screens | Adding a new settings page |
| Firebase queries or rules | Firestore filter changes |
| CSS / styling | Colors, layout, animations |
| Any file inside `src/` | All JS-compiled code |

### When to build a new APK
| Use APK release when you are changing... | Examples |
|---|---|
| Installing a new Capacitor plugin | `npm install @capacitor/camera` |
| Kotlin / Java native files | `android/app/src/main/java/...` |
| `capacitor.config.ts` plugin config | Adding plugin options |
| Android permissions | `AndroidManifest.xml` changes |
| `build.gradle` dependencies | Adding a native library |
| `google-services.json` | Firebase Android reconfiguration |
| Capacitor / Android SDK version upgrades | Major version bumps |

---

## Workflow 1 — OTA Update (JS/UI changes only)

```bash
# 1. Make your JS/React/TypeScript changes in src/

# 2. Release OTA
npm run release
# This runs: vite build → zip dist/ → upload to Firebase Hosting → update Firestore
```

**Users get the update silently on next app open. No action required from users.**

---

## Workflow 2 — New APK Release (native changes)

Follow this checklist exactly. Do NOT skip steps.

### Step 1 — Make your native changes
Edit your Capacitor plugins, Kotlin files, Gradle configs, or `android/` as required.

### Step 2 — Build the web assets
```bash
npm run build
```

### Step 3 — Sync native project
```bash
npx cap sync android
```

### Step 4 — Build the APK
```bash
cd android
./gradlew assembleDebug       # For testing
# OR
./gradlew assembleRelease     # For production
```

APK output: `android/app/build/outputs/apk/debug/app-debug.apk`

### Step 5 — Publish GitHub Release
1. Go to [github.com/Mohd-afk/securevault-app/releases](https://github.com/Mohd-afk/securevault-app/releases)
2. Click **"Draft a new release"**
3. Create a new tag: `v<N>` — use a simple incrementing integer (v2, v3, v4...)
4. Set title: `SecureVault v<N> — <brief description>`
5. Attach the APK file (`app-debug.apk` or `app-release.apk`)
6. Write release notes describing what native changes were made
7. Click **"Publish release"**

### Step 6 — Update Firestore
Open Firebase Console → Firestore → `app_config/latest_version` document.

Update these fields:
```
min_apk_version:  <N>   (same integer as your release tag, e.g. 2)
apk_download_url: "https://github.com/Mohd-afk/securevault-app/releases/latest"
```

**Users will see the "App Update Required" banner on next app open.** They tap "Download Update" → your GitHub release page → download + install the new APK.

---

## APK Version Numbering

| Release | Tag | `versionCode` in build.gradle | `min_apk_version` in Firestore | Notes |
|---|---|---|---|---|
| First release | v1 | 1 | 1 | Initial APK |
| Google Sign-In (native) | v2 | 2 | 2 | Added `@capacitor-firebase/authentication` |
| v3 and beyond | v3 | 3 | 3 | Future native changes |

> **Critical Rule:** `versionCode` in `build.gradle`, the GitHub tag integer, and `min_apk_version` in Firestore **must always be the same integer**. This is how the app knows the installed APK meets the minimum requirement.
>
> **Before every APK release:** bump `versionCode` and `versionName` in `android/app/build.gradle` first, THEN build, THEN set `min_apk_version` to match.

---

## Testing the Banner

To verify the banner appears correctly:

1. In Firebase Console, set `min_apk_version` to `999`
2. Open the app → banner should appear immediately after boot
3. Tap "Download Update" → should open GitHub in browser
4. Set `min_apk_version` back to `1` → restart app → banner gone

---

## Environment Variables

OTA bundles include the web code. Native APK includes the compiled Android binary.

| Variable | Source | Delivered via |
|---|---|---|
| Firebase SDK config | `.env` → baked into `dist/` | OTA or APK |
| `google-services.json` | Android build | APK only |
| Native plugin code | `android/` folder | APK only |
| Capacitor plugin config | `capacitor.config.ts` | APK only |

---

## Quick Reference

```
OTA version:    Firestore → app_config/latest_version → version   (e.g. "2.0.4")
APK version:    Firestore → app_config/latest_version → min_apk_version  (e.g. 2)
APK URL:        Firestore → app_config/latest_version → apk_download_url
```
