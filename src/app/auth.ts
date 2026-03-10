// ─── SecureVault Auth Module ─────────────────────────────────────────
// Wraps Firebase Auth for email logic (passwordless + derived keys) and Google Sign-In.
// ─────────────────────────────────────────────────────────────────────

import {
    signInWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
    signOut as firebaseSignOut,
    onAuthStateChanged,
    sendSignInLinkToEmail,
    isSignInWithEmailLink,
    signInWithEmailLink,
    updatePassword,
    sendPasswordResetEmail,
    type User,
} from 'firebase/auth';
import { auth } from './firebase';

// ── Email Links (Flow 1 & 3) ─────────────────────────────────────────

export async function sendPasswordlessVerificationLink(email: string): Promise<void> {
    if (!email) throw new Error("Email is required");

    const actionCodeSettings = {
        // Automatically redirects back to app, needs to match Firebase console config
        url: window.location.origin,
        handleCodeInApp: true,
    };
    await sendSignInLinkToEmail(auth, email, actionCodeSettings);
    // Save email locally to complete sign-in without asking again
    window.localStorage.setItem('emailForSignIn', email);
}

export function isVerificationLink(href: string): boolean {
    return isSignInWithEmailLink(auth, href);
}

export async function finishPasswordlessSignIn(href: string): Promise<User> {
    let email = window.localStorage.getItem('emailForSignIn');
    if (!email) {
        // Fallback if the user opens the link on a different device or browser
        email = window.prompt('Please provide your email for confirmation');
    }
    if (!email) throw new Error('Email is required to complete sign-in.');

    const result = await signInWithEmailLink(auth, email, href);
    window.localStorage.removeItem('emailForSignIn');
    return result.user;
}

export async function finalizeMasterPasswordSetup(authKey: string): Promise<User> {
    const user = auth.currentUser;
    if (!user) throw new Error('No user is currently signed in to set the password.');
    await updatePassword(user, authKey);
    return user;
}

export async function sendResetEmail(email: string): Promise<void> {
    // Send a standard Firebase reset email OR standard magic link if we repurpose it
    // For now we'll send a magic link, treating it the same as Sign Up
    await sendPasswordlessVerificationLink(email);
}

// ── Master Password Auth (Flow 2) ────────────────────────────────────

export async function signInWithDerivedKey(
    email: string,
    authKey: string,
): Promise<User> {
    const credential = await signInWithEmailAndPassword(auth, email, authKey);
    return credential.user;
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
