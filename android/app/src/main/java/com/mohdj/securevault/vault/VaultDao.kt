package com.mohdj.securevault.vault

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction

@Dao
interface VaultDao {
    @Query("SELECT * FROM vault_items WHERE deleted_at IS NULL")
    suspend fun getAllActive(): List<VaultItemEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(items: List<VaultItemEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(item: VaultItemEntity)

    @Query("DELETE FROM vault_items")
    suspend fun deleteAll()

    @Query("SELECT * FROM vault_items WHERE uris LIKE '%' || :domain || '%' AND deleted_at IS NULL")
    suspend fun findByDomain(domain: String): List<VaultItemEntity>

    @Transaction
    suspend fun fullSync(items: List<VaultItemEntity>) {
        deleteAll()
        insertAll(items)
    }
}
