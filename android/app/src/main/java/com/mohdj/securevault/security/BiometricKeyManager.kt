package com.mohdj.securevault.security

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import androidx.annotation.RequiresApi

object BiometricKeyManager {
    private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    private const val KEY_ALIAS = "securevault_biometric_kek"
    private const val PREFS_NAME = "securevault_biometric_prefs"
    private const val PREF_WRAPPED_DEK = "wrapped_dek"
    private const val PREF_IV = "wrapped_dek_iv"

    private fun getPrefs(context: Context): SharedPreferences {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    @RequiresApi(Build.VERSION_CODES.N)
    fun getOrCreateBiometricKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

        if (!keyStore.containsAlias(KEY_ALIAS)) {
            val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
            val builder = KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setUserAuthenticationRequired(true)

            if (Build.VERSION_CODES.N <= Build.VERSION.SDK_INT) {
                builder.setInvalidatedByBiometricEnrollment(true)
            }
            if (Build.VERSION_CODES.R <= Build.VERSION.SDK_INT) {
                builder.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
            } else {
                @Suppress("DEPRECATION")
                builder.setUserAuthenticationValidityDurationSeconds(-1)
            }

            keyGenerator.init(builder.build())
            keyGenerator.generateKey()
        }

        return keyStore.getKey(KEY_ALIAS, null) as SecretKey
    }

    @RequiresApi(Build.VERSION_CODES.N)
    fun getEncryptionCipher(): Cipher {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val secretKey = getOrCreateBiometricKey()
        cipher.init(Cipher.ENCRYPT_MODE, secretKey)
        return cipher
    }

    @RequiresApi(Build.VERSION_CODES.N)
    fun getDecryptionCipher(context: Context): Cipher {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val secretKey = getOrCreateBiometricKey()
        
        val prefs = getPrefs(context)
        val ivB64 = prefs.getString(PREF_IV, null) ?: throw IllegalStateException("No IV found")
        val iv = Base64.decode(ivB64, Base64.DEFAULT)
        
        cipher.init(Cipher.DECRYPT_MODE, secretKey, GCMParameterSpec(128, iv))
        return cipher
    }

    fun storeWrappedDEK(context: Context, cipher: Cipher, plainDEK: ByteArray) {
        val encryptedDEK = cipher.doFinal(plainDEK)
        val iv = cipher.iv

        getPrefs(context).edit()
            .putString(PREF_WRAPPED_DEK, Base64.encodeToString(encryptedDEK, Base64.DEFAULT))
            .putString(PREF_IV, Base64.encodeToString(iv, Base64.DEFAULT))
            .apply()
    }

    fun unwrapDEK(context: Context, cipher: Cipher): ByteArray {
        val prefs = getPrefs(context)
        val wrappedDEKBase64 = prefs.getString(PREF_WRAPPED_DEK, null)
            ?: throw IllegalStateException("No wrapped DEK found")
        
        val encryptedDEK = Base64.decode(wrappedDEKBase64, Base64.DEFAULT)
        return cipher.doFinal(encryptedDEK)
    }

    fun isBiometricEnabled(context: Context): Boolean {
        return getPrefs(context).contains(PREF_WRAPPED_DEK)
    }

    fun disableBiometric(context: Context) {
        // Clear prefs
        getPrefs(context).edit().clear().apply()

        // Delete key from keystore
        try {
            val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
            if (keyStore.containsAlias(KEY_ALIAS)) {
                keyStore.deleteEntry(KEY_ALIAS)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
