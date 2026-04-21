# Restore Google OAuth Login

The Google OAuth login functionality was intentionally removed in commit `59f94d5b` (during the OTA testing phase) because the standard Firebase Web SDK `signInWithPopup` method is blocked by Android WebViews (which Capacitor relies on). Because of the critical priority of the "Fix Biometric Unlock Flow" task in our previous session, the reversion of Google Auth was postponed.

To restore Google OAuth, we cannot simply revert to the old Web SDK method if the app needs to function correctly on a physical Android device. Instead, we must implement a Capacitor-native Google Auth integration.

## Proposed Options

Please review the following options for restoring Google Auth and let me know how you would like to proceed:

### Option 1: Native Capacitor Firebase Auth (Recommended)
This is the robust solution for production Capacitor apps.
- **Approach:** Install `@capacitor-firebase/authentication` or `@codetrix-studio/capacitor-google-auth`.
- **Pros:** Native Google Sign-In prompt, flawless integration with Android, no WebView pop-up blocks.
- **Cons:** Requires configuring OAuth Client IDs in Google Cloud Console / Firebase for the Android app (SHA-1 fingerprint required), and updating the native Android project files (`strings.xml`, `capacitor.config.ts`).

### Option 2: Pure Revert (Web Only)
- **Approach:** Re-add the removed code from `old_auth.ts` and `old_AuthScreen.tsx` which uses `signInWithPopup`.
- **Pros:** Fast to implement, works perfectly on the desktop browser.
- **Cons:** **Will fail on the compiled Android APK** because Android WebViews explicitly block Google OAuth web flows for security reasons.

## User Review Required
> [!IMPORTANT]  
> Which option would you prefer?
> If you choose **Option 1**, do you already have a Web Client ID and Android Client ID configured in Firebase/Google Cloud Console for this app, or will we need to set that up?

## Next Steps upon Approval
Depending on your choice, I will execute the required steps to restore the UI elements and rebuild the authentication flow in `src/app/auth.ts` and `src/app/components/AuthScreen.tsx`.
