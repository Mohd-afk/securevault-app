// ─── Firebase Initialization ─────────────────────────────────────────
// Configures Firebase app, Auth, and Firestore from environment variables.
// ─────────────────────────────────────────────────────────────────────

import { initializeApp } from 'firebase/app';
import { getAuth, browserLocalPersistence, indexedDBLocalPersistence, inMemoryPersistence, setPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

console.log('[Firebase] Initializing with project:', firebaseConfig.projectId);

let app;
try {
    app = initializeApp(firebaseConfig);
    console.log('[Firebase] App initialized successfully');
} catch (err) {
    console.error('[Firebase] INIT FAILED:', err);
    throw err;
}

export const auth = getAuth(app);

// Async persistence setup to prevent synchronous boot crashes
// Capacitor WebViews can restrict storage access heavily.
const setupPersistence = async () => {
    try {
        if (Capacitor.isNativePlatform()) {
            await setPersistence(auth, indexedDBLocalPersistence);
            console.log('[Firebase] Auth persistence set to IndexedDB (Native)');
        } else {
            await setPersistence(auth, browserLocalPersistence);
            console.log('[Firebase] Auth persistence set to LocalStorage (Web)');
        }
    } catch (err) {
        console.warn('[Firebase] Primary persistence failed. Falling back to Memory.', err);
        try {
            await setPersistence(auth, inMemoryPersistence);
            console.log('[Firebase] Auth persistence set to inMemory (Fallback)');
        } catch (fallbackErr) {
            console.error('[Firebase] Critical fallback persistence failure', fallbackErr);
        }
    }
};

// Fire without blocking the rest of the JS evaluation
setupPersistence();

export const db = getFirestore(app);
export default app;
