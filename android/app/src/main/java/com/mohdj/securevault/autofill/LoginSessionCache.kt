package com.mohdj.securevault.autofill

import android.util.Log
import java.util.Collections

object LoginSessionCache {
    private const val TAG = "LoginSessionCache"
    private const val MAX_ENTRIES = 20
    private const val TTL_MS = 60_000L // 60 seconds

    data class CachedLogin(val username: String, val timestamp: Long, val domain: String)

    // LRU Cache implementation
    private val cache = Collections.synchronizedMap(
        object : LinkedHashMap<String, CachedLogin>(MAX_ENTRIES, 0.75f, true) {
            override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, CachedLogin>?): Boolean {
                return size > MAX_ENTRIES
            }
        }
    )

    /**
     * Store a username context for a specific domain + package.
     */
    fun put(domain: String, packageName: String, username: String) {
        val key = "\$domain|\$packageName"
        val entry = CachedLogin(username, System.currentTimeMillis(), domain)
        Log.d(TAG, "Caching login context for key: \$key")
        cache[key] = entry
    }

    /**
     * Retrieve a valid (non-expired) username context for a domain + package.
     */
    fun get(domain: String, packageName: String): String? {
        val key = "\$domain|\$packageName"
        val entry = cache[key] ?: return null
        
        if (System.currentTimeMillis() - entry.timestamp > TTL_MS) {
            Log.d(TAG, "Cache entry expired for key: \$key")
            cache.remove(key)
            return null
        }
        
        Log.d(TAG, "Cache HIT for key: \$key")
        return entry.username
    }

    /**
     * Clear the cache entry (e.g., after successfully filling a password).
     */
    fun clear(domain: String, packageName: String) {
        val key = "\$domain|\$packageName"
        cache.remove(key)
        Log.d(TAG, "Cleared cache entry for key: \$key")
    }
}
