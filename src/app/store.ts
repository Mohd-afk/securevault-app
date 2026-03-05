import {
  encrypt,
  decrypt,
  hashPasswordForVerification,
  generateSalt,
  type EncryptedPayload,
} from './crypto';

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
// The master password is held in memory ONLY while the vault is unlocked.
// It's never persisted; cleared on lock.

let _sessionPassword: string | null = null;
let _cachedItems: VaultItem[] | null = null;

export function setSessionPassword(password: string): void {
  _sessionPassword = password;
}

export function clearSession(): void {
  _sessionPassword = null;
  _cachedItems = null;
}

export function getSessionPassword(): string | null {
  return _sessionPassword;
}

// ── ID generator ─────────────────────────────────────────────────────

function generateId(): string {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2) + Date.now().toString(36);
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
  localStorage.setItem(MASTER_KEY, JSON.stringify(stored));
}

export async function verifyMasterPassword(password: string): Promise<boolean> {
  const raw = localStorage.getItem(MASTER_KEY);
  if (!raw) return false;

  try {
    const stored: StoredMasterHash = JSON.parse(raw);
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

// ── Encrypted vault CRUD ─────────────────────────────────────────────

async function loadVaultFromStorage(password: string): Promise<VaultItem[]> {
  const raw = localStorage.getItem(VAULT_KEY);
  if (!raw) return [];

  try {
    const payload: EncryptedPayload = JSON.parse(raw);
    // Verify it's actually an encrypted payload (has all required fields)
    if (payload.ciphertext && payload.salt && payload.iv) {
      const plaintext = await decrypt(payload, password);
      return JSON.parse(plaintext);
    }
    // Fallback: might be legacy unencrypted data — parse directly and re-encrypt
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

// ── Public vault API ─────────────────────────────────────────────────

export async function unlockVault(password: string): Promise<VaultItem[]> {
  const items = await loadVaultFromStorage(password);
  _sessionPassword = password;
  _cachedItems = items;
  return items;
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
  await saveVaultToStorage(items, _sessionPassword);
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
  await saveVaultToStorage(items, _sessionPassword);
  return items[index];
}

export async function deleteVaultItem(id: string): Promise<void> {
  if (!_sessionPassword) throw new Error('Vault is locked');

  const items = getVaultItems().filter((i) => i.id !== id);
  _cachedItems = items;
  await saveVaultToStorage(items, _sessionPassword);
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
  await saveVaultToStorage(items, password);
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

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// ── Master password change ───────────────────────────────────────────

export async function changeMasterPassword(
  currentPassword: string,
  newPassword: string,
): Promise<boolean> {
  // Verify current password
  const isValid = await verifyMasterPassword(currentPassword);
  if (!isValid) return false;

  // Re-encrypt vault with new password
  const items = await loadVaultFromStorage(currentPassword);
  await setupMasterPassword(newPassword);
  await saveVaultToStorage(items, newPassword);

  // Update session
  _sessionPassword = newPassword;
  _cachedItems = items;
  return true;
}
