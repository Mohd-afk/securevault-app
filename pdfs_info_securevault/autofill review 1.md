# Autofill Setup Implementation Plan

The goal is to implement a "Complete Autofill Setup" for the SecureVault web app and mobile APK. Because SecureVault is a Password Manager, this feature could mean two distinct things. We need to clarify whether we are building an **Autofill Provider** (SecureVault filling passwords into *other* apps/sites) or an **Autofill Consumer** (SecureVault forms being easily filled by *other* password managers). 

## User Review Required

> [!IMPORTANT]
> **Clarification Needed:** Please review the two paths below and let me know which one you intend (or if you want both). 
> 
> **Path A: Autofill Provider (Password Manager Feature)**
> You want SecureVault to popup and offer to fill passwords when a user opens *other* apps (like Twitter, banking apps) or websites.
> 
> **Path B: Autofill Consumer (Form Convenience)**
> You want SecureVault's own login and registration forms to correctly support autofill from the OS/Browser's built-in password manager.

## Proposed Changes

### Path A: SecureVault as an Autofill Provider

If we proceed with Path A, the implementation must be platform-specific because standard web apps cannot inherently autofill other sites or native OS apps due to sandboxing.

#### Mobile App (APK via Capacitor)
Capacitor apps are primarily web views. To make the Android OS recognize SecureVault as an Autofill Service, we *must* write native Kotlin/Java code to interface with Android's `AutofillService` API.
*   #### [NEW] `android/app/src/main/java/com/yourpackage/AutofillServiceImpl.kt`
    A background service that receives `onFillRequest` from the Android OS.
*   #### [MODIFY] [android/app/src/main/AndroidManifest.xml](file:///d:/PYTHON/Password%20Manager/android/app/src/main/AndroidManifest.xml)
    Register the service with `BIND_AUTOFILL_SERVICE` permission and link to `autofill_service_config.xml`.
*   #### [NEW] Capacitor Native Bridge
    A mechanism (or secondary Activity) that allows the native Autofill Service to securely retrieve decrypted vault items from the main web app's datastore or memory, potentially asking the user for their Master Password/biometrics before filling.

#### Web App
To autofill passwords across different websites on a desktop browser, we need a Browser Extension.
*   #### [NEW] `extension/` directory
    Create a Manifest V3 Extension build target in Vite that contains background scripts and content scripts to detect login forms and offer SecureVault passwords.

---

### Path B: SecureVault as an Autofill Consumer

If you just want users to be able to use their *existing* OS password manager, we only need to update our front-end forms.

#### Web & Mobile Web View
*   #### [MODIFY] `src/app/auth/...` (Login/Signup/Reset forms)
    Add standard HTML `autocomplete` attributes everywhere:
    - `<input type="email" autocomplete="username" />`
    - `<input type="password" autocomplete="current-password" />` (Login)
    - `<input type="password" autocomplete="new-password" />` (Signup / Reset)

## Verification Plan

### Manual Verification (Path A - Provider)
1.  **Mobile:** Build the APK, install on an Android device. Go to Settings -> Passwords & accounts -> Autofill service and select SecureVault. Open a third-party app (e.g., Netflix) and ensure SecureVault prompts to fill the password.
2.  **Web:** Load the unpacked extension in Chrome. Navigate to `example.com/login` and verify the SecureVault icon appears in the input fields.

### Manual Verification (Path B - Consumer)
1.  Open the web app or APK.
2.  Tap on the "Email" or "Password" field on the Login screen.
3.  Verify that the device's native keyboard (or browser dropdown) suggests saved credentials automatically.
