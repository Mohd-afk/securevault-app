package com.mohdj.securevault.autofill

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.widget.Toast
import androidx.annotation.RequiresApi
import androidx.appcompat.app.AppCompatActivity
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import com.mohdj.securevault.security.BiometricKeyManager
import com.mohdj.securevault.security.BiometricVaultUnlocker

class UnlockVaultActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Activity is transparent, just immediately show prompt
        showBiometricPrompt()
    }

    private fun showBiometricPrompt() {
        if (!BiometricKeyManager.isBiometricEnabled(this)) {
            Toast.makeText(this, "Biometric unlock is not enabled in SecureVault settings. Open app to setup.", Toast.LENGTH_LONG).show()
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
                    if (cryptoObject?.cipher != null) {
                        try {
                            val unwrappedDEK = BiometricKeyManager.unwrapDEK(applicationContext, cryptoObject.cipher!!)
                            BiometricVaultUnlocker.setUnlockedDek(unwrappedDEK)
                            unwrappedDEK.fill(0) // scrub local copy

                            Log.i("UnlockVaultActivity", "Vault successfully unlocked via Biometric!")
                            TelemetryLogger.logEvent(applicationContext, TelemetryLogger.EventType.BIOMETRIC_SUCCESS, domain)
                            
                            // Return success to the AutofillService
                            val intent = Intent().apply {
                                putExtra("SUCCESS", true)
                                putExtra("DOMAIN", domain)
                                val uIds = intent.getParcelableArrayListExtra<AutofillId>("USERNAME_IDS")
                                val pIds = intent.getParcelableArrayListExtra<AutofillId>("PASSWORD_IDS")
                                if (uIds != null) putParcelableArrayListExtra("USERNAME_IDS", uIds)
                                if (pIds != null) putParcelableArrayListExtra("PASSWORD_IDS", pIds)
                            }
                            setResult(Activity.RESULT_OK, intent)
                            finish()
                        } catch (e: Exception) {
                            Log.e("UnlockVaultActivity", "Failed to unwrap DEK", e)
                            TelemetryLogger.logEvent(applicationContext, TelemetryLogger.EventType.BIOMETRIC_FAILURE, domain, mapOf("reason" to "unwrap_failed", "message" to (e.message ?: "unknown")))
                            finish()
                        }
                    } else {
                        Log.e("UnlockVaultActivity", "CryptoObject is null on success")
                        TelemetryLogger.logEvent(applicationContext, TelemetryLogger.EventType.BIOMETRIC_FAILURE, domain, mapOf("reason" to "crypto_object_null"))
                        finish()
                    }
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    super.onAuthenticationError(errorCode, errString)
                    Log.e("UnlockVaultActivity", "Biometric error: $errorCode - $errString")
                    TelemetryLogger.logEvent(applicationContext, TelemetryLogger.EventType.BIOMETRIC_FAILURE, domain, mapOf("error_code" to errorCode, "error_string" to errString.toString()))
                    finish()
                }

                override fun onAuthenticationFailed() {
                    super.onAuthenticationFailed()
                    Log.w("UnlockVaultActivity", "Biometric authentication failed (mismatch)")
                    // Do NOT finish here, wait for error or success. It might let them try again.
                }
            })

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Unlock SecureVault")
            .setSubtitle("Autofill requires authentication")
            .setAllowedAuthenticators(androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .setNegativeButtonText("Cancel")
            .build()

        try {
            if (Build.VERSION_CODES.N <= Build.VERSION.SDK_INT) {
                val cipher = BiometricKeyManager.getDecryptionCipher(this)
                biometricPrompt.authenticate(promptInfo, BiometricPrompt.CryptoObject(cipher))
            } else {
                Toast.makeText(this, "Android 7.0+ required for vault security", Toast.LENGTH_SHORT).show()
                finishWithCancel()
            }
        } catch (e: Exception) {
            e.printStackTrace()
            // Example: Key invalidated because new fingerprints were added
            Toast.makeText(this, "Master password required (Biometrics changed)", Toast.LENGTH_LONG).show()
            finishWithCancel()
        }
    }

    private fun finishWithCancel() {
        setResult(RESULT_CANCELED)
        finish()
    }
}
