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
        if (node.autofillHints?.contains(android.view.View.AUTOFILL_HINT_USERNAME) == true ||
            node.autofillHints?.contains(android.view.View.AUTOFILL_HINT_EMAIL_ADDRESS) == true) {
            result.usernameNodes.add(node)
        } else if (node.autofillHints?.contains(android.view.View.AUTOFILL_HINT_PASSWORD) == true) {
            result.passwordNodes.add(node)
        } else {
            // Heuristic fallback if hints are missing
            val viewId = node.idEntry?.lowercase() ?: ""
            val inputType = node.inputType
            
            // InputType: 128 (TYPE_CLASS_TEXT | TYPE_TEXT_VARIATION_PASSWORD)
            // InputType: 224 (TYPE_CLASS_TEXT | TYPE_TEXT_VARIATION_VISIBLE_PASSWORD)
            // InputType: 18 (TYPE_CLASS_NUMBER | TYPE_NUMBER_VARIATION_PASSWORD)
            val isPasswordInputType = (inputType and android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD) != 0 ||
                                      (inputType and android.text.InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD) != 0 ||
                                      (inputType and android.text.InputType.TYPE_NUMBER_VARIATION_PASSWORD) != 0

            // Layer 4: Check hint text and content description (Fix C)
            val hintText = node.hint?.lowercase() ?: ""
            val contentDesc = node.contentDescription?.toString()?.lowercase() ?: ""
            val combined = "\$viewId \$hintText \$contentDesc"

            val passwordKeywords = listOf("password", "passcode", "pin", "secret", "passwd", "contraseña", "senha", "пароль", "密码")
            val usernameKeywords = listOf("username", "email", "login", "account", "phone", "userid", "member", "user name", "correo", "usuario")

            // Layer 5: Web-specific attribute checks (type, name, id)
            val htmlType = node.htmlInfo?.attributes?.find { it.first == "type" }?.second?.lowercase() ?: ""
            val htmlName = node.htmlInfo?.attributes?.find { it.first == "name" }?.second?.lowercase() ?: ""
            val htmlId = node.htmlInfo?.attributes?.find { it.first == "id" }?.second?.lowercase() ?: ""
            val combinedWeb = "$htmlType $htmlName $htmlId".lowercase()

            if (isPasswordInputType || passwordKeywords.any { combined.contains(it) } || htmlType == "password") {
                result.passwordNodes.add(node)
            } else if (usernameKeywords.any { combined.contains(it) } || 
                       htmlType == "email" || htmlType == "text" && usernameKeywords.any { combinedWeb.contains(it) }) {
                if (isEditableNode(node)) {
                    result.usernameNodes.add(node)
                }
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
