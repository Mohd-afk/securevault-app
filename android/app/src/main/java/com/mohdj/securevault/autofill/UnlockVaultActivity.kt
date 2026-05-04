package com.mohdj.securevault.autofill

// ─── Change Log (v3.2.2) ──────────────────────────────────────────────────────
// RC1: Removed the incorrect AES-GCM decrypt block (lines 97-117 in previous version)
//      that was:
//        (a) Using unwrappedDEK AFTER it was already zeroed with fill(0) at line 61,
//            causing a double-scrub bug where the SecretKey was derived from all zeros.
//        (b) Trying to AES/GCM decrypt a PLAINTEXT password string stored by SQLCipher.
//      The biometric unwrap flow is kept intact: we still decode the biometric cipher
//      and store the DEK in BiometricVaultUnlocker for future autofill-session use.
//      However, item.password is now read directly (plaintext in SQLCipher DB).
// ─────────────────────────────────────────────────────────────────────────────

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.service.autofill.Dataset
import android.service.autofill.FillResponse
import android.util.Log
import android.view.autofill.AutofillId
import android.view.autofill.AutofillManager
import android.view.autofill.AutofillValue
import android.widget.RemoteViews
import android.widget.Toast
import androidx.annotation.RequiresApi
import androidx.fragment.app.FragmentActivity
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import com.mohdj.securevault.security.BiometricKeyManager
import com.mohdj.securevault.security.BiometricVaultUnlocker
import com.mohdj.securevault.vault.VaultRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

private const val TAG = "UnlockVaultActivity"

class UnlockVaultActivity : FragmentActivity() {

    private var domain: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        domain = intent.getStringExtra("DOMAIN") ?: ""
        Log.i(TAG, "Activity created for domain=$domain")

        // Activity is transparent — immediately show the biometric prompt
        showBiometricPrompt()
    }

    private fun showBiometricPrompt() {
        if (!BiometricKeyManager.isBiometricEnabled(this)) {
            Toast.makeText(
                this,
                "Biometric unlock is not enabled. Open Keeguard to set it up.",
                Toast.LENGTH_LONG
            ).show()
            finishWithCancel()
            return
        }

        val executor = ContextCompat.getMainExecutor(this)
        val biometricPrompt = BiometricPrompt(this, executor,
            object : BiometricPrompt.AuthenticationCallback() {

                @RequiresApi(Build.VERSION_CODES.N)
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    super.onAuthenticationSucceeded(result)

                    val cryptoObject = result.cryptoObject
                    if (cryptoObject?.cipher == null) {
                        Log.e(TAG, "CryptoObject is null on biometric success — cannot unwrap DEK")
                        TelemetryLogger.logEvent(
                            applicationContext,
                            TelemetryLogger.EventType.BIOMETRIC_FAILURE,
                            domain,
                            mapOf("reason" to "crypto_object_null")
                        )
                        finish()
                        return
                    }

                    try {
                        // Unwrap the DEK using the biometric-authenticated cipher.
                        // Purpose: marks vault as "unlocked" in BiometricVaultUnlocker so
                        // subsequent onFillRequests skip the authentication step within the
                        // session timeout window.
                        val unwrappedDEK = BiometricKeyManager.unwrapDEK(
                            applicationContext, cryptoObject.cipher!!
                        )
                        BiometricVaultUnlocker.setUnlockedDek(unwrappedDEK)
                        // Scrub local copy — DEK is now owned by BiometricVaultUnlocker
                        unwrappedDEK.fill(0)

                        Log.i(TAG, "Vault session unlocked via biometric for domain=$domain")
                        TelemetryLogger.logEvent(
                            applicationContext,
                            TelemetryLogger.EventType.BIOMETRIC_SUCCESS,
                            domain
                        )

                        // Build the fill response in the background
                        CoroutineScope(Dispatchers.IO).launch {
                            try {
                                buildAndReturnFillResponse()
                            } catch (e: Exception) {
                                Log.e(TAG, "Error building fill response after unlock", e)
                                runOnUiThread { finish() }
                            }
                        }

                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to unwrap DEK from biometric cipher", e)
                        TelemetryLogger.logEvent(
                            applicationContext,
                            TelemetryLogger.EventType.BIOMETRIC_FAILURE,
                            domain,
                            mapOf("reason" to "unwrap_failed", "message" to (e.message?.take(80) ?: "unknown"))
                        )
                        finish()
                    }
                }

                override fun onAuthenticationError(
                    errorCode: Int, errString: CharSequence
                ) {
                    super.onAuthenticationError(errorCode, errString)
                    Log.e(TAG, "Biometric error code=$errorCode")
                    TelemetryLogger.logEvent(
                        applicationContext,
                        TelemetryLogger.EventType.BIOMETRIC_FAILURE,
                        domain,
                        mapOf("error_code" to errorCode, "error_string" to errString.toString())
                    )
                    finish()
                }

                override fun onAuthenticationFailed() {
                    super.onAuthenticationFailed()
                    // Attempt mismatch — the prompt stays visible; do NOT finish yet.
                    Log.w(TAG, "Biometric attempt failed (mismatch), prompt still active")
                }
            }
        )

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Unlock Keeguard")
            .setSubtitle("Autofill requires authentication")
            .setAllowedAuthenticators(androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .setNegativeButtonText("Cancel")
            .build()

        try {
            if (Build.VERSION_CODES.N <= Build.VERSION.SDK_INT) {
                val cipher = BiometricKeyManager.getDecryptionCipher(this)
                biometricPrompt.authenticate(promptInfo, BiometricPrompt.CryptoObject(cipher))
            } else {
                Toast.makeText(
                    this, "Android 7.0+ is required for vault security", Toast.LENGTH_SHORT
                ).show()
                finishWithCancel()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize biometric cipher — key may have been invalidated", e)
            // This happens when the user adds/removes fingerprints after enabling biometric unlock
            Toast.makeText(
                this,
                "Re-enable biometric unlock in Keeguard (fingerprints changed)",
                Toast.LENGTH_LONG
            ).show()
            finishWithCancel()
        }
    }

    /**
     * Queries the native SQLCipher vault for credentials matching [domain] and
     * builds an AutofillManager fill response to return to the requesting app.
     *
     * RC1: item.password contains the PLAINTEXT credential stored in the SQLCipher-
     * protected DB. No additional AES decryption is performed here — that was removed
     * because it applied the wrong key (biometric DEK) to plaintext data, causing
     * every fill attempt to silently fail with an empty password.
     */
    private suspend fun buildAndReturnFillResponse() {
        val repository = VaultRepository(applicationContext)
        val matches = repository.findByDomain(domain)

        if (matches.isEmpty()) {
            Log.w(TAG, "No matches found for domain=$domain after unlock")
            runOnUiThread {
                Toast.makeText(this@UnlockVaultActivity, "No saved passwords found for $domain", Toast.LENGTH_SHORT).show()
                setResult(Activity.RESULT_CANCELED)
                finish()
            }
            return
        }

        val uIds = intent.getParcelableArrayListExtra<AutofillId>("USERNAME_IDS")
        val pIds = intent.getParcelableArrayListExtra<AutofillId>("PASSWORD_IDS")

        if (uIds == null && pIds == null) {
            Log.e(TAG, "AutofillIds are missing from intent!")
            runOnUiThread {
                Toast.makeText(this@UnlockVaultActivity, "Autofill error: missing field IDs", Toast.LENGTH_SHORT).show()
                setResult(Activity.RESULT_CANCELED)
                finish()
            }
            return
        }

        val responseBuilder = FillResponse.Builder()
        var datasetCount = 0

        for (item in matches.sortedByDescending { it.updatedAt }) {
            val datasetBuilder = Dataset.Builder()
            val presentation = RemoteViews(packageName, android.R.layout.simple_list_item_1)
            presentation.setTextViewText(
                android.R.id.text1,
                item.username.ifEmpty { item.title }.ifEmpty { "Keeguard" }
            )

            var datasetUsable = false

            // Fill username fields
            if (uIds != null) {
                for (id in uIds) {
                    datasetBuilder.setValue(id, AutofillValue.forText(item.username), presentation)
                    datasetUsable = true
                }
            }

            // RC1 FIX: item.password is the PLAINTEXT password stored in the SQLCipher DB.
            // The previous version incorrectly attempted AES/GCM decrypt using the biometric
            // DEK (a different key), which always threw an exception and silently fell through
            // to an empty fill. That decrypt block does not exist in this version.
            val passwordToFill = item.password
            if (passwordToFill.isNotEmpty() && pIds != null) {
                for (id in pIds) {
                    datasetBuilder.setValue(id, AutofillValue.forText(passwordToFill), presentation)
                    datasetUsable = true
                }
            } else if (passwordToFill.isEmpty()) {
                Log.w(TAG, "Empty password for itemId=${item.id} after unlock " +
                        "— user should re-sync (open Keeguard while vault is unlocked)")
            }

            if (datasetUsable) {
                responseBuilder.addDataset(datasetBuilder.build())
                datasetCount++
            }
        }

        if (datasetCount == 0) {
            Log.w(TAG, "No usable datasets could be built for domain=$domain")
            runOnUiThread {
                Toast.makeText(this@UnlockVaultActivity, "No usable fields found for $domain", Toast.LENGTH_SHORT).show()
                setResult(Activity.RESULT_CANCELED)
                finish()
            }
            return
        }

        val resultIntent = Intent().apply {
            putExtra(AutofillManager.EXTRA_AUTHENTICATION_RESULT, responseBuilder.build())
        }

        Log.i(TAG, "Returning fill response to autofill framework: " +
                "domain=$domain datasetCount=$datasetCount")

        runOnUiThread {
            Toast.makeText(this@UnlockVaultActivity, "Unlocked! Tap field again if needed.", Toast.LENGTH_SHORT).show()
            setResult(Activity.RESULT_OK, resultIntent)
            finish()
        }
    }

    private fun finishWithCancel() {
        setResult(RESULT_CANCELED)
        finish()
    }
}
