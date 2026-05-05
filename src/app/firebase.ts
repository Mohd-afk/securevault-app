// ─── Firebase Initialization ─────────────────────────────────────────
// Firebase is NOT initialized at module load time.
// Call initFirebase() explicitly in the boot sequence AFTER notifyAppReady().
// This prevents module-level crashes from blocking the OTA ready signal.
// ─────────────────────────────────────────────────────────────────────

import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
    getAuth,
    initializeAuth,
    indexedDBLocalPersistence,
    type Auth,
} from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';

// ── Module-level holders (populated after initFirebase()) ────────────

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;
let _initialized = false;

// ── Lazy getters ─────────────────────────────────────────────────────
// These throw clearly if accessed before initFirebase() is called.

export function getFirebaseAuth(): Auth {
    if (!_auth) throw new Error('[Firebase] Auth not initialized. Call initFirebase() first.');
    return _auth;
}

export function getFirebaseDb(): Firestore {
    if (!_db) throw new Error('[Firebase] Firestore not initialized. Call initFirebase() first.');
    return _db;
}

// Keep legacy exports pointing to lazy getters for backward compatibility.
// Components that import { auth } or { db } will get the live value
// once initFirebase() has been called at boot.
// NOTE: No Proxy exports. All consumers use getFirebaseAuth() and getFirebaseDb() directly.

// ── Main init function ───────────────────────────────────────────────

/**
 * Initialize Firebase app, Auth, and Firestore.
 * Must be called AFTER notifyAppReady() in App.tsx boot sequence.
 * Safe to call multiple times — idempotent.
 */
export async function initFirebase(): Promise<void> {
    if (_initialized) {
        console.log('[Firebase] Already initialized, skipping.');
        return;
    }

    console.log('[Firebase] Starting initialization...');

    const firebaseConfig = {
        apiKey:            import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyDsAH9mhH9IFYLyEjqKfy7uTnNRbU7Mg00',
        authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'vault-app-ba6e2.firebaseapp.com',
        projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID || 'vault-app-ba6e2',
        storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'vault-app-ba6e2.firebasestorage.app',
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '1087322543080',
        appId:             import.meta.env.VITE_FIREBASE_APP_ID || '1:1087322543080:web:a1fa522bdcb3e3518b8a5d',
    };

    // 1. Init app
    _app  = initializeApp(firebaseConfig);

    // 2. Init Auth with appropriate persistence
    if (Capacitor.isNativePlatform()) {
        try {
            // Using initializeAuth instead of getAuth + setPersistence
            // This prevents IndexedDB initialization from hanging the boot sequence
            _auth = initializeAuth(_app, {
                persistence: indexedDBLocalPersistence
            });
            console.log('[Firebase] Auth initialized with IndexedDB persistence (native)');
        } catch (err) {
            console.error('[Firebase] CRITICAL: Auth initialization failed on native. Auth state will be lost on reload.', err);
            throw err;
        }
    } else {
        _auth = getAuth(_app);
        console.log('[Firebase] Auth initialized with default browser persistence');
    }

    // 3. Init Firestore
    _db = getFirestore(_app);
    console.log('[Firebase] App + Auth + Firestore created for project:', firebaseConfig.projectId);

    _initialized = true;
    console.log('[Firebase] Initialization complete.');
}

export default { getAuth: getFirebaseAuth, getFirestore: getFirebaseDb };
