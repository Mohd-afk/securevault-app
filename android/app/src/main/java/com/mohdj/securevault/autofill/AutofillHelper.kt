package com.mohdj.securevault.autofill

import android.app.assist.AssistStructure
import android.util.Log
import android.view.autofill.AutofillId
import android.view.autofill.AutofillValue
import android.service.autofill.SaveInfo

class AutofillHelper {
    
    data class ParsedStructure(
        val usernameNodes: MutableList<AssistStructure.ViewNode> = mutableListOf(),
        val passwordNodes: MutableList<AssistStructure.ViewNode> = mutableListOf(),
        var webDomain: String? = null
    )

    fun parseStructure(structure: AssistStructure): ParsedStructure {
        val result = ParsedStructure()
        
        Log.d("AutofillHelper", "Parsing structure with \${structure.windowNodeCount} window nodes")
        
        for (i in 0 until structure.windowNodeCount) {
            val windowNode = structure.getWindowNodeAt(i)
            val rootNode = windowNode.rootViewNode
            traverseNode(rootNode, result)
        }
        
        return result
    }

    fun getSaveInfo(parsed: ParsedStructure): SaveInfo? {
        if (parsed.passwordNodes.isEmpty()) {
            return null // We don't save just usernames
        }

        val requiredIds = mutableListOf<AutofillId>()
        val passwordIds = parsed.passwordNodes.mapNotNull { it.autofillId }
        val usernameIds = parsed.usernameNodes.mapNotNull { it.autofillId }

        requiredIds.addAll(passwordIds)
        // If there is a password field, username is optional for save (e.g. they only typed password for login) 
        // but we'll include it in optional IDs so it's captured if present
        
        return SaveInfo.Builder(
            SaveInfo.SAVE_DATA_TYPE_PASSWORD,
            requiredIds.toTypedArray()
        )
        .setOptionalIds(usernameIds.toTypedArray())
        .build()
    }

    private fun traverseNode(node: AssistStructure.ViewNode, result: ParsedStructure) {
        // Step 1: Detect Chrome Custom Tabs or WebViews which hold the actual domain
        val webDomain = node.webDomain
        if (webDomain != null && result.webDomain == null) {
            result.webDomain = webDomain
            Log.d("AutofillHelper", "Found web domain: \$webDomain")
        }

        // Step 2: Try to identify the field purpose
        val hints = node.autofillHints ?: emptyArray()
        val hintSet = hints.toSet()

        // Standard autofill hints — most reliable signal
        if (hintSet.contains(android.view.View.AUTOFILL_HINT_PASSWORD) ||
            hintSet.contains("current-password") ||
            hintSet.contains("new-password")) {
            Log.d("AutofillHelper", "Password field via hint: ${node.idEntry}")
            result.passwordNodes.add(node)
        } else if (hintSet.contains(android.view.View.AUTOFILL_HINT_USERNAME) ||
            hintSet.contains(android.view.View.AUTOFILL_HINT_EMAIL_ADDRESS) ||
            hintSet.contains("username") || hintSet.contains("email")) {
            Log.d("AutofillHelper", "Username field via hint: ${node.idEntry}")
            result.usernameNodes.add(node)
        } else {
            // Heuristic fallback if hints are missing
            val viewId = node.idEntry?.lowercase() ?: ""
            val inputType = node.inputType

            // ── Password InputType detection ────────────────────────────────
            // inputType is a bitmask. The variation occupies bits 8-11 (0x00000FF0 range).
            // We mask off the class bits and compare only the variation.
            // TYPE_CLASS_TEXT           = 0x00000001
            // TYPE_TEXT_VARIATION_PASSWORD         = 0x00000080
            // TYPE_TEXT_VARIATION_VISIBLE_PASSWORD  = 0x00000090
            // TYPE_TEXT_VARIATION_WEB_PASSWORD      = 0x000000E0
            // TYPE_NUMBER_VARIATION_PASSWORD        = 0x00000010 (class = 2)
            val textVariation = inputType and 0x00000FF0  // strip class bits
            val isPasswordInputType =
                textVariation == android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD ||
                textVariation == android.text.InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD ||
                textVariation == android.text.InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD ||
                // Some implementations use the raw flag value
                (inputType and android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD) != 0 ||
                (inputType and 0x000000E0) != 0 // web password variation

            // HTML attributes (for WebView / Chrome-rendered forms)
            val htmlType = node.htmlInfo?.attributes?.find { it.first == "type" }?.second?.lowercase() ?: ""
            val htmlName = node.htmlInfo?.attributes?.find { it.first == "name" }?.second?.lowercase() ?: ""
            val htmlId   = node.htmlInfo?.attributes?.find { it.first == "id"   }?.second?.lowercase() ?: ""

            val hintText     = node.hint?.lowercase() ?: ""
            val contentDesc  = node.contentDescription?.toString()?.lowercase() ?: ""
            val combined     = "$viewId $hintText $contentDesc $htmlName $htmlId"

            val passwordKeywords = listOf(
                "password", "passcode", "pin", "secret", "passwd",
                "contraseña", "senha", "пароль", "密码", "pass"
            )
            val usernameKeywords = listOf(
                "username", "email", "login", "account", "phone",
                "userid", "user_id", "member", "user name", "correo", "usuario",
                "e-mail", "mail"
            )

            val isHtmlPassword = htmlType == "password"
            val matchesPasswordKeyword = passwordKeywords.any { combined.contains(it) }
            val matchesUsernameKeyword = usernameKeywords.any { combined.contains(it) }

            Log.d("AutofillHelper", "Heuristic check: viewId=$viewId htmlType=$htmlType " +
                    "inputType=0x${inputType.toString(16)} textVariation=0x${textVariation.toString(16)} " +
                    "isPasswordInputType=$isPasswordInputType isHtmlPassword=$isHtmlPassword")

            if (isPasswordInputType || isHtmlPassword || matchesPasswordKeyword) {
                Log.d("AutofillHelper", "→ CLASSIFIED as PASSWORD field")
                result.passwordNodes.add(node)
            } else if (matchesUsernameKeyword || htmlType == "email" ||
                       (htmlType == "text" && usernameKeywords.any { "$htmlName $htmlId".contains(it) })) {
                if (isEditableNode(node)) {
                    Log.d("AutofillHelper", "→ CLASSIFIED as USERNAME field")
                    result.usernameNodes.add(node)
                }
            } else {
                Log.d("AutofillHelper", "→ UNCLASSIFIED field (skipped)")
            }
        }

        // Traverse children
        for (i in 0 until node.childCount) {
            traverseNode(node.getChildAt(i), result)
        }
    }

    private fun isEditableNode(node: AssistStructure.ViewNode): Boolean {
        if (!node.isEnabled) return false
        
        return node.className?.contains("EditText") == true
            || node.className?.contains("TextInputLayout") == true
            || node.htmlInfo?.tag == "input"
            || (node.inputType and android.text.InputType.TYPE_CLASS_TEXT) != 0
            || node.isFocused
    }
}
