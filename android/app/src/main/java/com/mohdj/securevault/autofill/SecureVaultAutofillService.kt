package com.mohdj.securevault.autofill

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
import android.service.autofill.SaveInfo
import android.util.Log
import android.view.autofill.AutofillValue
import android.widget.RemoteViews
import com.mohdj.securevault.R
import com.mohdj.securevault.vault.VaultRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import android.app.PendingIntent
import com.mohdj.securevault.security.BiometricVaultUnlocker
import android.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import java.security.Key

class SecureVaultAutofillService : AutofillService() {

    private val autofillHelper = AutofillHelper()
    private lateinit var domainMatcher: DomainMatcher
    private lateinit var vaultRepository: VaultRepository

    override fun onCreate() {
        super.onCreate()
        domainMatcher = DomainMatcher(applicationContext)
        vaultRepository = VaultRepository(applicationContext)
        Log.i("SecureVaultAutofill", "Service Created")
    }

    override fun onFillRequest(
        request: FillRequest,
        cancellationSignal: CancellationSignal,
        callback: FillCallback
    ) {
        val context: FillContext = request.fillContexts.lastOrNull() ?: return
        val structure: AssistStructure = context.structure
        
        // 1. Parse the view hierarchy to find username/password fields
        val parsed = autofillHelper.parseStructure(structure)
        
        val hasUsername = parsed.usernameNodes.isNotEmpty()
        val hasPassword = parsed.passwordNodes.isNotEmpty()

        if (!hasUsername && !hasPassword) {
             Log.d("SecureVaultAutofill", "No relevant fields found for autofill")
             callback.onSuccess(null)
             return
        }

        // 2. Identify the domain or package
        val packageName = structure.activityComponent?.packageName ?: ""
        
        // Strict WebView fallback (Fix D): Don't guess the domain from package randomly
        var mappedDomain: String? = null
        if (packageName.isNotEmpty()) {
            mappedDomain = domainMatcher.normalize(packageName)
        }
        val rawDomain = parsed.webDomain ?: mappedDomain
        
        if (rawDomain == null) {
            Log.e("SecureVaultAutofill", "Cannot resolve domain safely for package: \$packageName. Aborting autofill.")
            callback.onSuccess(null)
            return
        }
        
        val normalizedDomain = domainMatcher.normalize(rawDomain) ?: rawDomain
        
        Log.i("SecureVaultAutofill", "Fill Request for: \$rawDomain -> \$normalizedDomain (\${packageName})")
        
        // --- MULTI-STEP LOGIN CACHE LOGIC (Fix A) ---
        var cachedUsername: String? = null
        
        if (hasUsername && !hasPassword) {
            // It's a username-only page (Step 1). Cache it temporarily.
            // We just grab the first node's text if it has any, but usually we just want to know
            // we *were* on a username page for this domain. We'll cache a placeholder if empty to represent intent.
            val usernameStr = parsed.usernameNodes.first().text?.toString() ?: ""
            LoginSessionCache.put(normalizedDomain, packageName, usernameStr)
        } else if (hasPassword && !hasUsername) {
            // It's a password-only page (Step 2). Check the cache.
            cachedUsername = LoginSessionCache.get(normalizedDomain, packageName)
            
            // SECURITY CHECK: If password-only and no cached username context, abort.
            // This prevents malicious apps from just throwing up a password field to trick the manager.
            if (cachedUsername == null) {
                Log.w("SecureVaultAutofill", "SECURITY: Password-only form detected without prior username context. Aborting fill to prevent phishing.")
                TelemetryLogger.logEvent(applicationContext, TelemetryLogger.EventType.FILL_FAILURE, normalizedDomain, mapOf("reason" to "naked_password_form"))
                callback.onSuccess(null)
                return
            } else {
                Log.i("SecureVaultAutofill", "Restored username context from cache for multi-step login")
            }
        }

        // 3. Check Blocklist
        val prefs = applicationContext.getSharedPreferences("SecureVaultSettings", Context.MODE_PRIVATE)
        val blocklist = prefs.getStringSet("autofillBlocklist", emptySet()) ?: emptySet()
        if (blocklist.contains(normalizedDomain)) {
            Log.i("SecureVaultAutofill", "Domain \$normalizedDomain is blocked by user. Aborting autofill.")
            TelemetryLogger.logEvent(applicationContext, TelemetryLogger.EventType.FILL_FAILURE, normalizedDomain, mapOf("reason" to "blocked_domain"))
            callback.onSuccess(null)
            return
        }

        // 4. Search Vault and Ensure Unlocked
        CoroutineScope(Dispatchers.IO).launch {
            try {
                // If Vault is locked, return an authentication Dataset
                if (BiometricVaultUnlocker.isLocked()) {
                    Log.i("SecureVaultAutofill", "Vault is locked. Returning Biometric Authentication Dataset.")
                    TelemetryLogger.logEvent(applicationContext, TelemetryLogger.EventType.BIOMETRIC_PROMPT_SHOWN, normalizedDomain)
                    val intent = Intent(this@SecureVaultAutofillService, UnlockVaultActivity::class.java).apply {
                        putExtra("DOMAIN", normalizedDomain)

                        // Pass along the IDs of the fields we want to fill upon success
                        val uIds = parsed.usernameNodes.mapNotNull { it.autofillId }
                        val pIds = parsed.passwordNodes.mapNotNull { it.autofillId }
                        putParcelableArrayListExtra("USERNAME_IDS", ArrayList(uIds))
                        putParcelableArrayListExtra("PASSWORD_IDS", ArrayList(pIds))
                    }

                    val pendingIntent = PendingIntent.getActivity(
                        this@SecureVaultAutofillService,
                        1001,
                        intent,
                        PendingIntent.FLAG_CANCEL_CURRENT or PendingIntent.FLAG_MUTABLE
                    )

                    val presentation = RemoteViews(packageName, android.R.layout.simple_list_item_1)
                    presentation.setTextViewText(android.R.id.text1, "Unlock SecureVault")

                    // Create an Authentication Response
                    val response = FillResponse.Builder()
                        .setAuthentication(
                            parsed.usernameNodes.mapNotNull { it.autofillId }.toTypedArray(),
                            pendingIntent.intentSender,
                            presentation
                        )
                        .build()

                    callback.onSuccess(response)
                    return@launch
                }

                // If Vault is unlocked, fetch and decrypt matches
                val matches = vaultRepository.findByDomain(normalizedDomain)

                // SECURITY: Filter out weak domain matches (confidence < 0.8)
                val trustedMatches = matches.filter { item ->
                    val confidence = domainMatcher.calculateConfidence(rawDomain, item.uris)
                    if (confidence < 0.8) {
                        Log.w("SecureVaultAutofill", "Filtered out match ${item.title} due to low confidence: $confidence")
                    }
                    confidence >= 0.8
                }

                if (trustedMatches.isEmpty()) {
                    Log.i("SecureVaultAutofill", "No matching credentials found for domain: $normalizedDomain")
                    TelemetryLogger.logEvent(applicationContext, TelemetryLogger.EventType.UNMATCHED_DOMAIN, normalizedDomain)

                    // Return empty response with just the SaveInfo so we can still save new credentials!
                    val saveInfo = autofillHelper.getSaveInfo(parsed)
                    val responseBuilder = FillResponse.Builder()
                    if (saveInfo != null) {
                        responseBuilder.setSaveInfo(saveInfo)
                    }
                    callback.onSuccess(responseBuilder.build())
                    return@launch
                }

                val dek = BiometricVaultUnlocker.getUnlockedDek() ?: throw IllegalStateException("Unlocked DEK is null")
                val secretKey: Key = SecretKeySpec(dek, "AES")

                // 5. Build Dataset Response
                val responseBuilder = FillResponse.Builder()

                // Filter matches if we are in a multi-step password page and have a cached username.
                // We only want to suggest the vault item that matches the cached username to avoid confusion.
                val filteredMatches = if (cachedUsername != null && cachedUsername.isNotBlank()) {
                    trustedMatches.filter { it.username.equals(cachedUsername, ignoreCase = true) }.ifEmpty { trustedMatches }
                } else {
                    trustedMatches
                }

                // Sort by Most Recently Used (MRU)
                val sortedMatches = filteredMatches.sortedByDescending { it.updatedAt }

                for (item in sortedMatches) {
                    val datasetBuilder = Dataset.Builder()

                    // Creates a simple dropdown presentation
                    val presentation = RemoteViews(packageName, android.R.layout.simple_list_item_1)
                    presentation.setTextViewText(android.R.id.text1, item.username.ifEmpty { item.title })

                    // Fill Username
                    for (node in parsed.usernameNodes) {
                        datasetBuilder.setValue(
                            node.autofillId!!,
                            AutofillValue.forText(item.username),
                            presentation
                        )
                    }

                    // Fill Password
                    var decryptedPassword = ""
                    try {
                        val parts = item.encryptedPassword.split(":")
                        if (parts.size == 2) {
                            val iv = Base64.decode(parts[0], Base64.DEFAULT)
                            val ciphertext = Base64.decode(parts[1], Base64.DEFAULT)
                            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
                            cipher.init(Cipher.DECRYPT_MODE, secretKey, GCMParameterSpec(128, iv))
                            val plaintextBytes = cipher.doFinal(ciphertext)
                            decryptedPassword = String(plaintextBytes, Charsets.UTF_8)
                        } else {
                           Log.w("SecureVaultAutofill", "Invalid encrypted password format for ${item.id}")
                        }
                    } catch (e: Exception) {
                        Log.e("SecureVaultAutofill", "Failed to decrypt password for ${item.id}", e)
                        TelemetryLogger.logEvent(applicationContext, TelemetryLogger.EventType.FILL_FAILURE, normalizedDomain, mapOf("reason" to "decryption_failed", "itemId" to item.id, "message" to (e.message ?: "unknown")))
                    }

                    if (decryptedPassword.isNotEmpty()) {
                        for (node in parsed.passwordNodes) {
                            // SECURITY CHECK: Ensure it's truly a password field before filling plain text
                            val inputType = node.inputType
                            val isPasswordVariation = (inputType and android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD) != 0 ||
                                                      (inputType and android.text.InputType.TYPE_NUMBER_VARIATION_PASSWORD) != 0 ||
                                                      (inputType and android.text.InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD) != 0
                            
                            val combinedHints = "\${node.hint} \${node.contentDescription} \${node.idEntry}".lowercase()
                            val hintLooksLikePassword = combinedHints.contains("password") || combinedHints.contains("passcode") || combinedHints.contains("pin")
                            
                            if (isPasswordVariation || hintLooksLikePassword) {
                                datasetBuilder.setValue(
                                    node.autofillId!!,
                                    AutofillValue.forText(decryptedPassword),
                                    presentation
                                )
                            } else {
                                Log.w("SecureVaultAutofill", "Skipping fill on suspected non-password field: \$combinedHints")
                            }
                        }
                    }

                    responseBuilder.addDataset(datasetBuilder.build())
                }

                // Set SaveInfo to prompt the user if they submit a new password
                val saveInfo = autofillHelper.getSaveInfo(parsed)
                if (saveInfo != null) {
                    responseBuilder.setSaveInfo(saveInfo)
                }

                // We parsed successfully, added the Dataset
                Log.i("SecureVaultAutofill", "FillResponse built with ${sortedMatches.size} items.")
                TelemetryLogger.logEvent(applicationContext, TelemetryLogger.EventType.FILL_SUCCESS, normalizedDomain, mapOf("matches" to sortedMatches.size))
                callback.onSuccess(responseBuilder.build())

            } catch (e: Exception) {
                Log.e("SecureVaultAutofill", "Error processing fill request", e)
                TelemetryLogger.logEvent(applicationContext, TelemetryLogger.EventType.FILL_FAILURE, normalizedDomain, mapOf("reason" to "exception", "message" to (e.message ?: "unknown")))
                callback.onFailure(e.message)
            }
        }
    }

    override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
        Log.i("SecureVaultAutofill", "Received Save Request")
        val context = request.fillContexts.lastOrNull()

        if (context == null) {
            Log.e("SecureVaultAutofill", "Save request context is null")
            TelemetryLogger.logEvent(applicationContext, TelemetryLogger.EventType.SAVE_FAILURE, null, mapOf("reason" to "context_null"))
            callback.onFailure("Context is null")
            return
        }

        val structure = context.structure
        val parsed = autofillHelper.parseStructure(structure)

        val usernameNode = parsed.usernameNodes.firstOrNull()
        val passwordNode = parsed.passwordNodes.firstOrNull()

        val packageName = structure.activityComponent?.packageName ?: ""
        
        var mappedDomain: String? = null
        if (packageName.isNotEmpty()) {
            mappedDomain = domainMatcher.normalize(packageName)
        }
        val rawDomain = parsed.webDomain ?: mappedDomain
        
        if (rawDomain == null) {
            Log.e("SecureVaultAutofill", "Cannot resolve domain safely on save. Aborting.")
            callback.onFailure("Cannot resolve domain")
            return
        }
        val normalizedDomain = domainMatcher.normalize(rawDomain) ?: rawDomain

        TelemetryLogger.logEvent(applicationContext, TelemetryLogger.EventType.SAVE_REQUEST, normalizedDomain)

        if (passwordNode == null) {
            Log.e("SecureVaultAutofill", "No password field found to save")
            TelemetryLogger.logEvent(applicationContext, TelemetryLogger.EventType.SAVE_FAILURE, normalizedDomain, mapOf("reason" to "no_password_field"))
            callback.onFailure("No password field found to save")
            return
        }

        // Fix A: Check cache for username if it's a password-only save
        var username = usernameNode?.text?.toString() ?: ""
        if (username.isEmpty()) {
            val cachedUsername = LoginSessionCache.get(normalizedDomain, packageName)
            if (!cachedUsername.isNullOrBlank()) {
                username = cachedUsername
                Log.i("SecureVaultAutofill", "Restored username from cache for SaveRequest")
                LoginSessionCache.clear(normalizedDomain, packageName)
            }
        }
        val password = passwordNode.text?.toString() ?: ""

        if (!BiometricVaultUnlocker.isVaultUnlocked()) {
            Log.e("SecureVaultAutofill", "Vault is locked, cannot save")
            TelemetryLogger.logEvent(applicationContext, TelemetryLogger.EventType.SAVE_FAILURE, normalizedDomain, mapOf("reason" to "vault_locked"))
            callback.onFailure("Vault is locked, cannot save")
            return
        }

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val dek = BiometricVaultUnlocker.getUnlockedDek() ?: throw IllegalStateException("Unlocked DEK is null")
                val secretKey: Key = SecretKeySpec(dek, "AES")

                // Encrypt the new password
                val cipher = Cipher.getInstance("AES/GCM/NoPadding")
                cipher.init(Cipher.ENCRYPT_MODE, secretKey)
                val iv = cipher.iv
                val encryptedBytes = cipher.doFinal(password.toByteArray(Charsets.UTF_8))

                val ivB64 = Base64.encodeToString(iv, Base64.NO_WRAP)
                val encB64 = Base64.encodeToString(encryptedBytes, Base64.NO_WRAP)
                val encryptedPasswordString = "$ivB64:$encB64"

                val newItem = com.mohdj.securevault.vault.VaultItemEntity(
                    id = java.util.UUID.randomUUID().toString(),
                    title = normalizedDomain,
                    username = username,
                    encryptedPassword = encryptedPasswordString,
                    uris = normalizedDomain,
                    createdAt = System.currentTimeMillis(),
                    updatedAt = System.currentTimeMillis(),
                    deletedAt = null
                )

                vaultRepository.insertAll(listOf(newItem))
                Log.i("SecureVaultAutofill", "Successfully saved new credential for $normalizedDomain")
                TelemetryLogger.logEvent(applicationContext, TelemetryLogger.EventType.SAVE_SUCCESS, normalizedDomain)
                callback.onSuccess()
            } catch (e: Exception) {
                Log.e("SecureVaultAutofill", "Failed to save credential", e)
                TelemetryLogger.logEvent(applicationContext, TelemetryLogger.EventType.SAVE_FAILURE, normalizedDomain, mapOf("reason" to "exception", "message" to (e.message ?: "unknown")))
                callback.onFailure("Save error: ${e.message}")
            }
        }
    }
}
