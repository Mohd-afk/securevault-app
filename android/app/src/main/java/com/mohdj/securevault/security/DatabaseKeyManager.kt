package com.mohdj.securevault.security

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

object DatabaseKeyManager {
    private const val KEY_ALIAS = "Keeguard_db_wrapper_key"
    private const val PREFS_NAME = "Keeguard_crypto_prefs"
    private const val PREF_ENCRYPTED_DB_KEY = "encrypted_db_key"
    private const val PREF_IV = "db_key_iv"

    fun getDatabasePassphrase(context: Context): ByteArray {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val encryptedKeyB64 = prefs.getString(PREF_ENCRYPTED_DB_KEY, null)
        val ivB64 = prefs.getString(PREF_IV, null)

        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

        if (!keyStore.containsAlias(KEY_ALIAS)) {
            val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
            val spec = KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
            keyGenerator.init(spec)
            keyGenerator.generateKey()
        }

        val secretKey = keyStore.getKey(KEY_ALIAS, null) as SecretKey

        if (encryptedKeyB64 == null || ivB64 == null) {
            val newDbKey = ByteArray(32)
            SecureRandom().nextBytes(newDbKey)

            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, secretKey)
            val iv = cipher.iv
            val encryptedKey = cipher.doFinal(newDbKey)

            prefs.edit()
                .putString(PREF_ENCRYPTED_DB_KEY, Base64.encodeToString(encryptedKey, Base64.DEFAULT))
                .putString(PREF_IV, Base64.encodeToString(iv, Base64.DEFAULT))
                .apply()

            return newDbKey
        } else {
            val encryptedKey = Base64.decode(encryptedKeyB64, Base64.DEFAULT)
            val iv = Base64.decode(ivB64, Base64.DEFAULT)

            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, secretKey, GCMParameterSpec(128, iv))
            return cipher.doFinal(encryptedKey)
        }
    }

    // Basic heuristic to check for rooted devices
    fun isDeviceRooted(): Boolean {
        val buildTags = android.os.Build.TAGS
        if (buildTags != null && buildTags.contains("test-keys")) {
            return true
        }
        val paths = arrayOf(
            "/system/app/Superuser.apk",
            "/sbin/su",
            "/system/bin/su",
            "/system/xbin/su",
            "/data/local/xbin/su",
            "/data/local/bin/su",
            "/system/sd/xbin/su",
            "/system/bin/failsafe/su",
            "/data/local/su",
            "/su/bin/su"
        )
        for (path in paths) {
            if (java.io.File(path).exists()) return true
        }
        return false
    }
}
