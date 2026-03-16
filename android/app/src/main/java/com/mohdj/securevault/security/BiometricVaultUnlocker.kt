package com.mohdj.securevault.security

import android.content.Context
import android.os.SystemClock

object BiometricVaultUnlocker {
    
    // In memory key
    @Volatile
    private var unlockedDek: ByteArray? = null
    
    // Auto-lock tracking
    @Volatile
    private var lastUnlockTimeStrMs: Long = 0
    private var autoLockTimeoutMs: Long = 5 * 60 * 1000 // default 5 mins, should be synced from Settings
    
    fun setAutoLockTimeout(minutes: Int) {
        autoLockTimeoutMs = if (minutes <= 0) Long.MAX_VALUE else (minutes * 60 * 1000).toLong()
    }

    fun isVaultUnlocked(): Boolean {
        if (unlockedDek == null) return false
        
        // Check timeout
        val elapsed = SystemClock.elapsedRealtime() - lastUnlockTimeStrMs
        if (elapsed > autoLockTimeoutMs) {
            lockVault()
            return false
        }
        
        return true
    }

    fun getUnlockedDek(): ByteArray? {
        if (!isVaultUnlocked()) return null
        return unlockedDek
    }

    fun setUnlockedDek(dek: ByteArray) {
        unlockedDek = dek
        lastUnlockTimeStrMs = SystemClock.elapsedRealtime()
    }

    fun lockVault() {
        // Zero out the array in memory before nulling the reference
        unlockedDek?.let {
            for (i in it.indices) {
                it[i] = 0
            }
        }
        unlockedDek = null
    }
}
