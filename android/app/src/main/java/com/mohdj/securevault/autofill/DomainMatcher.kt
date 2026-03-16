package com.mohdj.securevault.autofill

import android.content.Context
import java.io.InputStream
import java.net.URI
import java.net.URISyntaxException
import com.mohdj.securevault.R

class DomainMatcher(private val context: Context? = null) {
    private val pslDirectRules = mutableSetOf<String>()
    private val pslWildcardRules = mutableSetOf<String>()
    private val pslExceptionRules = mutableSetOf<String>()
    
    // Known app package mappings
    private val appMappings = mutableMapOf(
        "com.netflix.mediaclient" to "netflix.com",
        "com.twitter.android" to "twitter.com",
        "com.facebook.katana" to "facebook.com",
        "com.instagram.android" to "instagram.com",
        "com.google.android.youtube" to "youtube.com",
        "com.spotify.music" to "spotify.com",
        "com.amazon.mShop.android.shopping" to "amazon.com",
        "com.reddit.frontpage" to "reddit.com",
        "com.pinterest" to "pinterest.com",
        "com.linkedin.android" to "linkedin.com",
        "com.dropbox.android" to "dropbox.com",
        "com.slack" to "slack.com",
        "com.discord" to "discord.com",
        "com.github.android" to "github.com",
        "com.microsoft.teams" to "microsoft.com",
        "com.hulu.plus" to "hulu.com",
        "com.disney.disneyplus" to "disneyplus.com",
        "tv.twitch.android.app" to "twitch.tv",
        "com.paypal.android.p2pmobile" to "paypal.com"
        // Can be expanded further later, ideally pulling from a bundled JSON eventually
    )

    init {
        loadPublicSuffixList()
    }

    /**
     * Loads the Public Suffix List from res/raw/public_suffix_list.dat
     * If context is null (during testing), it expects the file to be provided via alternative means or skips loading.
     */
    private fun loadPublicSuffixList() {
        if (context == null) return
        
        try {
            val inputStream: InputStream = context.resources.openRawResource(R.raw.public_suffix_list)
            inputStream.bufferedReader().useLines { lines ->
                parsePSLLines(lines)
            }
        } catch (e: Exception) {
            e.printStackTrace()
            // In case of catastrophic failure (e.g. file missing), we have a fallback, but PSL is highly recommended
        }
    }

    /**
     * Visible for testing. Allows feeding PSL lines directly.
     */
    fun parsePSLLines(lines: Sequence<String>) {
        lines.forEach { line ->
            val trimmed = line.trim()
            if (trimmed.isEmpty() || trimmed.startsWith("//")) return@forEach
            
            // Format check
            val rule = trimmed.split(Regex("\\s+"))[0] // take first token
            
            when {
                rule.startsWith("!") -> pslExceptionRules.add(rule.substring(1))
                rule.startsWith("*.") -> pslWildcardRules.add(rule.substring(2))
                else -> pslDirectRules.add(rule)
            }
        }
    }

    /**
     * Normalizes a raw string (which could be a URL, an Android package name, or just a domain string)
     * into its pure root domain using the Mozilla Public Suffix List logic.
     */
    fun normalize(rawInput: String?): String? {
        if (rawInput.isNullOrBlank()) return null
        var input = rawInput.trim().lowercase()

        // 1. Check if it's an Android package name
        if (input.startsWith("androidapp://")) {
            input = input.removePrefix("androidapp://")
        }
        
        // If it looks like a package name (com.something.app), check mapping
        if (appMappings.containsKey(input)) {
            return appMappings[input]
        }
        
        // Android package names that we don't have mappings for, e.g., com.example.app -> example.com (heuristic fallback)
        // Usually, AutofillService provides the package name. If we don't know it, we extract the middle part as a guess,
        // but it's risky for security. Better to leave it as the package name and require the user's vault to save it that way.
        if (input.contains(".") && !input.contains("http") && !input.contains("/")) {
            // It might just be a domain already, or a package. We'll proceed to parse it as a domain.
        }

        // 2. Extract host from URL
        var host = extractHost(input) ?: input

        // 3. Strip leading dot or www.
        host = host.removePrefix(".")
        if (host.startsWith("www.")) {
            host = host.removePrefix("www.")
        }
        
        // 4. Apply Public Suffix List rules
        return getRootDomain(host)
    }

    private fun extractHost(urlStr: String): String {
        // If it doesn't have a protocol, URI parser might fail or misinterpret
        val withProtocol = if (!urlStr.contains("://") && urlStr.contains(".")) {
            "http://$urlStr" 
        } else {
            urlStr
        }

        return try {
            val uri = URI(withProtocol)
            uri.host ?: urlStr
        } catch (e: URISyntaxException) {
            urlStr
        }
    }

    private fun getRootDomain(host: String): String? {
        val parts = host.split(".")
        if (parts.size <= 1) return host // e.g. "localhost"

        // For PSL lookup, we need to match from right to left (longest suffix)
        // e.g. for a.b.c.com, we check com, c.com, b.c.com, a.b.c.com
        
        var matchIndex = -1 // Index of the start of the suffix in the `parts` array
        
        // We find the longest matching rule
        var longestMatchPartsCount = 0

        for (i in parts.indices) {
            val suffixToTest = parts.subList(i, parts.size).joinToString(".")
            
            if (pslExceptionRules.contains(suffixToTest)) {
                // Exceptional rule found (e.g. !city.kobe.jp). The exception itself is the suffix.
                longestMatchPartsCount = parts.size - i
                matchIndex = i
                break // Exceptions take precedence and halt
            }
            
            if (pslDirectRules.contains(suffixToTest)) {
                if ((parts.size - i) > longestMatchPartsCount) {
                    longestMatchPartsCount = parts.size - i
                    matchIndex = i
                }
            }
            
            // Check wildcard rules (*.suffix)
            if (i < parts.size - 1) {
                // If the rule is *.sch.uk, and we are testing parts [school, sch, uk] (i=0)
                // then the suffix part after the wildcard is [sch, uk] which is from i+1
                val wildcardSuffix = parts.subList(i + 1, parts.size).joinToString(".")
                if (pslWildcardRules.contains(wildcardSuffix)) {
                    val matchSize = parts.size - i // Includes the wildcard part
                    if (matchSize > longestMatchPartsCount) {
                        longestMatchPartsCount = matchSize
                        matchIndex = i
                    }
                }
            }
        }
        
        // If no rules matched, the prevailing rule is '*'. So the suffix is just the last part (e.g., .com)
        if (longestMatchPartsCount == 0 || matchIndex == -1) {
            matchIndex = parts.size - 1
        }
        
        // The root domain is the suffix + exactly one preceding label.
        // e.g. if suffix is "co.uk" (matchIndex = size - 2), root is "amazon.co.uk" (startIndex = matchIndex - 1)
        
        val rootStartIndex = matchIndex - 1
        if (rootStartIndex < 0) {
            // The whole host IS the suffix, or the host didn't have enough parts.
            return host
        }
        
        return parts.subList(rootStartIndex, parts.size).joinToString(".")
    }

    /**
     * Checks if a vault item's normalized URL matches the requested component (app or web).
     */
    fun isMatch(targetDomainOrPackage: String?, vaultItemUrl: String?): Boolean {
        if (targetDomainOrPackage == null || vaultItemUrl == null) return false
        val normalizedTarget = normalize(targetDomainOrPackage) ?: return false
        val normalizedVaultItem = normalize(vaultItemUrl) ?: return false
        
        return normalizedTarget == normalizedVaultItem
    }

    /**
     * Calculates a confidence score between the observed domain/package and the vault item's domain.
     * 1.0 = exact match
     * 0.9 = subdomain match (e.g., login.amazon.com vs amazon.com)
     * 0.0 = completely different root domain
     */
    fun calculateConfidence(targetRawInput: String?, vaultItemUrl: String?): Double {
        if (targetRawInput == null || vaultItemUrl == null) return 0.0
        
        // Quick check for exact mappings or direct matches
        if (targetRawInput == vaultItemUrl) return 1.0
        if (appMappings[targetRawInput] == vaultItemUrl) return 1.0
        
        val normalizedTarget = normalize(targetRawInput) ?: return 0.0
        val normalizedVaultItem = normalize(vaultItemUrl) ?: return 0.0
        
        if (normalizedTarget != normalizedVaultItem) {
            return 0.0 // Different root domains entirely
        }
        
        // If the root domains match, let's see if the raw input was EXACTLY the same, or a subdomain
        val targetHost = extractHost(targetRawInput.trim().lowercase()) ?: ""
        val vaultHost = extractHost(vaultItemUrl.trim().lowercase()) ?: ""
        
        // Exact host match or exact mapping match
        if (targetHost == vaultHost || appMappings[targetRawInput] == vaultHost) {
            return 1.0
        }
        
        // Subdomain match (since root domain matched above)
        return 0.9
    }

    /**
     * Explicitly get an app mapping without guessing or normalizing the package name.
     */
    fun getAppMapping(packageName: String): String? {
        return appMappings[packageName.lowercase()]
    }
}
