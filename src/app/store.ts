import {
  encrypt,
  decrypt,
  hashPasswordForVerification,
  generateSalt,
  type EncryptedPayload,
} from './crypto';
import { getCurrentUser } from './auth';
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
const MASTER_KEY = 'securevault_master_hash';
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
  localStorage.removeItem(MASTER_KEY);
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

// ── Helper: get current user's UID ───────────────────────────────────

function getUid(): string | null {
  return getCurrentUser()?.uid ?? null;
}

// ── Master password (PBKDF2) ─────────────────────────────────────────

interface StoredMasterHash {
  hash: string;
  salt: string; // base64
}

export async function setupMasterPassword(password: string): Promise<void> {
  const salt = generateSalt();
  const hash = await hashPasswordForVerification(password, salt);
  const saltBase64 = btoa(String.fromCharCode(...salt));

  const stored: StoredMasterHash = { hash, salt: saltBase64 };
  const storedJson = JSON.stringify(stored);
  localStorage.setItem(MASTER_KEY, storedJson);

  // Also save to cloud
  const uid = getUid();
  if (uid) {
    try {
      // Save an empty vault to cloud with the master hash
      const emptyPayload = await encrypt('[]', password);
      await saveVaultToCloud(uid, emptyPayload, storedJson);
    } catch (e) {
      console.error('Failed to save master hash to cloud:', e);
    }
  }
}

export async function verifyMasterPassword(password: string): Promise<boolean> {
  // Try loading from cloud first, then fall back to local
  const uid = getUid();
  let storedJson: string | null = null;

  if (uid) {
    try {
      const cloudData = await loadVaultFromCloud(uid);
      if (cloudData?.masterHash) {
        storedJson = cloudData.masterHash;
        // Also update local cache
        localStorage.setItem(MASTER_KEY, storedJson);
      }
    } catch (e) {
      console.error('Failed to load master hash from cloud:', e);
    }
  }

  // Only fall back to localStorage if there's NO authenticated user
  // (prevents stale data from a different user being used)
  if (!storedJson && !uid) {
    storedJson = localStorage.getItem(MASTER_KEY);
  }

  if (!storedJson) return false;

  try {
    const stored: StoredMasterHash = JSON.parse(storedJson);
    const saltBytes = new Uint8Array(
      atob(stored.salt)
        .split('')
        .map((c) => c.charCodeAt(0)),
    );
    const hash = await hashPasswordForVerification(password, saltBytes);
    return hash === stored.hash;
  } catch {
    return false;
  }
}

export function hasMasterPassword(): boolean {
  return !!localStorage.getItem(MASTER_KEY);
}

export async function hasMasterPasswordAsync(): Promise<boolean> {
  // Check cloud first
  const uid = getUid();
  if (uid) {
    try {
      const cloudData = await loadVaultFromCloud(uid);
      if (cloudData?.masterHash) {
        localStorage.setItem(MASTER_KEY, cloudData.masterHash);
        return true;
      }
      // Cloud user has no data → this is a NEW user.
      // Don't fall back to localStorage (it may have stale data from another user).
      return false;
    } catch {
      // Network error — fall through to local check as backup
    }
  }
  return !!localStorage.getItem(MASTER_KEY);
}

// ── Encrypted vault local ops ────────────────────────────────────────

async function loadVaultFromStorage(password: string): Promise<VaultItem[]> {
  const raw = localStorage.getItem(VAULT_KEY);
  if (!raw) return [];

  try {
    const payload: EncryptedPayload = JSON.parse(raw);
    if (payload.ciphertext && payload.salt && payload.iv) {
      const plaintext = await decrypt(payload, password);
      return JSON.parse(plaintext);
    }
    // Fallback: legacy unencrypted data
    const legacyItems = JSON.parse(raw);
    if (Array.isArray(legacyItems)) {
      await saveVaultToStorage(legacyItems, password);
      return legacyItems;
    }
    return [];
  } catch {
    return [];
  }
}

async function saveVaultToStorage(items: VaultItem[], password: string): Promise<void> {
  const plaintext = JSON.stringify(items);
  const payload = await encrypt(plaintext, password);
  localStorage.setItem(VAULT_KEY, JSON.stringify(payload));
}

// ── Cloud-synced save ────────────────────────────────────────────────

async function saveVaultEverywhere(items: VaultItem[], password: string): Promise<void> {
  const plaintext = JSON.stringify(items);
  const payload = await encrypt(plaintext, password);

  // Save locally
  localStorage.setItem(VAULT_KEY, JSON.stringify(payload));

  // Save to cloud
  const uid = getUid();
  if (uid) {
    const masterHash = localStorage.getItem(MASTER_KEY) ?? '';
    _suppressNextSync = true;
    try {
      await saveVaultToCloud(uid, payload, masterHash);
    } catch (e) {
      console.error('Failed to save vault to cloud:', e);
    }
  }
}

// ── Public vault API ─────────────────────────────────────────────────

export async function unlockVault(password: string): Promise<VaultItem[]> {
  const uid = getUid();
  let items: VaultItem[] = [];

  // Try cloud first
  if (uid) {
    try {
      const cloudData = await loadVaultFromCloud(uid);
      if (cloudData?.encryptedPayload) {
        const plaintext = await decrypt(cloudData.encryptedPayload, password);
        items = JSON.parse(plaintext);
        // Update local cache
        localStorage.setItem(VAULT_KEY, JSON.stringify(cloudData.encryptedPayload));
        localStorage.setItem(MASTER_KEY, cloudData.masterHash);
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

  if (!uid) return;

  _unsubscribeVault = subscribeToVault(uid, async (data) => {
    if (!data || !_sessionPassword) return;

    // If we just wrote this ourselves, skip
    if (_suppressNextSync) {
      _suppressNextSync = false;
      return;
    }

    try {
      const plaintext = await decrypt(data.encryptedPayload, password);
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

// ── Sample data ──────────────────────────────────────────────────────

export async function seedSampleData(password: string): Promise<void> {
  const samples: Omit<VaultItem, 'id' | 'createdAt' | 'updatedAt'>[] = [
    { title: 'Google', username: 'john.doe@gmail.com', password: 'Str0ng!Pass#2024', type: 'Website', url: 'https://accounts.google.com', note: 'Personal Google account' },
    { title: 'GitHub', username: 'johndoe', password: 'gh_s3cur3_t0k3n!', type: 'Website', url: 'https://github.com', note: 'Developer account' },
    { title: 'Netflix', username: 'john.doe@gmail.com', password: 'N3tfl1x_F@m1ly', type: 'App', url: 'https://netflix.com', note: 'Family plan' },
    { title: 'Home WiFi', username: 'admin', password: 'WiFi_R0ut3r_2024!', type: 'Other', url: 'http://192.168.0.1', note: 'Router admin panel - TP-Link Archer' },
    { title: 'Front Door Lock', username: '', password: '4829', type: 'Door Lock', url: '', note: 'Main entrance keypad code' },
    { title: 'Phone PIN', username: '', password: '847291', type: 'Phone', url: '', note: 'Samsung Galaxy S24 lock screen' },
    { title: 'Bank Card', username: '', password: '7734', type: 'Card', url: '', note: 'Visa debit card ending 4521' },
    { title: 'Amazon', username: 'john.doe@gmail.com', password: 'Amz_Sh0pp1ng!99', type: 'Website', url: 'https://amazon.com', note: 'Prime membership active' },
  ];

  const now = new Date().toISOString();
  const items: VaultItem[] = samples.map((s) => ({
    ...s,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  }));

  _sessionPassword = password;
  _cachedItems = items;
  await saveVaultEverywhere(items, password);
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

export async function changeMasterPassword(
  currentPassword: string,
  newPassword: string,
): Promise<boolean> {
  const isValid = await verifyMasterPassword(currentPassword);
  if (!isValid) return false;

  // Re-encrypt vault with new password
  const items = _cachedItems ?? await loadVaultFromStorage(currentPassword);
  await setupMasterPassword(newPassword);
  await saveVaultEverywhere(items, newPassword);

  // Update session
  _sessionPassword = newPassword;
  _cachedItems = items;
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

