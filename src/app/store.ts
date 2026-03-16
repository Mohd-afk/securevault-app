import {
  deriveEncryptionKey,
  deriveAuthKey,
  encryptWithKey,
  decryptWithKey,
  exportDEK,
  importDEK,
  type EncryptedPayload,
} from './crypto';
import { getCurrentUser, finalizeMasterPasswordSetup, reauthenticateUser } from './auth';
import {
  saveVaultToCloud,
  loadVaultFromCloud,
  subscribeToVault,
  saveSettingsToCloud,
  loadSettingsFromCloud,
  deleteCloudVault,
} from './firestore';
import { idbGet, idbSet, idbDelete } from './idb';
import { createLogger } from './utils/logger';
import { registerPlugin, Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

export interface VaultBridgePlugin {
  fullSync(options: { items: any[] }): Promise<void>;
  getItems(): Promise<{ items: any[] }>;
}

export interface BiometricBridgePlugin {
  isBiometricAvailable(): Promise<{ available: boolean, reason?: string }>;
  enableBiometric(options: { dekBase64: string }): Promise<{ success: boolean }>;
  unlockWithBiometric(): Promise<{ dekBase64: string }>;
  disableBiometric(): Promise<{ success: boolean }>;
  isBiometricEnabled(): Promise<{ enabled: boolean }>;
  syncAutoLockTimeout(options: { timeoutMinutes: number }): Promise<{ success: boolean }>;
  syncAutofillBlocklist(options: { blocklist: string[] }): Promise<{ success: boolean }>;
}

const VaultBridge = registerPlugin<VaultBridgePlugin>('VaultBridge');
const BiometricBridge = registerPlugin<BiometricBridgePlugin>('BiometricBridge');

const log = createLogger('STORE');

// ── Types ────────────────────────────────────────────────────────────

export type ItemType = 'Website' | 'App' | 'Phone' | 'Door Lock' | 'Card' | 'Other';

export interface VaultItem {
  id: string;
  title: string;
  username: string;
  password: string;
  type: ItemType;
  url: string;
  note: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface AppSettings {
  autoLockTimeout: number; // minutes, 0 means never
  lockOnHide: boolean; // lock when app goes to background
  allowScreenshots: boolean; // allow screenshots (native wrapper required for enforcement)
  biometricEnabled?: boolean;
  lastBiometricUnlock?: string;
  autofillBlocklist?: string[];
}

// ── Storage keys ─────────────────────────────────────────────────────

const VAULT_KEY = 'securevault_items';
const SETTINGS_KEY = 'securevault_settings';

// ── In-memory session state ──────────────────────────────────────────

let _sessionPassword: string | null = null;
let _sessionCryptoKey: CryptoKey | null = null;
let _pendingAutoUnlockPassword: string | null = null;
let _cachedItems: VaultItem[] | null = null;
let _unsubscribeVault: (() => void) | null = null;
let _vaultChangeListeners: Array<(items: VaultItem[]) => void> = [];

// Timestamp-based sync suppression: ignore snapshots within this window of our own writes
let _lastWriteTimestamp = 0;
const SYNC_SUPPRESS_WINDOW_MS = 3000; // 3-second window to ignore echo-back

export function setSessionPassword(password: string): void {
  log.info('Session password set');
  _sessionPassword = password;
}

export function clearSession(): void {
  log.info('Clearing session (password, cache, listeners)');
  _sessionPassword = null;
  _sessionCryptoKey = null;
  _pendingAutoUnlockPassword = null;
  _cachedItems = null;
  if (_unsubscribeVault) {
    _unsubscribeVault();
    _unsubscribeVault = null;
  }
  _vaultChangeListeners = [];
}

/**
 * Clear all IndexedDB vault data.
 * Called on sign-out to prevent stale data from leaking to the next user.
 */
export async function clearLocalVaultData(): Promise<void> {
  log.info('Clearing local vault data from IndexedDB');
  await idbDelete(VAULT_KEY);
  await idbDelete(SETTINGS_KEY);
}

export function getSessionPassword(): string | null {
  return _sessionPassword;
}

export function setPendingAutoUnlockPassword(password: string): void {
  _pendingAutoUnlockPassword = password;
}

export function getAndClearPendingAutoUnlockPassword(): string | null {
  const pwd = _pendingAutoUnlockPassword;
  _pendingAutoUnlockPassword = null;
  return pwd;
}

// ── Vault change listeners (for real-time sync UI updates) ──────────

export function addVaultChangeListener(
  listener: (items: VaultItem[]) => void,
): () => void {
  _vaultChangeListeners.push(listener);
  return () => {
    _vaultChangeListeners = _vaultChangeListeners.filter((l) => l !== listener);
  };
}

function notifyVaultChangeListeners(): void {
  const items = getVaultItems();
  log.debug('Notifying vault change listeners', { listenerCount: _vaultChangeListeners.length, itemCount: items.length });
  _vaultChangeListeners.forEach((l) => l(items));
}

// ── ID generator ─────────────────────────────────────────────────────

function generateId(): string {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// ── Helper: get current user's UID and Email ─────────────────────────

function getUid(): string | null {
  return getCurrentUser()?.uid ?? null;
}

export function getUserEmail(): string {
  return getCurrentUser()?.email ?? '';
}

// ── Master Password Setup & Verification ─────────────────────────────

export async function setupInitialVault(password: string): Promise<void> {
  const email = getUserEmail();
  if (!email) throw new Error("No user email available for key derivation");
  log.info('Setting up initial empty vault', { email });

  // Save an empty vault to cloud (this initializes their cloud data)
  const key = await deriveEncryptionKey(password, email);
  const emptyPayload = await encryptWithKey('[]', key);

  await idbSet(VAULT_KEY, emptyPayload);
  log.debug('Empty vault saved to IndexedDB');

  const uid = getUid();
  if (uid) {
    try {
      await saveVaultToCloud(uid, emptyPayload, "legacy_hash_removed");
      log.info('Empty vault saved to cloud', { uid });
    } catch (e) {
      log.error('Failed to save empty vault to cloud', e);
    }
  }
}

export async function verifyMasterPassword(password: string): Promise<boolean> {
  const email = getUserEmail();
  if (!email) {
    log.warn('verifyMasterPassword: no email available');
    return false;
  }
  log.info('Verifying master password');

  const uid = getUid();
  let encryptedPayload: EncryptedPayload | null = null;

  // Try loading from cloud first
  if (uid) {
    try {
      log.debug('Loading vault from cloud for verification', { uid });
      const cloudData = await loadVaultFromCloud(uid);
      if (cloudData?.encryptedPayload) {
        encryptedPayload = cloudData.encryptedPayload;
        await idbSet(VAULT_KEY, encryptedPayload);
        log.debug('Cloud vault data loaded for verification');
      } else {
        log.debug('No cloud vault data found');
      }
    } catch (e) {
      log.error('Failed to load vault from cloud for verification', e);
    }
  }

  // Fallback to local
  if (!encryptedPayload) {
    encryptedPayload = await idbGet<EncryptedPayload>(VAULT_KEY);
    log.debug('Using local vault data for verification', { hasData: !!encryptedPayload });
  }

  if (!encryptedPayload) {
    log.warn('No vault data found anywhere — verification fails');
    return false;
  }

  try {
    if (!encryptedPayload.ciphertext || !encryptedPayload.iv) {
      log.warn('Vault payload is missing ciphertext or IV');
      return false;
    }

    // Attempt decryption
    const key = await deriveEncryptionKey(password, email);
    await decryptWithKey(encryptedPayload, key);
    log.info('Master password verified successfully (decryption succeeded)');
    return true; // Decryption succeeded!
  } catch {
    log.warn('Master password verification failed (decryption failed)');
    return false; // Decryption failed = wrong password
  }
}

export async function hasConfiguredVault(): Promise<boolean> {
  const uid = getUid();
  log.debug('Checking if vault is configured', { uid });

  if (uid) {
    try {
      const cloudData = await loadVaultFromCloud(uid);
      if (cloudData?.encryptedPayload) {
        await idbSet(VAULT_KEY, cloudData.encryptedPayload);
        log.info('Vault exists in cloud', { uid });
        return true;
      }
      log.info('No vault data in cloud — new user', { uid });
      return false; // New user, no data
    } catch (e) {
      log.error('Network error checking vault status', e);
    }
  }
  const localData = await idbGet(VAULT_KEY);
  log.debug('Vault configured (local check)', { hasLocal: !!localData });
  return !!localData;
}

// ── Encrypted vault local ops ────────────────────────────────────────

async function loadVaultFromStorage(password: string): Promise<VaultItem[]> {
  const payload = await idbGet<EncryptedPayload>(VAULT_KEY);
  if (!payload) {
    log.debug('No local vault data in IndexedDB');
    return [];
  }
  const email = getUserEmail();
  if (!email) {
    log.warn('loadVaultFromStorage: no email available');
    throw new Error('No email available for decryption');
  }

  if (!payload.ciphertext || !payload.iv) {
    log.warn('Local vault payload has no ciphertext/IV');
    return [];
  }

  // Let decryption errors propagate — wrong password MUST throw
  const key = await deriveEncryptionKey(password, email);
  const plaintext = await decryptWithKey(payload, key);
  const items = JSON.parse(plaintext) as VaultItem[];
  log.info('Loaded vault from IndexedDB', { itemCount: items.length });
  return items;
}

async function saveVaultToStorage(items: VaultItem[], password: string): Promise<void> {
  const email = getUserEmail();
  if (!email) {
    log.warn('saveVaultToStorage: no email — skipping');
    return;
  }

  const key = await deriveEncryptionKey(password, email);
  const plaintext = JSON.stringify(items);
  const payload = await encryptWithKey(plaintext, key);
  await idbSet(VAULT_KEY, payload);
  log.debug('Vault saved to IndexedDB', { itemCount: items.length });
}

// ── Native Vault Bridge Sync ─────────────────────────────────────────

// Intentionally empty block, the new implementation is at the bottom of the file

// ── Cloud-synced save ────────────────────────────────────────────────

async function saveVaultEverywhere(items: VaultItem[], password: string): Promise<void> {
  const email = getUserEmail();
  if (!email) {
    log.warn('saveVaultEverywhere: no email — skipping');
    return;
  }

  const key = _sessionCryptoKey || await deriveEncryptionKey(password, email);
  const plaintext = JSON.stringify(items);
  const payload = await encryptWithKey(plaintext, key);
  const uid = getUid(); // Get UID here for logging

  log.info('Saving vault payload everywhere', { uid, itemCount: items.length });

  // 1. Save locally
  await idbSet(VAULT_KEY, payload);
  log.debug('Vault saved to IndexedDB');

  // 2. Push transparently to native Android DB for Autofill
  await syncToNativeVault(items);

  // 3. Save to cloud
  if (uid) {
    // Mark write timestamp to suppress echo-back from realtime sync
    _lastWriteTimestamp = Date.now();
    log.debug('Setting sync suppression timestamp', { _lastWriteTimestamp });
    try {
      await saveVaultToCloud(uid, payload, "legacy_hash_removed");
      log.info('Vault saved to cloud', { uid, itemCount: items.length });
    } catch (e) {
      log.error('Failed to save vault to cloud', e);
    }
  }
}

// ── Public vault API ─────────────────────────────────────────────────

export async function unlockVault(password: string): Promise<VaultItem[]> {
  const uid = getUid();
  const email = getUserEmail();
  let items: VaultItem[] = [];
  let loadedFromCloud = false;
  let cloudNetworkError = false;

  log.info('Unlocking vault', { uid, email: email ? '***' : null });

  // Try cloud first
  if (uid && email) {
    try {
      log.debug('Attempting to load vault from cloud', { uid });
      const cloudData = await loadVaultFromCloud(uid);
      if (cloudData?.encryptedPayload) {
        // Decrypt — if password is wrong this THROWS (AES-GCM auth tag mismatch)
        const key = await deriveEncryptionKey(password, email);
        const plaintext = await decryptWithKey(cloudData.encryptedPayload, key);
        items = JSON.parse(plaintext);
        loadedFromCloud = true;
        // Update local cache with cloud data
        await idbSet(VAULT_KEY, cloudData.encryptedPayload);
        log.info('Vault loaded from cloud', { itemCount: items.length });
      } else {
        log.info('No vault data in cloud (new user)');
        // No vault exists yet — this is NOT an error, just a new user
        loadedFromCloud = true; // prevent local fallback
      }
    } catch (e) {
      // Distinguish between NETWORK errors and DECRYPTION errors
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('network') || message.includes('unavailable') || message.includes('Failed to get document')) {
        log.warn('Network error loading vault, will try local fallback', e);
        cloudNetworkError = true;
      } else {
        // Decryption failure = WRONG PASSWORD. Do NOT fall back to local.
        log.error('Vault decryption failed — wrong master password', e);
        throw new Error('WRONG_PASSWORD');
      }
    }
  }

  // Fall back to local ONLY on network errors (not decryption failures)
  if (!loadedFromCloud && cloudNetworkError) {
    log.debug('Loading vault from local storage as network fallback');
    // This will also throw if decryption fails (wrong password)
    items = await loadVaultFromStorage(password);
    log.info('Vault loaded from local storage', { itemCount: items.length });
  } else if (!loadedFromCloud && !uid) {
    // No user ID — try local (shouldn't normally happen)
    items = await loadVaultFromStorage(password);
    log.info('Vault loaded from local storage (no uid)', { itemCount: items.length });
  }

  _sessionPassword = password;
  _cachedItems = items;

  // Start real-time sync listener
  startRealtimeSync(uid, password);

  // Auto-purge expired trash items (>30 days old)
  purgeExpiredTrashItems().then((count) => {
    if (count > 0) {
      log.info(`Auto-purged ${count} expired trash item(s)`);
    }
  }).catch((e) => {
    log.error('Error during auto-purge of trash items', e);
  });

  // Reverse sync: Fetch newly saved items from native Autofill
  await checkAndMergeAutofillItems();

  // Forward sync: Push latest web items to native DB for Autofill
  await syncToNativeVault(_cachedItems || items);

  return _cachedItems || items;
}

function startRealtimeSync(uid: string | null, password: string): void {
  // Clean up previous listener
  if (_unsubscribeVault) {
    log.debug('Cleaning up previous realtime sync listener');
    _unsubscribeVault();
    _unsubscribeVault = null;
  }

  const email = getUserEmail();
  if (!uid || !email) {
    log.warn('Cannot start realtime sync: no uid or email', { uid: !!uid, email: !!email });
    return;
  }

  log.info('Starting realtime vault sync listener', { uid });

  _unsubscribeVault = subscribeToVault(uid, async (data) => {
    if (!data || (!_sessionPassword && !_sessionCryptoKey)) {
      log.debug('Sync callback: no data or no session password/key, ignoring');
      return;
    }

    // Check if this is an echo of our own write
    if (Date.now() - _lastWriteTimestamp < SYNC_SUPPRESS_WINDOW_MS) {
      log.debug('Sync callback: ignoring recent local write');
      return;
    }

    try {
      log.info('Sync callback: received remote vault update, decrypting');
      const email = getUserEmail();
      const key = _sessionCryptoKey || await deriveEncryptionKey(password, email);
      const plaintext = await decryptWithKey(data.encryptedPayload, key);
      const items: VaultItem[] = JSON.parse(plaintext);
      _cachedItems = items;
      // Update local cache
      await idbSet(VAULT_KEY, data.encryptedPayload);
      log.info('Sync callback: vault updated from remote', { itemCount: items.length });
      
      // Update Native DB
      await syncToNativeVault(items);
      
      // Notify UI
      notifyVaultChangeListeners();
    } catch (e) {
      log.error('Sync callback: failed to decrypt synced vault data', e);
    }
  });
}

export function getVaultItems(): VaultItem[] {
  return _cachedItems ?? [];
}

export function getVaultItem(id: string): VaultItem | undefined {
  return getVaultItems().find((i) => i.id === id);
}

export async function addVaultItem(
  item: Omit<VaultItem, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<VaultItem> {
  if (!_sessionPassword) throw new Error('Vault is locked');

  const items = getVaultItems();
  const now = new Date().toISOString();
  const newItem: VaultItem = {
    ...item,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };
  items.push(newItem);
  _cachedItems = [...items];
  log.info('Adding vault item', { id: newItem.id, title: newItem.title });
  await saveVaultEverywhere(items, _sessionPassword);
  return newItem;
}

export async function updateVaultItem(
  id: string,
  updates: Partial<Omit<VaultItem, 'id' | 'createdAt'>>,
): Promise<VaultItem | null> {
  if (!_sessionPassword) throw new Error('Vault is locked');

  const items = getVaultItems();
  const index = items.findIndex((i) => i.id === id);
  if (index === -1) {
    log.warn('updateVaultItem: item not found', { id });
    return null;
  }

  items[index] = {
    ...items[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  _cachedItems = [...items];
  log.info('Updated vault item', { id });
  await saveVaultEverywhere(items, _sessionPassword);
  return items[index];
}

export async function deleteVaultItem(id: string): Promise<void> {
  if (!_sessionPassword) throw new Error('Vault is locked');

  const items = getVaultItems();
  const index = items.findIndex((i) => i.id === id);
  if (index === -1) {
    log.warn('deleteVaultItem: item not found', { id });
    return;
  }

  items[index] = {
    ...items[index],
    deletedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  _cachedItems = [...items];
  log.info('Soft-deleted vault item (moved to trash)', { id });
  await saveVaultEverywhere(items, _sessionPassword);
}

export async function permanentlyDeleteVaultItem(id: string): Promise<void> {
  if (!_sessionPassword) throw new Error('Vault is locked');

  const items = getVaultItems().filter((i) => i.id !== id);
  _cachedItems = items;
  log.info('Permanently deleted vault item', { id });
  await saveVaultEverywhere(items, _sessionPassword);
}

export async function restoreVaultItem(id: string): Promise<void> {
  if (!_sessionPassword) throw new Error('Vault is locked');

  const items = getVaultItems();
  const index = items.findIndex((i) => i.id === id);
  if (index === -1) {
    log.warn('restoreVaultItem: item not found', { id });
    return;
  }

  items[index] = {
    ...items[index],
    deletedAt: undefined,
    updatedAt: new Date().toISOString(),
  };
  _cachedItems = [...items];
  log.info('Restored vault item from trash', { id });
  await saveVaultEverywhere(items, _sessionPassword);
}

// ── Bulk add (for CSV import) ────────────────────────────────────────

export async function bulkAddVaultItems(
  newItems: Omit<VaultItem, 'id' | 'createdAt' | 'updatedAt'>[],
): Promise<number> {
  if (!_sessionPassword) throw new Error('Vault is locked');

  const items = getVaultItems();
  const now = new Date().toISOString();

  const created = newItems.map((item) => ({
    ...item,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  }));

  items.push(...created);
  _cachedItems = [...items];
  log.info('Bulk-added vault items', { count: created.length });
  await saveVaultEverywhere(items, _sessionPassword);
  return created.length;
}

// ── Trash auto-purge ─────────────────────────────────────────────────

/**
 * Permanently removes items that have been in trash for more than 30 days.
 * Should be called on vault unlock.
 */
export async function purgeExpiredTrashItems(): Promise<number> {
  if (!_sessionPassword) return 0;

  const items = getVaultItems();
  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;

  const expired = items.filter(
    (i) => i.deletedAt && now - new Date(i.deletedAt).getTime() > thirtyDays,
  );

  if (expired.length === 0) return 0;

  const remaining = items.filter(
    (i) => !i.deletedAt || now - new Date(i.deletedAt).getTime() <= thirtyDays,
  );

  _cachedItems = remaining;
  log.info('Purging expired trash items', { expiredCount: expired.length, remainingCount: remaining.length });
  await saveVaultEverywhere(remaining, _sessionPassword);
  return expired.length;
}

// ── Export ────────────────────────────────────────────────────────────

/**
 * Returns a CSV string containing all active (non-deleted) vault items.
 */
export function exportVaultItemsAsCsv(): string {
  const items = getVaultItems().filter((i) => !i.deletedAt);
  log.info('Exporting vault items as CSV', { count: items.length });

  const escape = (val: string) => {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const header = 'Title,Username,Password,URL,Type,Note';
  const rows = items.map((i) =>
    [i.title, i.username, i.password, i.url, i.type, i.note].map(escape).join(','),
  );

  return [header, ...rows].join('\n');
}


// ── Settings ─────────────────────────────────────────────────────────

const defaultSettings: AppSettings = {
  autoLockTimeout: 5,
  lockOnHide: true,
  allowScreenshots: true,
  biometricEnabled: false,
  autofillBlocklist: [],
};

export async function getSettings(): Promise<AppSettings> {
  const raw = await idbGet<AppSettings>(SETTINGS_KEY);
  const result = { ...defaultSettings, ...(raw || {}) };
  try {
    if (Capacitor.getPlatform() === 'android') {
      await BiometricBridge.syncAutoLockTimeout({ timeoutMinutes: result.autoLockTimeout });
      if (result.autofillBlocklist) {
          await BiometricBridge.syncAutofillBlocklist({ blocklist: result.autofillBlocklist });
      }
    }
  } catch (e) {
    log.warn('Could not sync local timeout setting', e);
  }
  return result;
}

export async function loadSettingsWithCloud(): Promise<AppSettings> {
  const uid = getUid();
  if (uid) {
    try {
      log.debug('Loading settings from cloud', { uid });
      const cloudSettings = await loadSettingsFromCloud(uid);
      if (cloudSettings) {
        await idbSet(SETTINGS_KEY, cloudSettings);
        log.info('Settings loaded from cloud', { uid });
        return { ...defaultSettings, ...cloudSettings };
      }
    } catch (e) {
      log.error('Failed to load settings from cloud', e);
    }
  }
  return getSettings();
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  log.info('Saving settings', { settings });
  await idbSet(SETTINGS_KEY, settings);

  // Sync to native vault
  try {
     if (Capacitor.getPlatform() === 'android') {
        await BiometricBridge.syncAutoLockTimeout({ timeoutMinutes: settings.autoLockTimeout });
        if (settings.autofillBlocklist) {
            await BiometricBridge.syncAutofillBlocklist({ blocklist: settings.autofillBlocklist });
        }
     }
  } catch (e) {
     log.warn('Failed to sync settings to native', e);
  }

  // Also save to cloud
  const uid = getUid();
  if (uid) {
    saveSettingsToCloud(uid, settings).catch((e) =>
      log.error('Failed to save settings to cloud', e),
    );
  }
}

// ── Master password change ───────────────────────────────────────────

/**
 * Re-encrypts existing data with a new master password.
 * Steps:
 * 1. Derive OLD auth key and re-authenticate to satisfy Firebase's recent-auth requirement
 * 2. Derive NEW auth key and update Firebase Auth password
 * 3. Re-encrypt all vault data with the new encryption key
 * 4. Update session password
 */
export async function changeMasterPassword(
  oldPassword: string,
  newPassword: string,
): Promise<boolean> {
  const email = getUserEmail();
  if (!email) throw new Error("No user email available for key derivation");
  log.info('Starting master password change', { email });

  try {
    // 1. Re-authenticate with the OLD password to satisfy Firebase's recent-auth requirement
    log.debug('Step 1: Re-authenticating with old password');
    const oldAuthKey = await deriveAuthKey(oldPassword, email);
    await reauthenticateUser(email, oldAuthKey);
    log.info('Re-authentication with old password successful');

    // 2. Derive the new auth key and update Firebase Auth password
    log.debug('Step 2: Updating Firebase Auth password with new derived key');
    const newAuthKey = await deriveAuthKey(newPassword, email);
    await finalizeMasterPasswordSetup(email, newAuthKey);
    log.info('Firebase Auth password updated to new derived key');

    // 3. Re-encrypt vault data with the new encryption key
    log.debug('Step 3: Re-encrypting vault data with new password');
    const items = _cachedItems || [];
    await saveVaultEverywhere(items, newPassword);
    log.info('Vault data re-encrypted with new password', { itemCount: items.length });

    // 4. Update session password only after everything succeeded
    _sessionPassword = newPassword;

    // 5. Re-wrap DEK if biometric is enabled
    try {
      const settings = await getSettings();
      if (settings.biometricEnabled && Capacitor.getPlatform() === 'android') {
        const dekBase64 = await exportDEK(newPassword, email);
        await BiometricBridge.enableBiometric({ dekBase64 });
        log.info('DEK successfully re-wrapped with new master password');
      }
    } catch (bioError) {
      log.error('Failed to re-wrap DEK after password change', bioError);
      const settings = await getSettings();
      await saveSettings({ ...settings, biometricEnabled: false });
    }

    log.info('Master password change completed successfully');
    return true;
  } catch (e) {
    log.error('Master password change failed', e);
    throw e; // Re-throw so the UI can handle it
  }
}

// ── Migration: local data → cloud ────────────────────────────────────

export async function migrateLocalToCloud(): Promise<void> {
  const uid = getUid();
  if (!uid || !_sessionPassword) {
    log.warn('migrateLocalToCloud: no uid or session password');
    return;
  }

  const items = getVaultItems();
  if (items.length === 0) {
    log.debug('migrateLocalToCloud: no items to migrate');
    return;
  }

  log.info('Migrating local vault data to cloud', { uid, itemCount: items.length });
  await saveVaultEverywhere(items, _sessionPassword);

  const settings = await getSettings();
  await saveSettingsToCloud(uid, settings).catch((e) => {
    log.error('Failed to migrate settings to cloud', e);
  });
  log.info('Migration complete');
}

/**
 * Resets the entire vault for the current user.
 * Deletes all cloud data and clears all local storage.
 */
export async function resetVault(): Promise<void> {
  log.warn('Resetting vault — all data will be destroyed');
  const uid = getUid();
  if (uid) {
    try {
      await deleteCloudVault(uid);
      log.info('Cloud vault data deleted', { uid });
    } catch (e) {
      log.error('Failed to delete cloud vault', e);
      throw new Error('Failed to delete cloud data. Please check your connection.');
    }
  }

  clearSession();
  await clearLocalVaultData();
  log.info('Vault reset complete');
}

// ── Native Autofill Sync ─────────────────────────────────────────────

async function syncToNativeVault(items: VaultItem[]): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  
  try {
    const validItems = items.map(i => ({
      id: i.id,
      title: i.title || '',
      username: i.username || '',
      password: i.password || '',
      uris: JSON.stringify(i.url ? [i.url] : []),
      type: i.type || 'Other',
      note: i.note || '',
      createdAt: new Date(i.createdAt).getTime(),
      updatedAt: new Date(i.updatedAt).getTime(),
      deletedAt: i.deletedAt ? new Date(i.deletedAt).getTime() : null
    }));

    await VaultBridge.fullSync({ items: validItems });
    log.debug('Native SQLite vault sync completed', { count: validItems.length });
  } catch (e) {
    log.error('Failed to sync to Native Vault', e);
  }
}

async function checkAndMergeAutofillItems(): Promise<void> {
  if (!_sessionPassword) return;
  try {
    const nativeData = await VaultBridge.getItems();
    const nativeItems = nativeData?.items || [];
    
    const items = getVaultItems();
    const newItems = nativeItems.filter((nItem: any) => !items.find(i => i.id === nItem.id));
    
    if (newItems.length > 0) {
      log.info(`Background reverse sync: Found ${newItems.length} new items from Autofill`);
      
      const formattedItems = newItems.map((nItem: any) => ({
        id: nItem.id,
        title: nItem.title || 'Unknown',
        username: nItem.username || '',
        password: nItem.password || '',
        url: nItem.url || '',
        type: (nItem.type as ItemType) || 'Website',
        note: nItem.note || '',
        createdAt: nItem.createdAt || new Date().toISOString(),
        updatedAt: nItem.updatedAt || new Date().toISOString(),
      }));
      
      const mergedItems = [...items, ...formattedItems];
      _cachedItems = mergedItems;
      await saveVaultEverywhere(mergedItems, _sessionPassword);
    }
  } catch (e) {
    log.debug('Background reverse sync check failed', e);
  }
}

// Ensure the App listener is only added once
try {
  App.addListener('appStateChange', async ({ isActive }) => {
    if (isActive && _sessionPassword) {
      await checkAndMergeAutofillItems();
    }
  });
} catch (e) {
  log.warn('Could not register app state listener (maybe web env)', e);
}

// ── Biometric Unlock Ops ─────────────────────────────────────────────

export async function enableBiometricUnlock(password: string): Promise<boolean> {
  const email = getUserEmail();
  if (!email) throw new Error('No email available');
  
  if (Capacitor.getPlatform() !== 'android') {
    throw new Error('Biometrics only available on Android');
  }

  // Verify password first
  const isVerified = await verifyMasterPassword(password);
  if (!isVerified) throw new Error('Incorrect Master Password');

  const dekBase64 = await exportDEK(password, email);
  await BiometricBridge.enableBiometric({ dekBase64 });

  const settings = await getSettings();
  await saveSettings({ ...settings, biometricEnabled: true });
  log.info('Biometric unlock enabled');
  return true;
}

export async function checkBiometricAvailability(): Promise<{ available: boolean, reason?: string }> {
  if (Capacitor.getPlatform() !== 'android') return { available: false, reason: 'Platform not supported' };
  return BiometricBridge.isBiometricAvailable();
}

export async function unlockWithBiometric(): Promise<boolean> {
  try {
    const email = getUserEmail();
    if (!email) throw new Error('No email available');

    const { dekBase64 } = await BiometricBridge.unlockWithBiometric();
    const key = await importDEK(dekBase64);
    _sessionCryptoKey = key; // Preserve in memory for bg sync/saves
    
    const payload = await idbGet<EncryptedPayload>(VAULT_KEY);
    if (!payload?.ciphertext || !payload?.iv) {
      throw new Error('No local vault data found');
    }

    const plaintext = await decryptWithKey(payload, key);
    const items = JSON.parse(plaintext) as VaultItem[];
    
    _cachedItems = items;
    
    const settings = await getSettings();
    await saveSettings({
        ...settings,
        lastBiometricUnlock: new Date().toISOString()
    });
    
    log.info('Vault unlocked via biometrics', { itemCount: items.length });
    
    const uid = getUid();
    if (uid) {
      startRealtimeSync(uid, '');
    }
    
    return true;
  } catch (e) {
    log.error('Biometric unlock failed', e);
    throw e;
  }
}

export async function disableBiometricUnlock(): Promise<void> {
  if (Capacitor.getPlatform() === 'android') {
    await BiometricBridge.disableBiometric();
  }
  const settings = await getSettings();
  await saveSettings({ ...settings, biometricEnabled: false });
  log.info('Biometric unlock disabled');
}
