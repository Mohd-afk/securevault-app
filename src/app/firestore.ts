import {
    doc,
    setDoc,
    getDoc,
    onSnapshot,
    serverTimestamp,
    deleteDoc,
    writeBatch,
    type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import type { EncryptedPayload } from './crypto';
import type { AppSettings } from './store';
import { createLogger } from './utils/logger';

const log = createLogger('FIRESTORE');

// ── Firestore paths ──────────────────────────────────────────────────

function vaultDocRef(uid: string) {
    return doc(db, 'users', uid, 'data', 'vault');
}

function settingsDocRef(uid: string) {
    return doc(db, 'users', uid, 'data', 'settings');
}

function profileDocRef(uid: string) {
    return doc(db, 'users', uid, 'data', 'profile');
}

function usernameDocRef(username: string) {
    return doc(db, 'usernames', username);
}

function registeredEmailDocRef(hash: string) {
    return doc(db, 'registered_emails', hash);
}

// ── Email registration (Option 3 for Enumeration Protection) ────────

export async function hashEmailForLookup(email: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(email.trim().toLowerCase());
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function checkEmailRegistered(email: string): Promise<boolean> {
    log.info('Checking if email is registered', { email });
    const hash = await hashEmailForLookup(email);
    const snap = await getDoc(registeredEmailDocRef(hash));
    const exists = snap.exists();
    log.info('Email registration check result', { email, isRegistered: exists });
    return exists;
}

export async function registerEmail(email: string): Promise<void> {
    log.info('Registering email hash', { email });
    const hash = await hashEmailForLookup(email);
    await setDoc(registeredEmailDocRef(hash), { registeredAt: serverTimestamp() });
    log.info('Email hash registered successfully', { email });
}

// ── Vault operations ─────────────────────────────────────────────────

export interface CloudVaultData {
    encryptedPayload: string; // JSON-stringified EncryptedPayload
    masterHash: string;       // JSON-stringified StoredMasterHash
    updatedAt: unknown;       // Firestore server timestamp
}

export async function saveVaultToCloud(
    uid: string,
    encryptedPayload: EncryptedPayload,
    masterHash: string,
): Promise<void> {
    log.info('Saving vault to cloud', { uid });
    await setDoc(vaultDocRef(uid), {
        encryptedPayload: JSON.stringify(encryptedPayload),
        masterHash,
        updatedAt: serverTimestamp(),
    });
    log.info('Vault saved to cloud successfully', { uid });
}

export async function loadVaultFromCloud(
    uid: string,
): Promise<{ encryptedPayload: EncryptedPayload; masterHash: string } | null> {
    log.info('Loading vault from cloud', { uid });
    const snap = await getDoc(vaultDocRef(uid));
    if (!snap.exists()) {
        log.info('No vault document found in cloud', { uid });
        return null;
    }

    const data = snap.data() as CloudVaultData;
    log.info('Vault loaded from cloud', { uid, hasPayload: !!data.encryptedPayload });
    return {
        encryptedPayload: JSON.parse(data.encryptedPayload) as EncryptedPayload,
        masterHash: data.masterHash,
    };
}

/**
 * Subscribe to real-time vault changes from Firestore.
 * The callback receives the encrypted payload and master hash whenever
 * another device pushes an update.
 */
export function subscribeToVault(
    uid: string,
    callback: (data: {
        encryptedPayload: EncryptedPayload;
        masterHash: string;
    } | null) => void,
): Unsubscribe {
    log.info('Subscribing to realtime vault updates', { uid });
    return onSnapshot(vaultDocRef(uid), (snap) => {
        if (!snap.exists()) {
            log.debug('Vault snapshot: document does not exist');
            callback(null);
            return;
        }
        const data = snap.data() as CloudVaultData;
        try {
            log.debug('Vault snapshot: received update', { uid, source: snap.metadata.fromCache ? 'cache' : 'server' });
            callback({
                encryptedPayload: JSON.parse(data.encryptedPayload) as EncryptedPayload,
                masterHash: data.masterHash,
            });
        } catch (e) {
            log.error('Vault snapshot: failed to parse data', e);
            callback(null);
        }
    });
}

// ── Settings operations ──────────────────────────────────────────────

export async function saveSettingsToCloud(
    uid: string,
    settings: AppSettings,
): Promise<void> {
    log.info('Saving settings to cloud', { uid });
    await setDoc(settingsDocRef(uid), {
        ...settings,
        updatedAt: serverTimestamp(),
    });
    log.debug('Settings saved to cloud', { uid });
}

export async function loadSettingsFromCloud(
    uid: string,
): Promise<AppSettings | null> {
    log.debug('Loading settings from cloud', { uid });
    const snap = await getDoc(settingsDocRef(uid));
    if (!snap.exists()) {
        log.debug('No settings document found in cloud', { uid });
        return null;
    }

    const data = snap.data();
    log.info('Settings loaded from cloud', { uid });
    return {
        autoLockTimeout: data.autoLockTimeout ?? 5,
        lockOnHide: data.lockOnHide ?? true,
        allowScreenshots: data.allowScreenshots ?? true,
    };
}

/**
 * Delete all vault data and master hash from Firestore for a user.
 * Used for "Reset Vault" functionality.
 */
export async function deleteCloudVault(uid: string): Promise<void> {
    log.warn('Deleting cloud vault data', { uid });
    // Delete vault and settings subdocuments (NOT the parent user doc)
    const batch = writeBatch(db);
    batch.delete(vaultDocRef(uid));
    batch.delete(settingsDocRef(uid));
    await batch.commit();
    log.info('Cloud vault data deleted successfully', { uid });
}

// ── Username operations ──────────────────────────────────────────────

/**
 * Check if a username is available.
 */
export async function checkUsernameAvailable(username: string): Promise<boolean> {
    log.debug('Checking username availability', { username });
    const snap = await getDoc(usernameDocRef(username));
    const available = !snap.exists();
    log.debug('Username availability result', { username, available });
    return available;
}

/**
 * Claim a username for a user. Writes to both `usernames/{username}` and `users/{uid}/data/profile`.
 */
export async function claimUsername(uid: string, username: string): Promise<void> {
    log.info('Claiming username', { uid, username });
    const batch = writeBatch(db);
    batch.set(usernameDocRef(username), { uid, createdAt: serverTimestamp() });
    batch.set(profileDocRef(uid), { username, updatedAt: serverTimestamp() });
    await batch.commit();
    log.info('Username claimed successfully', { uid, username });
}

/**
 * Get the username for a user by UID.
 */
export async function getUsernameForUid(uid: string): Promise<string | null> {
    log.debug('Getting username for UID', { uid });
    const snap = await getDoc(profileDocRef(uid));
    if (!snap.exists()) {
        log.debug('No profile document found for UID', { uid });
        return null;
    }
    const username = snap.data().username ?? null;
    log.debug('Username found', { uid, username });
    return username;
}

/**
 * Change a user's username. Deletes old entry, creates new one atomically.
 */
export async function changeUsername(uid: string, oldUsername: string, newUsername: string): Promise<void> {
    log.info('Changing username', { uid, oldUsername, newUsername });
    const batch = writeBatch(db);
    batch.delete(usernameDocRef(oldUsername));
    batch.set(usernameDocRef(newUsername), { uid, createdAt: serverTimestamp() });
    batch.set(profileDocRef(uid), { username: newUsername, updatedAt: serverTimestamp() });
    await batch.commit();
    log.info('Username changed successfully', { uid, oldUsername, newUsername });
}
