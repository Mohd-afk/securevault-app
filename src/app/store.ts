import {
  deriveEncryptionKey,
  deriveAuthKey,
  encryptWithKey,
  decryptWithKey,
  type EncryptedPayload,
} from './crypto';
import { getCurrentUser, finalizeMasterPasswordSetup } from './auth';
import {
  saveVaultToCloud,
  loadVaultFromCloud,
  subscribeToVault,
  saveSettingsToCloud,
  loadSettingsFromCloud,
  deleteCloudVault,
} from './firestore';

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
}

export interface AppSettings {
  autoLockTimeout: number; // minutes (0 = never)
  lockOnHide: boolean;     // lock when tab is hidden
}

// ── Storage keys ─────────────────────────────────────────────────────

const VAULT_KEY = 'securevault_items';
const SETTINGS_KEY = 'securevault_settings';

// ── In-memory session state ──────────────────────────────────────────

let _sessionPassword: string | null = null;
let _cachedItems: VaultItem[] | null = null;
let _unsubscribeVault: (() => void) | null = null;
let _vaultChangeListeners: Array<(items: VaultItem[]) => void> = [];

// Flag to suppress real-time echo of our own writes
let _suppressNextSync = false;

export function setSessionPassword(password: string): void {
  _sessionPassword = password;
}

export function clearSession(): void {
  _sessionPassword = null;
  _cachedItems = null;
  if (_unsubscribeVault) {
    _unsubscribeVault();
    _unsubscribeVault = null;
  }
  _vaultChangeListeners = [];
}

/**
 * Clear all localStorage vault data.
 * Called on sign-out to prevent stale data from leaking to the next user.
 */
export function clearLocalVaultData(): void {
  localStorage.removeItem(VAULT_KEY);
  localStorage.removeItem(SETTINGS_KEY);
}

export function getSessionPassword(): string | null {
  return _sessionPassword;
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

  // Save an empty vault to cloud (this initializes their cloud data)
  const key = await deriveEncryptionKey(password, email);
  const emptyPayload = await encryptWithKey('[]', key);

  localStorage.setItem(VAULT_KEY, JSON.stringify(emptyPayload));

  const uid = getUid();
  if (uid) {
    try {
      await saveVaultToCloud(uid, emptyPayload, "legacy_hash_removed");
    } catch (e) {
      console.error('Failed to save empty vault to cloud:', e);
    }
  }
}

export async function verifyMasterPassword(password: string): Promise<boolean> {
  const email = getUserEmail();
  if (!email) return false;

  const uid = getUid();
  let encryptedDataRaw: string | null = null;

  // Try loading from cloud first
  if (uid) {
    try {
      const cloudData = await loadVaultFromCloud(uid);
      if (cloudData?.encryptedPayload) {
        encryptedDataRaw = JSON.stringify(cloudData.encryptedPayload);
        localStorage.setItem(VAULT_KEY, encryptedDataRaw);
      }
    } catch (e) {
      console.error('Failed to load vault from cloud:', e);
    }
  }

  // Fallback to local
  if (!encryptedDataRaw) {
    encryptedDataRaw = localStorage.getItem(VAULT_KEY);
  }

  if (!encryptedDataRaw) return false;

  try {
    const payload: EncryptedPayload = JSON.parse(encryptedDataRaw);
    if (!payload.ciphertext || !payload.iv) return false;

    // Attempt decryption
    const key = await deriveEncryptionKey(password, email);
    await decryptWithKey(payload, key);
    return true; // Decryption succeeded!
  } catch {
    return false; // Decryption failed = wrong password
  }
}

export async function hasConfiguredVault(): Promise<boolean> {
  const uid = getUid();
  if (uid) {
    try {
      const cloudData = await loadVaultFromCloud(uid);
      if (cloudData?.encryptedPayload) {
        localStorage.setItem(VAULT_KEY, JSON.stringify(cloudData.encryptedPayload));
        return true;
      }
      return false; // New user, no data
    } catch {
      // Ignore network errors
      console.error("Network error checking vault status");
    }
  }
  return !!localStorage.getItem(VAULT_KEY);
}

// ── Encrypted vault local ops ────────────────────────────────────────

async function loadVaultFromStorage(password: string): Promise<VaultItem[]> {
  const raw = localStorage.getItem(VAULT_KEY);
  if (!raw) return [];
  const email = getUserEmail();
  if (!email) return [];

  try {
    const payload: EncryptedPayload = JSON.parse(raw);
    if (payload.ciphertext && payload.iv) {
      const key = await deriveEncryptionKey(password, email);
      const plaintext = await decryptWithKey(payload, key);
      return JSON.parse(plaintext);
    }
    return [];
  } catch {
    return [];
  }
}

async function saveVaultToStorage(items: VaultItem[], password: string): Promise<void> {
  const email = getUserEmail();
  if (!email) return;

  const key = await deriveEncryptionKey(password, email);
  const plaintext = JSON.stringify(items);
  const payload = await encryptWithKey(plaintext, key);
  localStorage.setItem(VAULT_KEY, JSON.stringify(payload));
}

// ── Cloud-synced save ────────────────────────────────────────────────

async function saveVaultEverywhere(items: VaultItem[], password: string): Promise<void> {
  const email = getUserEmail();
  if (!email) return;

  const key = await deriveEncryptionKey(password, email);
  const plaintext = JSON.stringify(items);
  const payload = await encryptWithKey(plaintext, key);

  // Save locally
  localStorage.setItem(VAULT_KEY, JSON.stringify(payload));

  // Save to cloud
  const uid = getUid();
  if (uid) {
    _suppressNextSync = true;
    try {
      await saveVaultToCloud(uid, payload, "legacy_hash_removed");
    } catch (e) {
      console.error('Failed to save vault to cloud:', e);
    }
  }
}

// ── Public vault API ─────────────────────────────────────────────────

export async function unlockVault(password: string): Promise<VaultItem[]> {
  const uid = getUid();
  const email = getUserEmail();
  let items: VaultItem[] = [];

  // Try cloud first
  if (uid && email) {
    try {
      const cloudData = await loadVaultFromCloud(uid);
      if (cloudData?.encryptedPayload) {
        const key = await deriveEncryptionKey(password, email);
        const plaintext = await decryptWithKey(cloudData.encryptedPayload, key);
        items = JSON.parse(plaintext);
        // Update local cache
        localStorage.setItem(VAULT_KEY, JSON.stringify(cloudData.encryptedPayload));
      }
    } catch (e) {
      console.error('Failed to load vault from cloud, falling back to local:', e);
    }
  }

  // Fall back to local
  if (items.length === 0) {
    items = await loadVaultFromStorage(password);
  }

  _sessionPassword = password;
  _cachedItems = items;

  // Start real-time sync listener
  startRealtimeSync(uid, password);

  return items;
}

function startRealtimeSync(uid: string | null, password: string): void {
  // Clean up previous listener
  if (_unsubscribeVault) {
    _unsubscribeVault();
    _unsubscribeVault = null;
  }

  const email = getUserEmail();
  if (!uid || !email) return;

  _unsubscribeVault = subscribeToVault(uid, async (data) => {
    if (!data || !_sessionPassword) return;

    // If we just wrote this ourselves, skip
    if (_suppressNextSync) {
      _suppressNextSync = false;
      return;
    }

    try {
      const key = await deriveEncryptionKey(password, email);
      const plaintext = await decryptWithKey(data.encryptedPayload, key);
      const items: VaultItem[] = JSON.parse(plaintext);
      _cachedItems = items;
      // Update local cache
      localStorage.setItem(VAULT_KEY, JSON.stringify(data.encryptedPayload));
      // Notify UI
      notifyVaultChangeListeners();
    } catch (e) {
      console.error('Failed to decrypt synced vault data:', e);
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
  if (index === -1) return null;

  items[index] = {
    ...items[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  _cachedItems = [...items];
  await saveVaultEverywhere(items, _sessionPassword);
  return items[index];
}

export async function deleteVaultItem(id: string): Promise<void> {
  if (!_sessionPassword) throw new Error('Vault is locked');

  const items = getVaultItems().filter((i) => i.id !== id);
  _cachedItems = items;
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
  await saveVaultEverywhere(items, _sessionPassword);
  return created.length;
}


// ── Settings ─────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: AppSettings = {
  autoLockTimeout: 5,
  lockOnHide: true,
};

export function getSettings(): AppSettings {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function loadSettingsWithCloud(): Promise<AppSettings> {
  const uid = getUid();
  if (uid) {
    try {
      const cloudSettings = await loadSettingsFromCloud(uid);
      if (cloudSettings) {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(cloudSettings));
        return { ...DEFAULT_SETTINGS, ...cloudSettings };
      }
    } catch {
      // Fall through to local
    }
  }
  return getSettings();
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));

  // Also save to cloud
  const uid = getUid();
  if (uid) {
    saveSettingsToCloud(uid, settings).catch((e) =>
      console.error('Failed to save settings to cloud:', e),
    );
  }
}

// ── Master password change ───────────────────────────────────────────

// Re-encrypts existing data with a new master password, usually done after reset or manual change
export async function changeMasterPassword(
  newPassword: string,
): Promise<boolean> {
  const email = getUserEmail();
  if (!email) throw new Error("No user email available for key derivation");

  // 1. Derive the new auth key and update Firebase Auth password
  const newAuthKey = await deriveAuthKey(newPassword, email);
  await finalizeMasterPasswordSetup(newAuthKey);

  // 2. Re-encrypt vault data with the new encryption key
  const items = _cachedItems || [];
  await saveVaultEverywhere(items, newPassword);

  _sessionPassword = newPassword;
  return true;
}

// ── Migration: local data → cloud ────────────────────────────────────

export async function migrateLocalToCloud(): Promise<void> {
  const uid = getUid();
  if (!uid || !_sessionPassword) return;

  const items = getVaultItems();
  if (items.length === 0) return;

  await saveVaultEverywhere(items, _sessionPassword);

  const settings = getSettings();
  await saveSettingsToCloud(uid, settings).catch(() => { });
}

/**
 * Resets the entire vault for the current user.
 * Deletes all cloud data and clears all local storage.
 */
export async function resetVault(): Promise<void> {
  const uid = getUid();
  if (uid) {
    try {
      await deleteCloudVault(uid);
    } catch (e) {
      console.error('Failed to delete cloud vault:', e);
      throw new Error('Failed to delete cloud data. Please check your connection.');
    }
  }

  clearSession();
  clearLocalVaultData();
}
