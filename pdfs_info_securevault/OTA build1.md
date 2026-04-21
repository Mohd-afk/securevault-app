# Android Build Fix — Walkthrough

## Problem
The Android APK build was failing with multiple cascading errors. Each fix revealed the next underlying issue.

## Root Causes & Fixes (8 issues across 6 files)

### 1. Gradle Config Issues

| # | File | Issue | Fix |
|---|------|-------|-----|
| 1 | [build.gradle](file:///d:/PYTHON/Password%20Manager/android/build.gradle) | `de.nickyg.argon2:argon2-android:1.0.0` doesn't exist in Maven | **Removed** — web uses `hash-wasm`, native dep was dead |
| 2 | [gradle.properties](file:///d:/PYTHON/Password%20Manager/android/gradle.properties) | `excludeLibraryComponentsFromConstraints` warning spam | Added property + suppression flag |
| 3 | [build.gradle](file:///d:/PYTHON/Password%20Manager/android/build.gradle) | JVM target mismatch (Java 21 vs Kotlin 17) | Aligned both to **Java 21** |
| 4 | [build.gradle](file:///d:/PYTHON/Password%20Manager/android/build.gradle) | Room 2.6.1 kapt incompatible with Kotlin 2.2 metadata | Upgraded Room to **2.8.4** |

### 2. Kotlin Source Code Bugs

| # | File | Issue | Fix |
|---|------|-------|-----|
| 5 | [UnlockVaultActivity.kt](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/autofill/UnlockVaultActivity.kt) | Missing imports ([Log](file:///d:/PYTHON/Password%20Manager/src/app/utils/logger.ts#39-45), [Activity](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/autofill/UnlockVaultActivity.kt#17-117), `AutofillId`) + undefined `domain` | Added imports + class-level `domain` property from intent |
| 6 | [SecureVaultAutofillService.kt](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/autofill/SecureVaultAutofillService.kt) | `isLocked()` doesn't exist, missing `type` param, wrong method name | `!isVaultUnlocked()`, added `type = "Website"`, [insert()](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/vault/VaultRepository.kt#21-24) |
| 7 | [BiometricBridgePlugin.kt](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/bridge/BiometricBridgePlugin.kt) | `call.getInt()` returns `Int?` but `Int` expected | Added `?: 5` fallback |
| 8 | [AutofillHelper.kt](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/autofill/AutofillHelper.kt) | `val webDomain` reassigned | Changed to `var` |

## Result
✅ **BUILD SUCCESSFUL** — Debug APK at:
```
android\app\build\outputs\apk\debug\app-debug.apk (21.8 MB)
```

## Next Steps
1. Install APK on device/emulator: `adb install app-debug.apk`
2. Test OTA update flow (silent + critical)
3. Test rollback mechanism
