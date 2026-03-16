package com.mohdj.securevault.vault

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import net.sqlcipher.database.SQLiteDatabase
import net.sqlcipher.database.SupportFactory

@Database(entities = [VaultItemEntity::class], version = 1, exportSchema = false)
abstract class NativeVaultDatabase : RoomDatabase() {
    abstract fun vaultDao(): VaultDao

    companion object {
        @Volatile
        private var INSTANCE: NativeVaultDatabase? = null

        fun getDatabase(context: Context, passphrase: ByteArray): NativeVaultDatabase {
            return INSTANCE ?: synchronized(this) {
                // Initialize SQLCipher engine
                SQLiteDatabase.loadLibs(context)
                
                val supportFactory = SupportFactory(passphrase)
                
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    NativeVaultDatabase::class.java,
                    "native_secure_vault.db"
                )
                .openHelperFactory(supportFactory)
                .fallbackToDestructiveMigration()
                .build()
                
                INSTANCE = instance
                instance
            }
        }
    }
}
