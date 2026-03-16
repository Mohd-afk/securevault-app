package com.mohdj.securevault.autofill

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class DomainMatcherTest {

    private lateinit var domainMatcher: DomainMatcher

    @Before
    fun setUp() {
        domainMatcher = DomainMatcher(null) // Pass null context to skip raw resource loading
        
        // Feed sample Public Suffix List rules for testing
        val sampleRules = """
            // comments
            com
            uk
            co.uk
            *.sch.uk
            !city.kobe.jp
            jp
            kobe.jp
            github.io
        """.trimIndent().lineSequence()
        
        domainMatcher.parsePSLLines(sampleRules)
    }

    @Test
    fun testBasicNormalizations() {
        assertEquals("example.com", domainMatcher.normalize("example.com"))
        assertEquals("example.com", domainMatcher.normalize("www.example.com"))
        assertEquals("example.com", domainMatcher.normalize("http://example.com"))
        assertEquals("example.com", domainMatcher.normalize("https://www.example.com/login?q=1"))
        assertEquals("example.com", domainMatcher.normalize("HTTPS://WWW.EXAMPLE.COM/"))
        assertEquals("example.com", domainMatcher.normalize(".example.com")) // Leading dot
    }

    @Test
    fun testPublicSuffixList() {
        assertEquals("amazon.co.uk", domainMatcher.normalize("https://www.amazon.co.uk/ap/signin"))
        assertEquals("amazon.co.uk", domainMatcher.normalize("amazon.co.uk"))
        assertEquals("amazon.co.uk", domainMatcher.normalize("signin.amazon.co.uk"))
        
        // Single label TLD
        assertEquals("github.com", domainMatcher.normalize("github.com"))
        assertEquals("github.com", domainMatcher.normalize("auth.github.com"))
    }
    
    @Test
    fun testWildcardAndExceptionRules() {
        // *.sch.uk rule (e.g. school.sch.uk is a public suffix)
        assertEquals("highschool.sch.uk", domainMatcher.normalize("login.highschool.sch.uk"))
        
        // Exception rule: !city.kobe.jp (e.g. city.kobe.jp is NOT a public suffix, but kobe.jp is)
        assertEquals("city.kobe.jp", domainMatcher.normalize("city.kobe.jp"))
        assertEquals("city.kobe.jp", domainMatcher.normalize("www.city.kobe.jp"))
    }
    
    @Test
    fun testPackageNameMapping() {
        // Exact mappings
        assertEquals("netflix.com", domainMatcher.normalize("com.netflix.mediaclient"))
        assertEquals("twitter.com", domainMatcher.normalize("com.twitter.android"))
        
        // With generic androidapp:// prefix sometimes passed by AutofillService
        assertEquals("netflix.com", domainMatcher.normalize("androidapp://com.netflix.mediaclient"))
    }
    
    @Test
    fun testUnknownPackageHeuristic() {
        // Unknown packages should just be returned as-is, but lowercased, for strict matching
        // Alternatively, if it fails to extract a host, it returns the input.
        assertEquals("com.unknown.app", domainMatcher.normalize("com.unknown.app"))
    }

    @Test
    fun testIsMatch() {
        // App mapping matching a web vault URL
        assertTrue(domainMatcher.isMatch("com.netflix.mediaclient", "https://netflix.com"))
        assertTrue(domainMatcher.isMatch("com.twitter.android", "https://mobile.twitter.com/login"))
        
        // Web to Web matching
        assertTrue(domainMatcher.isMatch("https://signin.amazon.co.uk", "https://www.amazon.co.uk"))
        assertTrue(domainMatcher.isMatch("auth.github.com", "github.com"))
        
        // Mismatches
        assertFalse(domainMatcher.isMatch("com.netflix.mediaclient", "amazon.com"))
        assertFalse(domainMatcher.isMatch("google.com", "github.com"))
        assertFalse(domainMatcher.isMatch("amazon.co.uk", "amazon.com"))
    }
}
