package com.mohdj.securevault

import android.os.Bundle
import android.util.Log
import com.getcapacitor.BridgeActivity
import com.mohdj.securevault.bridge.VaultBridgePlugin
import com.mohdj.securevault.bridge.BiometricBridgePlugin

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Register plugins before calling super.onCreate()
        registerPlugin(VaultBridgePlugin::class.java)
        registerPlugin(BiometricBridgePlugin::class.java)
        super.onCreate(savedInstanceState)
        Log.i("MainActivity", "MainActivity created and plugins registered.")
    }
}
