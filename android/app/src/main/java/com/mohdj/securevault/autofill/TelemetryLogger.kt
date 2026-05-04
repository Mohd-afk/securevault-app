package com.mohdj.securevault.autofill

import android.content.Context
import android.util.Log
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object TelemetryLogger {
    private const val TAG = "KeeguardTelemetry"
    private const val FILE_NAME = "autofill_telemetry.jsonl"

    enum class EventType {
        FILL_REQUEST,
        FILL_SUCCESS,
        FILL_FAILURE,
        SAVE_REQUEST,
        SAVE_SUCCESS,
        SAVE_FAILURE,
        UNMATCHED_DOMAIN,
        BIOMETRIC_PROMPT_SHOWN,
        BIOMETRIC_SUCCESS,
        BIOMETRIC_FAILURE
    }

    fun logEvent(context: Context, type: EventType, domain: String?, additionalData: Map<String, Any>? = null) {
        try {
            val event = JSONObject()
            event.put("timestamp", SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).format(Date()))
            event.put("type", type.name)
            
            if (domain != null) {
                // Anonymize/hash the domain if extreme privacy is needed, or just keep the TLD/SLD
                // We'll keep the raw string here because it's stored locally
                event.put("domain", domain)
            }
            
            if (additionalData != null) {
                val dataObj = JSONObject()
                for ((k, v) in additionalData) {
                    dataObj.put(k, v)
                }
                event.put("data", dataObj)
            }

            val jsonString = event.toString()
            Log.d(TAG, "Telemetry: \$jsonString")

            val file = File(context.filesDir, FILE_NAME)
            FileOutputStream(file, true).use { out ->
                out.write((jsonString + "\n").toByteArray())
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to log telemetry event: \${e.message}")
        }
    }

    fun getLogs(context: Context): List<String> {
        val file = File(context.filesDir, FILE_NAME)
        if (!file.exists()) return emptyList()
        return try {
            file.readLines()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to read telemetry logs: \${e.message}")
            emptyList()
        }
    }

    fun clearLogs(context: Context) {
        val file = File(context.filesDir, FILE_NAME)
        if (file.exists()) {
            file.delete()
        }
    }
}
