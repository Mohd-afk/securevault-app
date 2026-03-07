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
    await setDoc(vaultDocRef(uid), {
        encryptedPayload: JSON.stringify(encryptedPayload),
        masterHash,
        updatedAt: serverTimestamp(),
    });
}

export async function loadVaultFromCloud(
    uid: string,
): Promise<{ encryptedPayload: EncryptedPayload; masterHash: string } | null> {
    const snap = await getDoc(vaultDocRef(uid));
    if (!snap.exists()) return null;

    const data = snap.data() as CloudVaultData;
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
    return onSnapshot(vaultDocRef(uid), (snap) => {
        if (!snap.exists()) {
            callback(null);
            return;
        }
        const data = snap.data() as CloudVaultData;
        try {
            callback({
                encryptedPayload: JSON.parse(data.encryptedPayload) as EncryptedPayload,
                masterHash: data.masterHash,
            });
        } catch {
            callback(null);
        }
    });
}

// ── Settings operations ──────────────────────────────────────────────

export async function saveSettingsToCloud(
    uid: string,
    settings: AppSettings,
): Promise<void> {
    await setDoc(settingsDocRef(uid), {
        ...settings,
        updatedAt: serverTimestamp(),
    });
}

export async function loadSettingsFromCloud(
    uid: string,
): Promise<AppSettings | null> {
    const snap = await getDoc(settingsDocRef(uid));
    if (!snap.exists()) return null;

    const data = snap.data();
    return {
        autoLockTimeout: data.autoLockTimeout ?? 5,
        lockOnHide: data.lockOnHide ?? true,
    };
}

/**
 * Delete all vault data and master hash from Firestore for a user.
 * Used for "Reset Vault" functionality.
 */
export async function deleteCloudVault(uid: string): Promise<void> {
    // Delete vault and settings subdocuments (NOT the parent user doc)
    const batch = writeBatch(db);
    batch.delete(vaultDocRef(uid));
    batch.delete(settingsDocRef(uid));
    await batch.commit();
}

// ── Username operations ──────────────────────────────────────────────

/**
 * Check if a username is available.
 */
export async function checkUsernameAvailable(username: string): Promise<boolean> {
    const snap = await getDoc(usernameDocRef(username));
    return !snap.exists();
}

/**
 * Claim a username for a user. Writes to both `usernames/{username}` and `users/{uid}/data/profile`.
 */
export async function claimUsername(uid: string, username: string): Promise<void> {
    const batch = writeBatch(db);
    batch.set(usernameDocRef(username), { uid, createdAt: serverTimestamp() });
    batch.set(profileDocRef(uid), { username, updatedAt: serverTimestamp() });
    await batch.commit();
}

/**
 * Get the username for a user by UID.
 */
export async function getUsernameForUid(uid: string): Promise<string | null> {
    const snap = await getDoc(profileDocRef(uid));
    if (!snap.exists()) return null;
    return snap.data().username ?? null;
}

/**
 * Change a user's username. Deletes old entry, creates new one atomically.
 */
export async function changeUsername(uid: string, oldUsername: string, newUsername: string): Promise<void> {
    const batch = writeBatch(db);
    batch.delete(usernameDocRef(oldUsername));
    batch.set(usernameDocRef(newUsername), { uid, createdAt: serverTimestamp() });
    batch.set(profileDocRef(uid), { username: newUsername, updatedAt: serverTimestamp() });
    await batch.commit();
}

