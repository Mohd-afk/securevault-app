// ─── Firebase Initialization ─────────────────────────────────────────
// Firebase is NOT initialized at module load time.
// Call initFirebase() explicitly in the boot sequence AFTER notifyAppReady().
// This prevents module-level crashes from blocking the OTA ready signal.
// ─────────────────────────────────────────────────────────────────────

import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
    getAuth,
    indexedDBLocalPersistence,
    setPersistence,
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
        apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
        storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId:             import.meta.env.VITE_FIREBASE_APP_ID,
    };

    // 1. Init app
    _app  = initializeApp(firebaseConfig);
    _auth = getAuth(_app);
    _db   = getFirestore(_app);
    console.log('[Firebase] App + Auth + Firestore created for project:', firebaseConfig.projectId);

    // 2. Set persistence — on native use IndexedDB.
    //    NO silent fallback: if this fails, we need to know exactly why.
    if (Capacitor.isNativePlatform()) {
        try {
            await setPersistence(_auth, indexedDBLocalPersistence);
            console.log('[Firebase] Auth persistence set to IndexedDB (native)');
        } catch (err) {
            // Log in full — do NOT silently fallback.
            console.error('[Firebase] CRITICAL: IndexedDB persistence failed. Auth state will be lost on reload.', err);
            // Re-throw so the boot sequence can decide how to handle.
            throw err;
        }
    }
    // On web (dev/browser), leave default persistence (localStorage) untouched.

    _initialized = true;
    console.log('[Firebase] Initialization complete.');
}

export default { getAuth: getFirebaseAuth, getFirestore: getFirebaseDb };
