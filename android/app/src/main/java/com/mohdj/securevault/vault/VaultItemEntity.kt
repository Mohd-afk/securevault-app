package com.mohdj.securevault.vault

import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.ColumnInfo

@Entity(tableName = "vault_items")
data class VaultItemEntity(
    @PrimaryKey val id: String,
    val title: String,
    val username: String,
    
    // Warning: Despite SQLCipher, we store passwords symmetrically encrypted at the application level
    // using AES-256-GCM (via Android Keystore). SQLCipher just provides defense-in-depth against
    // offline extraction if the Keystore is bypassed.
    @ColumnInfo(name = "encrypted_password") val encryptedPassword: String,
    
    // Stored as a JSON array string `["https://example.com", "androidapp://com.example"]`
    val uris: String,
    
    val type: String,
    
    @ColumnInfo(name = "created_at") val createdAt: Long,
    @ColumnInfo(name = "updated_at") val updatedAt: Long,
    
    // If not null, this item is in the trash bin
    @ColumnInfo(name = "deleted_at") val deletedAt: Long?
)
