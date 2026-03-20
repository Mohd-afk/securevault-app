package com.mohdj.securevault.bridge

import android.os.Build
import android.util.Base64
import android.content.Context
import androidx.annotation.RequiresApi
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.JSArray
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.mohdj.securevault.security.BiometricKeyManager
import com.mohdj.securevault.security.BiometricVaultUnlocker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import javax.crypto.Cipher

@CapacitorPlugin(name = "BiometricBridge")
class BiometricBridgePlugin : Plugin() {

    @PluginMethod
    fun isBiometricAvailable(call: PluginCall) {
        val biometricManager = BiometricManager.from(context)
        when (biometricManager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)) {
            BiometricManager.BIOMETRIC_SUCCESS -> {
                if (com.mohdj.securevault.security.DatabaseKeyManager.isDeviceRooted()) {
                    call.resolve(JSObject().put("available", false).put("reason", "Device is rooted"))
                } else {
                    call.resolve(JSObject().put("available", true))
                }
            }
            BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE -> {
                call.resolve(JSObject().put("available", false).put("reason", "No hardware"))
            }
            BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE -> {
                call.resolve(JSObject().put("available", false).put("reason", "Hardware unavailable"))
            }
            BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED -> {
                call.resolve(JSObject().put("available", false).put("reason", "None enrolled"))
            }
            else -> {
                call.resolve(JSObject().put("available", false).put("reason", "Unknown status"))
            }
        }
    }

    @RequiresApi(Build.VERSION_CODES.N)
    @PluginMethod
    fun enableBiometric(call: PluginCall) {
        val dekBase64 = call.getString("dekBase64")
        if (dekBase64 == null) {
            call.reject("Missing dekBase64")
            return
        }

        val plainDEK = Base64.decode(dekBase64, Base64.DEFAULT)

        val cipher: Cipher
        try {
            cipher = BiometricKeyManager.getEncryptionCipher()
        } catch (e: Exception) {
            call.reject("Failed to initialize cipher: ${e.message}")
            return
        }

        CoroutineScope(Dispatchers.Main).launch {
            showBiometricPrompt(
                cipher,
                title = "Link Biometrics to SecureVault",
                subtitle = "Authenticate to allow unlocking your vault safely",
                onSuccess = { cryptoObject ->
                    try {
                        BiometricKeyManager.storeWrappedDEK(context, cryptoObject.cipher!!, plainDEK)
                        // Scrub memory in native
                        plainDEK.fill(0)
                        call.resolve(JSObject().put("success", true))
                    } catch (e: Exception) {
                        call.reject("Failed to wrap DEK: ${e.message}")
                    }
                },
                onError = { call.reject(it) }
            )
        }
    }

    @RequiresApi(Build.VERSION_CODES.N)
    @PluginMethod
    fun unlockWithBiometric(call: PluginCall) {
        if (!BiometricKeyManager.isBiometricEnabled(context)) {
            call.reject("Biometric not enabled")
            return
        }

        val cipher: Cipher
        try {
            cipher = BiometricKeyManager.getDecryptionCipher(context)
        } catch (e: Exception) {
            // If the key is invalidated (e.g. biometrics changed), e will be KeyPermanentlyInvalidatedException
            call.reject("KEY_INVALIDATED: ${e.message}")
            BiometricKeyManager.disableBiometric(context)
            return
        }

        CoroutineScope(Dispatchers.Main).launch {
            showBiometricPrompt(
                cipher,
                title = "Unlock SecureVault",
                subtitle = "Verify your identity to open the vault",
                onSuccess = { cryptoObject ->
                    try {
                        val unwrappedDEK = BiometricKeyManager.unwrapDEK(context, cryptoObject.cipher!!)
                        val base64DEK = Base64.encodeToString(unwrappedDEK, Base64.NO_WRAP)
                        unwrappedDEK.fill(0)
                        call.resolve(JSObject().put("dekBase64", base64DEK))
                    } catch (e: Exception) {
                        call.reject("Failed to unwrap DEK: ${e.message}")
                    }
                },
                onError = { call.reject(it) }
            )
        }
    }

    @PluginMethod
    fun disableBiometric(call: PluginCall) {
        BiometricKeyManager.disableBiometric(context)
        call.resolve(JSObject().put("success", true))
    }

    @PluginMethod
    fun isBiometricEnabled(call: PluginCall) {
        val enabled = BiometricKeyManager.isBiometricEnabled(context)
        call.resolve(JSObject().put("enabled", enabled))
    }

    @PluginMethod
    fun syncAutoLockTimeout(call: PluginCall) {
        val timeoutMinutes = call.getInt("timeoutMinutes", 5) ?: 5
        BiometricVaultUnlocker.setAutoLockTimeout(timeoutMinutes)
        call.resolve(JSObject().put("success", true))
    }

    @PluginMethod
    fun syncAutofillBlocklist(call: PluginCall) {
        val blocklistArray = call.getArray("blocklist") ?: JSArray()
        val blocklistSet = mutableSetOf<String>()
        for (i in 0 until blocklistArray.length()) {
            blocklistSet.add(blocklistArray.getString(i))
        }
        
        val prefs = context.getSharedPreferences("SecureVaultSettings", Context.MODE_PRIVATE)
        prefs.edit().putStringSet("autofillBlocklist", blocklistSet).apply()
        
        call.resolve(JSObject().put("success", true))
    }

    private fun showBiometricPrompt(
        cipher: Cipher,
        title: String,
        subtitle: String,
        onSuccess: (BiometricPrompt.CryptoObject) -> Unit,
        onError: (String) -> Unit
    ) {
        val activity = bridge.activity
        if (activity == null || activity.isFinishing) {
            onError("Activity is null or finishing")
            return
        }

        val executor = ContextCompat.getMainExecutor(context)
        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle(subtitle)
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .setNegativeButtonText("Cancel")
            .build()

        val biometricPrompt = BiometricPrompt(
            activity as androidx.fragment.app.FragmentActivity,
            executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    super.onAuthenticationError(errorCode, errString)
                    onError("ERROR_$errorCode: $errString")
                }

                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    super.onAuthenticationSucceeded(result)
                    val cryptoObject = result.cryptoObject
                    if (cryptoObject?.cipher != null) {
                        onSuccess(cryptoObject)
                    } else {
                        onError("CryptoObject is null")
                    }
                }

                override fun onAuthenticationFailed() {
                    super.onAuthenticationFailed()
                }
            }
        )

        try {
            biometricPrompt.authenticate(promptInfo, BiometricPrompt.CryptoObject(cipher))
        } catch (e: Exception) {
            onError("Prompt error: ${e.message}")
        }
    }
}
