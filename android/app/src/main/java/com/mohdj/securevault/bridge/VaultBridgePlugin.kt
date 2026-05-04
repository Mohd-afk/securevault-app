package com.mohdj.securevault.bridge

// [MODIFIED v3.2.2] RC1:
//   - Updated field reference: encryptedPassword → password (matching VaultItemEntity rename).
//   - Corrected comment: the "password" field from JS is PLAINTEXT at sync time
//     (the vault is already unlocked/decrypted in memory). The SQLCipher DB is the
//     security boundary — no additional AES layer is applied here.

import android.util.Log
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.mohdj.securevault.vault.VaultItemEntity
import com.mohdj.securevault.vault.VaultRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

@CapacitorPlugin(name = "VaultBridge")
class VaultBridgePlugin : Plugin() {

    private lateinit var repository: VaultRepository

    override fun load() {
        super.load()
        repository = VaultRepository(context)
        Log.i("VaultBridgePlugin", "Plugin loaded")
    }

    @PluginMethod
    fun fullSync(call: PluginCall) {
        val itemsArray = call.getArray("items")
        if (itemsArray == null) {
            call.reject("Must provide items array")
            return
        }

        val entities = mutableListOf<VaultItemEntity>()
        for (i in 0 until itemsArray.length()) {
            val obj = itemsArray.getJSONObject(i)

            // ── URI extraction ────────────────────────────────────────────────
            // The JS layer sends `uris` in one of two formats:
            //
            //   FORMAT A — Pre-serialized JSON string (current store.ts behaviour):
            //     uris = '["https://id.dreamapply.com"]'
            //     obj.optString("uris") → '["https://id.dreamapply.com"]'
            //     obj.optJSONArray("uris") → NULL  ← THIS WAS THE BUG
            //
            //   FORMAT B — Native JSON array (future-proof):
            //     uris = ["https://example.com"]
            //     obj.optJSONArray("uris") → JSONArray  ← works fine
            //
            // We must handle both. Prefer the JSONArray path; fall back to
            // using the raw string value if it looks like a serialized array.
            val urisString: String = run {
                val asArray = obj.optJSONArray("uris")
                if (asArray != null) {
                    // FORMAT B — native array, serialise it
                    asArray.toString()
                } else {
                    // FORMAT A — check if optString gives us a valid JSON array string
                    val asString = obj.optString("uris", "[]").trim()
                    if (asString.startsWith("[")) asString else "[$asString]"
                }
            }
            Log.d("VaultBridgePlugin", "item uris parsed → $urisString")

            // Security note: 'password' arrives as plaintext from JS because the vault is
            // already unlocked (decrypted in memory) when syncToNativeVault() is called.
            // The SQLCipher-encrypted native DB (keyed by Android Keystore) is the
            // security boundary — no additional application-layer encryption is applied.
            val entity = VaultItemEntity(
                id = obj.optString("id", ""),
                title = obj.optString("title", ""),
                username = obj.optString("username", ""),
                password = obj.optString("password", ""),
                uris = urisString,
                type = obj.optString("type", "Other"),
                // Native dates are numbers (timestamps), optLong extracts them safely
                createdAt = obj.optLong("createdAt", 0L),
                updatedAt = obj.optLong("updatedAt", 0L),
                deletedAt = if (obj.isNull("deletedAt")) null else obj.optLong("deletedAt", 0L)
            )
            entities.add(entity)
        }

        CoroutineScope(Dispatchers.IO).launch {
            try {
                repository.fullSync(entities)
                Log.i("VaultBridgePlugin", "Synced ${entities.size} items to native SQLCipher DB")
                call.resolve()
            } catch (e: Exception) {
                Log.e("VaultBridgePlugin", "Failed to sync to native DB: ${e.message?.take(100)}", e)
                call.reject("Failed to sync: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun getItems(call: PluginCall) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val items = repository.getAllActive()
                val jsArray = JSArray()

                for (item in items) {
                    val jsObj = JSObject().apply {
                        put("id", item.id)
                        put("title", item.title)
                        put("username", item.username)
                        put("password", item.password)  // Plaintext from SQLCipher-protected DB
                        put("type", item.type)
                        put("url", item.uris)
                        put("createdAt", item.createdAt)
                        put("updatedAt", item.updatedAt)
                    }
                    jsArray.put(jsObj)
                }

                Log.i("VaultBridgePlugin", "Returning ${items.size} items to WebView")
                call.resolve(JSObject().put("items", jsArray))
            } catch (e: Exception) {
                Log.e("VaultBridgePlugin", "Failed to get items from native DB: ${e.message?.take(100)}", e)
                call.reject("Failed to get items: ${e.message}")
            }
        }
    }

    companion object {
        suspend fun getItems(context: android.content.Context): List<VaultItemEntity> {
            return VaultRepository(context).getAllActive()
        }
    }
}
