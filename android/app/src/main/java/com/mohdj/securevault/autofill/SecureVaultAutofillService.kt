package com.mohdj.securevault.autofill

// ─── Change Log (v3.2.2) ──────────────────────────────────────────────────────
// RC1: Removed incorrect AES-GCM decrypt block that applied BiometricVaultUnlocker DEK
//      to plaintext passwords in the native SQLCipher DB. Passwords are now read and
//      filled directly. The SQLCipher DB (keyed by Android Keystore) is the boundary.
// RC2: Fixed rawDomain hard-abort. Unknown packages no longer collapse to null via PSL
//      normalization. identityType is now explicitly tracked as "web" or "package".
//      Unmapped native apps use their packageName as the lookup key.
// RC3: Relaxed "naked password" session-cache guard for native app contexts (identityType
//      == "package"). The multi-step phishing guard remains for web/browser flows only.
// OBS: Added structured AUTOFILL_* log tags for adb logcat observability.
//      Log prefix: "KeeguardAutofill"
// ─────────────────────────────────────────────────────────────────────────────

import android.app.PendingIntent
import android.app.assist.AssistStructure
import android.content.Context
import android.content.Intent
import android.os.CancellationSignal
import android.service.autofill.AutofillService
import android.service.autofill.Dataset
import android.service.autofill.FillCallback
import android.service.autofill.FillContext
import android.service.autofill.FillRequest
import android.service.autofill.FillResponse
import android.service.autofill.SaveCallback
import android.service.autofill.SaveRequest
import android.util.Log
import android.view.autofill.AutofillValue
import android.widget.RemoteViews
import com.mohdj.securevault.vault.VaultItemEntity
import com.mohdj.securevault.vault.VaultRepository
import com.mohdj.securevault.security.BiometricVaultUnlocker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

private const val TAG = "KeeguardAutofill"

class SecureVaultAutofillService : AutofillService() {

    private val autofillHelper = AutofillHelper()
    private lateinit var domainMatcher: DomainMatcher
    private lateinit var vaultRepository: VaultRepository

    override fun onCreate() {
        super.onCreate()
        domainMatcher = DomainMatcher(applicationContext)
        vaultRepository = VaultRepository(applicationContext)
        Log.i(TAG, "Service created")
    }

    override fun onFillRequest(
        request: FillRequest,
        cancellationSignal: CancellationSignal,
        callback: FillCallback
    ) {
        // ── 0. Get the top-level view structure ──────────────────────────────
        val fillContext: FillContext = request.fillContexts.lastOrNull() ?: run {
            Log.e(TAG, "AUTOFILL_SUPPRESSED_REASON=no_fill_context")
            callback.onSuccess(null)
            return
        }

        val structure: AssistStructure = fillContext.structure
        val rawPackageName = structure.activityComponent?.packageName ?: ""
        Log.i(TAG, "AUTOFILL_REQUEST_RECEIVED package=$rawPackageName")

        // ── 1. Parse the view hierarchy ──────────────────────────────────────
        val parsed = autofillHelper.parseStructure(structure)
        val hasUsername = parsed.usernameNodes.isNotEmpty()
        val hasPassword = parsed.passwordNodes.isNotEmpty()

        Log.i(TAG, "AUTOFILL_PARSED_FIELDS usernameCount=${parsed.usernameNodes.size} " +
                "passwordCount=${parsed.passwordNodes.size} webDomain=${parsed.webDomain}")

        if (!hasUsername && !hasPassword) {
            Log.d(TAG, "AUTOFILL_SUPPRESSED_REASON=no_relevant_fields package=$rawPackageName")
            callback.onSuccess(null)
            return
        }

        // ── 2. Resolve identity ──────────────────────────────────────────────
        //
        //   identityType="web"     → request came from a browser/WebView; use webDomain
        //                            as the primary identity and normalize it via PSL.
        //   identityType="package" → request came from a native app; use the Android
        //                            package name as the identity.
        //
        //   IMPORTANT SECURITY NOTE: We do NOT use the item title as an identity key.
        //   Titles are human labels, not cryptographic or verified identity anchors.
        //   Fuzzy title matching would risk filling the wrong credential into the wrong app.
        //
        val webDomain = parsed.webDomain
        val identityType: String
        val rawIdentity: String

        if (!webDomain.isNullOrBlank()) {
            // Browser or WebView context: Android supplies the real domain from the URL bar.
            rawIdentity = webDomain
            identityType = "web"
        } else if (rawPackageName.isNotEmpty()) {
            // Native app context: no webDomain available; package name is the identity.
            rawIdentity = rawPackageName
            identityType = "package"
        } else {
            Log.e(TAG, "AUTOFILL_SUPPRESSED_REASON=no_identity (no webDomain, no packageName)")
            callback.onSuccess(null)
            return
        }

        // Normalize the identity to a canonical lookup key:
        //   - "web": PSL-normalize the domain (e.g. "login.example.com" → "example.com")
        //   - "package": map to known domain (e.g. "com.instagram.android" → "instagram.com")
        //                or fall back to the package name itself (enables matching items saved
        //                by the autofill-save path which stores the package as the URI).
        val normalizedIdentity: String = when (identityType) {
            "web"     -> domainMatcher.normalize(rawIdentity) ?: rawIdentity
            else      -> domainMatcher.getAppMapping(rawPackageName) ?: rawPackageName
        }

        Log.i(TAG, "AUTOFILL_IDENTITY_RESOLVED type=$identityType raw=$rawIdentity " +
                "normalized=$normalizedIdentity package=$rawPackageName")

        // ── 3. Multi-step login guard ────────────────────────────────────────
        //
        //   For WEB contexts only: many login flows are split across two pages
        //   (username page → password page). Track the username seen on step 1
        //   in a short-lived session cache (60 s TTL), so on step 2 (password-only)
        //   we can fill the right credential and avoid phishing risks on naked
        //   password forms.
        //
        //   For NATIVE APP contexts: multi-step web-style forms do not apply.
        //   Native apps frequently show a single password field with no username.
        //   Suppressing autofill here would break virtually all native app logins.
        //
        val isWebContext = (identityType == "web")
        var cachedUsername: String? = null

        if (hasUsername && !hasPassword) {
            // Step 1 of a possible multi-step web flow: store username for later
            if (isWebContext) {
                val usernameText = parsed.usernameNodes.first().text?.toString() ?: ""
                LoginSessionCache.put(normalizedIdentity, rawPackageName, usernameText)
                Log.d(TAG, "LoginSessionCache: stored username context for $normalizedIdentity")
            }
        } else if (hasPassword && !hasUsername) {
            if (isWebContext) {
                // Web context: require prior step-1 username to prevent phishing
                cachedUsername = LoginSessionCache.get(normalizedIdentity, rawPackageName)
                if (cachedUsername == null) {
                    Log.w(TAG, "AUTOFILL_SUPPRESSED_REASON=naked_password_web_no_cache " +
                            "identity=$normalizedIdentity")
                    callback.onSuccess(null)
                    return
                }
                Log.i(TAG, "LoginSessionCache: restored username context for " +
                        "$normalizedIdentity (multi-step web flow)")
            } else {
                // RC3: Native app context — skip the session cache guard entirely.
                Log.i(TAG, "AUTOFILL: password-only native app screen; " +
                        "skipping session cache check (identity=$normalizedIdentity)")
            }
        }

        // ── 4. Check autofill blocklist ──────────────────────────────────────
        val prefs = applicationContext.getSharedPreferences(
            "SecureVaultSettings", Context.MODE_PRIVATE
        )
        val blocklist = prefs.getStringSet("autofillBlocklist", emptySet()) ?: emptySet()
        if (blocklist.contains(normalizedIdentity)) {
            Log.i(TAG, "AUTOFILL_SUPPRESSED_REASON=blocked_domain identity=$normalizedIdentity")
            callback.onSuccess(null)
            return
        }

        // ── 5. Vault lock / unlock dispatch ─────────────────────────────────
        CoroutineScope(Dispatchers.IO).launch {
            try {
                if (!BiometricVaultUnlocker.isVaultUnlocked()) {
                    // Vault is locked: present an authentication intent.
                    // This is the explicit, non-silent path — the user will be prompted.
                    Log.i(TAG, "AUTOFILL_VAULT_LOCKED: returning authentication intent " +
                            "identity=$normalizedIdentity")

                    val unlockIntent = Intent(
                        this@SecureVaultAutofillService,
                        UnlockVaultActivity::class.java
                    ).apply {
                        putExtra("DOMAIN", normalizedIdentity)
                        putExtra("IDENTITY_TYPE", identityType)
                        val uIds = parsed.usernameNodes.mapNotNull { it.autofillId }
                        val pIds = parsed.passwordNodes.mapNotNull { it.autofillId }
                        putParcelableArrayListExtra("USERNAME_IDS", ArrayList(uIds))
                        putParcelableArrayListExtra("PASSWORD_IDS",  ArrayList(pIds))
                    }

                    val pendingIntent = PendingIntent.getActivity(
                        this@SecureVaultAutofillService,
                        normalizedIdentity.hashCode(),
                        unlockIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                    )

                    val presentation = RemoteViews(
                        packageName, android.R.layout.simple_list_item_1
                    )
                    presentation.setTextViewText(
                        android.R.id.text1, "\uD83D\uDD10 Unlock Keeguard"
                    )

                    val autofillIds = (
                        parsed.usernameNodes.mapNotNull { it.autofillId } +
                        parsed.passwordNodes.mapNotNull { it.autofillId }
                    ).toTypedArray()

                    val response = FillResponse.Builder()
                        .setAuthentication(autofillIds, pendingIntent.intentSender, presentation)
                        .build()

                    callback.onSuccess(response)
                    return@launch
                }

                // ── 6. Vault unlocked: find matching credentials ─────────────
                val matches: List<VaultItemEntity> = vaultRepository.findByDomain(normalizedIdentity)
                Log.i(TAG, "AUTOFILL_MATCH_COUNT identity=$normalizedIdentity count=${matches.size}")

                // Security: For web contexts, filter out low-confidence domain matches.
                // For package contexts, trust any match — the package name is an exact identity.
                val trustedMatches: List<VaultItemEntity> = if (isWebContext) {
                    matches.filter { item ->
                        val confidence = domainMatcher.calculateConfidence(rawIdentity, item.uris)
                        if (confidence < 0.8) {
                            Log.w(TAG, "AUTOFILL_SUPPRESSED_REASON=low_confidence_match " +
                                    "itemId=${item.id} confidence=$confidence " +
                                    "identity=$normalizedIdentity")
                        }
                        confidence >= 0.8
                    }
                } else {
                    matches // Package identity match — exact; no confidence filtering needed
                }

                if (trustedMatches.isEmpty()) {
                    Log.i(TAG, "AUTOFILL_SUPPRESSED_REASON=no_matching_credentials " +
                            "identity=$normalizedIdentity type=$identityType")
                    val saveInfo = autofillHelper.getSaveInfo(parsed)
                    val responseBuilder = FillResponse.Builder()
                    if (saveInfo != null) responseBuilder.setSaveInfo(saveInfo)
                    callback.onSuccess(responseBuilder.build())
                    return@launch
                }

                // ── 7. Build the fill response ───────────────────────────────
                // Narrow by the cached username in web multi-step flows
                val filteredMatches: List<VaultItemEntity> = if (!cachedUsername.isNullOrBlank()) {
                    trustedMatches
                        .filter { it.username.equals(cachedUsername, ignoreCase = true) }
                        .ifEmpty { trustedMatches }
                } else {
                    trustedMatches
                }
                val sortedMatches = filteredMatches.sortedByDescending { it.updatedAt }

                val responseBuilder = FillResponse.Builder()
                var datasetCount = 0

                for (item in sortedMatches) {
                    val datasetBuilder = Dataset.Builder()
                    val presentation = RemoteViews(
                        packageName, android.R.layout.simple_list_item_1
                    )
                    presentation.setTextViewText(
                        android.R.id.text1,
                        item.username.ifEmpty { item.title }.ifEmpty { "Keeguard" }
                    )

                    var datasetUsable = false

                    // Fill username fields
                    for (node in parsed.usernameNodes) {
                        node.autofillId?.let { id ->
                            datasetBuilder.setValue(
                                id, AutofillValue.forText(item.username), presentation
                            )
                            datasetUsable = true
                        }
                    }

                    // ── RC1 FIX: item.password is PLAINTEXT stored in the SQLCipher DB ───
                    //
                    // The native DB password field holds plaintext received from the JS vault
                    // at sync time (when the JS vault is already decrypted in memory).
                    // The SQLCipher database file is the encryption boundary.
                    //
                    // REMOVED: Previous code incorrectly attempted AES-GCM decryption of
                    // this plaintext value using BiometricVaultUnlocker.getUnlockedDek(),
                    // which is an entirely different key. This always threw an exception
                    // which was silently caught, resulting in decryptedPassword="" and
                    // zero fills. That dead code path is not present in this version.
                    // ────────────────────────────────────────────────────────────────────
                    val passwordToFill = item.password
                    if (passwordToFill.isNotEmpty()) {
                        for (node in parsed.passwordNodes) {
                            node.autofillId?.let { id ->
                                datasetBuilder.setValue(
                                    id, AutofillValue.forText(passwordToFill), presentation
                                )
                                datasetUsable = true
                            }
                        }
                    } else {
                        // Password field is empty in the native DB — this means the item was
                        // synced before this fix (when the JS encrypted string was stored).
                        // The user should unlock and re-lock the vault app to trigger a fresh
                        // sync. We log this as a warning but do NOT throw.
                        Log.w(TAG, "AUTOFILL: empty password for itemId=${item.id} " +
                                "— user should re-sync vault (open Keeguard while unlocked)")
                    }

                    if (datasetUsable) {
                        responseBuilder.addDataset(datasetBuilder.build())
                        datasetCount++
                    }
                }

                val saveInfo = autofillHelper.getSaveInfo(parsed)
                if (saveInfo != null) responseBuilder.setSaveInfo(saveInfo)

                Log.i(TAG, "AUTOFILL_FILL_RESPONSE_SENT identity=$normalizedIdentity " +
                        "datasetCount=$datasetCount")
                callback.onSuccess(responseBuilder.build())

            } catch (e: Exception) {
                // Explicit, non-silent failure. We log a reason code but never log secrets.
                Log.e(TAG, "AUTOFILL_SUPPRESSED_REASON=exception " +
                        "message=${e.message?.take(120)}", e)
                callback.onFailure("autofill_exception")
            }
        }
    }

    override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
        Log.i(TAG, "AUTOFILL_SAVE_REQUEST_RECEIVED")

        val fillContext = request.fillContexts.lastOrNull()
        if (fillContext == null) {
            Log.e(TAG, "AUTOFILL_SAVE: context is null")
            callback.onFailure("save_no_context")
            return
        }

        val structure = fillContext.structure
        val parsed = autofillHelper.parseStructure(structure)
        val rawPackageName = structure.activityComponent?.packageName ?: ""

        // Resolve save identity (same logic as fill request)
        val webDomain = parsed.webDomain
        val identityType: String
        val rawIdentity: String
        if (!webDomain.isNullOrBlank()) {
            rawIdentity = webDomain
            identityType = "web"
        } else if (rawPackageName.isNotEmpty()) {
            rawIdentity = rawPackageName
            identityType = "package"
        } else {
            Log.e(TAG, "AUTOFILL_SAVE: cannot resolve identity — no webDomain or package")
            callback.onFailure("save_no_identity")
            return
        }

        val normalizedIdentity = when (identityType) {
            "web" -> domainMatcher.normalize(rawIdentity) ?: rawIdentity
            else  -> domainMatcher.getAppMapping(rawPackageName) ?: rawPackageName
        }

        Log.i(TAG, "AUTOFILL_SAVE: identity=$normalizedIdentity type=$identityType")

        val usernameNode = parsed.usernameNodes.firstOrNull()
        val passwordNode  = parsed.passwordNodes.firstOrNull()

        if (passwordNode == null) {
            Log.w(TAG, "AUTOFILL_SAVE: no password field — cannot save")
            callback.onFailure("save_no_password_field")
            return
        }

        var username = usernameNode?.text?.toString() ?: ""
        if (username.isEmpty()) {
            val cached = LoginSessionCache.get(normalizedIdentity, rawPackageName)
            if (!cached.isNullOrBlank()) {
                username = cached
                LoginSessionCache.clear(normalizedIdentity, rawPackageName)
                Log.d(TAG, "AUTOFILL_SAVE: restored username from session cache")
            }
        }

        val plaintextPassword = passwordNode.text?.toString() ?: ""

        if (!BiometricVaultUnlocker.isVaultUnlocked()) {
            // Require recent user authentication before allowing a save.
            // This prevents rogue autofill saves when the session has timed out.
            Log.w(TAG, "AUTOFILL_SAVE: vault locked — refusing save for identity=$normalizedIdentity")
            callback.onFailure("save_vault_locked")
            return
        }

        CoroutineScope(Dispatchers.IO).launch {
            try {
                // RC1: Store plaintext password in SQLCipher-protected DB.
                // This matches the JS→native sync path. See VaultItemEntity security docs.
                val newItem = VaultItemEntity(
                    id        = java.util.UUID.randomUUID().toString(),
                    title     = normalizedIdentity,
                    username  = username,
                    password  = plaintextPassword,
                    uris      = normalizedIdentity,
                    type      = if (identityType == "web") "Website" else "App",
                    createdAt = System.currentTimeMillis(),
                    updatedAt = System.currentTimeMillis(),
                    deletedAt = null
                )
                vaultRepository.insert(newItem)
                Log.i(TAG, "AUTOFILL_SAVE_SUCCESS identity=$normalizedIdentity")
                callback.onSuccess()
            } catch (e: Exception) {
                Log.e(TAG, "AUTOFILL_SAVE: exception message=${e.message?.take(120)}", e)
                callback.onFailure("save_exception")
            }
        }
    }
}
