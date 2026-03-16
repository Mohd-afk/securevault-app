package com.mohdj.securevault.security

import android.os.SystemClock

object VaultUnlockManager {
    private var unlockTimeMillis = 0L
    private const val TIMEOUT_MILLIS = 5 * 60 * 1000L // 5 minutes

    val isUnlocked: Boolean
        get() = (SystemClock.elapsedRealtime() - unlockTimeMillis) < TIMEOUT_MILLIS

    fun unlock() {
        unlockTimeMillis = SystemClock.elapsedRealtime()
    }
    
    fun lock() {
        unlockTimeMillis = 0L
    }
}
