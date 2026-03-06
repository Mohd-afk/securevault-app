// ─── SecureVault Firestore Sync Module ───────────────────────────────
// Handles reading/writing encrypted vault data and settings to Firestore.
// All vault data is encrypted client-side before storage.
// ─────────────────────────────────────────────────────────────────────

import {
    doc,
    setDoc,
    getDoc,
    onSnapshot,
    serverTimestamp,
    deleteDoc,
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
    const vaultRef = doc(db, 'users', uid);
    await deleteDoc(vaultRef);
}
