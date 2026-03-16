package com.mohdj.securevault.vault

import android.content.Context
import com.mohdj.securevault.security.DatabaseKeyManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class VaultRepository(context: Context) {
    private val db: NativeVaultDatabase by lazy {
        val passphrase = DatabaseKeyManager.getDatabasePassphrase(context)
        NativeVaultDatabase.getDatabase(context, passphrase)
    }
    
    private val dao = db.vaultDao()

    suspend fun fullSync(items: List<VaultItemEntity>) = withContext(Dispatchers.IO) {
        dao.deleteAll()
        dao.insertAll(items)
    }

    suspend fun insert(item: VaultItemEntity) = withContext(Dispatchers.IO) {
        dao.insert(item)
    }

    suspend fun findByDomain(domain: String): List<VaultItemEntity> = withContext(Dispatchers.IO) {
        dao.findByDomain(domain)
    }

    suspend fun getAllActive(): List<VaultItemEntity> = withContext(Dispatchers.IO) {
        dao.getAllActive()
    }
}
