// ─── SecureVault Auth Module ─────────────────────────────────────────
// Wraps Firebase Auth for email+password with verification and Google Sign-In.
// ─────────────────────────────────────────────────────────────────────

import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
    sendEmailVerification,
    signOut as firebaseSignOut,
    onAuthStateChanged,
    type User,
} from 'firebase/auth';
import { auth } from './firebase';

// ── Email + Password ─────────────────────────────────────────────────

export async function signUpWithEmail(
    email: string,
    password: string,
): Promise<User> {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await sendEmailVerification(credential.user);
    return credential.user;
}

export async function signInWithEmail(
    email: string,
    password: string,
): Promise<User> {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return credential.user;
}

export async function resendVerificationEmail(): Promise<void> {
    const user = auth.currentUser;
    if (user && !user.emailVerified) {
        await sendEmailVerification(user);
    }
}

// ── Google Sign-In ───────────────────────────────────────────────────

const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle(): Promise<User> {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
}

// ── Sign Out ─────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
    await firebaseSignOut(auth);
}

// ── Auth State Observer ──────────────────────────────────────────────

export function onAuthChange(
    callback: (user: User | null) => void,
): () => void {
    return onAuthStateChanged(auth, callback);
}

// ── Current User ─────────────────────────────────────────────────────

export function getCurrentUser(): User | null {
    return auth.currentUser;
}

// ── Reload user to check email verification ──────────────────────────

export async function reloadUser(): Promise<User | null> {
    const user = auth.currentUser;
    if (user) {
        await user.reload();
        return auth.currentUser;
    }
    return null;
}
