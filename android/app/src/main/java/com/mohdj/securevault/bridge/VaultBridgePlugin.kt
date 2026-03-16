package com.mohdj.securevault.bridge

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
            
            // Extract URIs list and store as JSON string
            val urisArray = obj.optJSONArray("uris")
            val urisString = urisArray?.toString() ?: "[]"
            
            val entity = VaultItemEntity(
                id = obj.optString("id", ""),
                title = obj.optString("title", ""),
                username = obj.optString("username", ""),
                encryptedPassword = obj.optString("password", ""), // Already AES encrypted by JS
                uris = urisString,
                type = obj.optString("type", "Other"),
                // Notice: React dates are numbers (timestamps), optLong extracts them safely
                createdAt = obj.optLong("createdAt", 0L),
                updatedAt = obj.optLong("updatedAt", 0L),
                deletedAt = if (obj.isNull("deletedAt")) null else obj.optLong("deletedAt", 0L)
            )
            entities.add(entity)
        }

        CoroutineScope(Dispatchers.IO).launch {
            try {
                repository.fullSync(entities)
                Log.i("VaultBridgePlugin", "Synced \${entities.size} items to native DB")
                call.resolve()
            } catch (e: Exception) {
                Log.e("VaultBridgePlugin", "Failed to sync to native DB", e)
                call.reject("Failed to sync: \${e.message}")
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
                        put("password", item.encryptedPassword)
                        put("type", item.type)
                        put("url", item.uris) // In native uris is a string, we map it back to url here
                        put("createdAt", item.createdAt)
                        put("updatedAt", item.updatedAt)
                    }
                    jsArray.put(jsObj)
                }
                
                Log.i("VaultBridgePlugin", "Returning \${items.size} items to WebView")
                call.resolve(JSObject().put("items", jsArray))
            } catch (e: Exception) {
                Log.e("VaultBridgePlugin", "Failed to get items from native DB", e)
                call.reject("Failed to get items: \${e.message}")
            }
        }
    }
}
