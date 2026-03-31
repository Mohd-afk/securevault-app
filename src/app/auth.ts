// ─── SecureVault Auth Module ─────────────────────────────────────────
// Wraps Firebase Auth for email logic (passwordless + derived keys).
// Contains native Capacitor Google Sign-In support.
//
// NOTE: All functions call getFirebaseAuth() lazily each time.
// This ensures Firebase is always initialized before use.
// ─────────────────────────────────────────────────────────────────────

import {
    signInWithEmailAndPassword,
    signOut as firebaseSignOut,
    onAuthStateChanged,
    sendSignInLinkToEmail,
    isSignInWithEmailLink,
    signInWithEmailLink,
    updatePassword,
    EmailAuthProvider,
    reauthenticateWithCredential,
    linkWithCredential,
    GoogleAuthProvider,
    signInWithCredential,
    type User,
} from 'firebase/auth';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { getFirebaseAuth } from './firebase';
import { createLogger } from './utils/logger';

const log = createLogger('AUTH');

// ── Email Links (Flow 1 & 3) ─────────────────────────────────────────

export async function sendPasswordlessVerificationLink(email: string, mode: 'signup' | 'reset'): Promise<void> {
    if (!email) throw new Error("Email is required");
    log.info('Sending passwordless verification link', { email, mode });

    const actionCodeSettings = {
        url: `${window.location.origin}/?mode=${mode}`,
        handleCodeInApp: true,
    };
    await sendSignInLinkToEmail(getFirebaseAuth(), email, actionCodeSettings);
    window.localStorage.setItem('emailForSignIn', email);
    log.info('Verification link sent successfully', { email });
}

export function isVerificationLink(href: string): boolean {
    const result = isSignInWithEmailLink(getFirebaseAuth(), href);
    if (result) log.info('Detected magic verification link in URL');
    return result;
}

export async function finishPasswordlessSignIn(href: string): Promise<User> {
    log.info('Finishing passwordless sign-in from magic link');
    let email = window.localStorage.getItem('emailForSignIn');
    if (!email) {
        log.warn('No stored email found, prompting user');
        email = window.prompt('Please provide your email for confirmation');
    }
    if (!email) throw new Error('Email is required to complete sign-in.');

    const result = await signInWithEmailLink(getFirebaseAuth(), email, href);
    window.localStorage.removeItem('emailForSignIn');
    log.info('Passwordless sign-in completed', { uid: result.user.uid, email });
    return result.user;
}

export async function finalizeMasterPasswordSetup(email: string, authKey: string): Promise<User> {
    const user = getFirebaseAuth().currentUser;
    if (!user) throw new Error('No user is currently signed in to set the password.');
    
    try {
        const hasPasswordProvider = user.providerData.some((p) => p.providerId === "password");

        if (!hasPasswordProvider) {
            console.log("Linking password provider...");
            const credential = EmailAuthProvider.credential(email, authKey);
            await linkWithCredential(user, credential);
            console.log("Password provider linked successfully");
        } else {
            console.log("Password provider already exists");
            await updatePassword(user, authKey);
        }
    } catch (error) {
        console.error("LINKING ERROR:", error);
        throw error;
    }
    
    return user;
}

/**
 * Re-authenticate the current user before sensitive operations like password change.
 */
export async function reauthenticateUser(email: string, authKey: string): Promise<void> {
    const user = getFirebaseAuth().currentUser;
    if (!user) throw new Error('No user is currently signed in.');
    log.info('Re-authenticating user before sensitive operation', { uid: user.uid, email });

    const credential = EmailAuthProvider.credential(email, authKey);
    await reauthenticateWithCredential(user, credential);
    log.info('Re-authentication successful', { uid: user.uid });
}

// ── Master Password Auth (Flow 2) ────────────────────────────────────

export async function signInWithDerivedKey(
    email: string,
    authKey: string,
): Promise<User> {
    log.info('Signing in with derived auth key', { email });
    const credential = await signInWithEmailAndPassword(getFirebaseAuth(), email, authKey);
    log.info('Sign-in with derived key successful', { uid: credential.user.uid });
    return credential.user;
}

// ── Google Sign-In ───────────────────────────────────────────────────

export async function signInWithGoogle(): Promise<User> {
    log.info('Starting Native Google sign-in');
    
    // Call the native Google Sign-In plugin
    const result = await FirebaseAuthentication.signInWithGoogle();
    
    // Convert the native Google credential to a Firebase credential
    // The plugin returns idToken (Google token)
    if (!result.credential || !result.credential.idToken) {
        throw new Error("Google Sign-In failed to return an ID token");
    }
    
    // Link to our JS SDK
    const credential = GoogleAuthProvider.credential(result.credential.idToken);
    const authResult = await signInWithCredential(getFirebaseAuth(), credential);
    
    log.info('Google sign-in successful', { uid: authResult.user.uid, email: authResult.user.email });
    return authResult.user;
}

// ── Sign Out ─────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
    log.info('Signing out user');
    await firebaseSignOut(getFirebaseAuth());
    log.info('Sign-out complete');
}

// ── Auth State Observer ──────────────────────────────────────────────

export function onAuthChange(
    callback: (user: User | null) => void,
): () => void {
    return onAuthStateChanged(getFirebaseAuth(), (user) => {
        log.info('Auth state changed', { uid: user?.uid ?? null, email: user?.email ?? null });
        callback(user);
    });
}

// ── Current User ─────────────────────────────────────────────────────

export function getCurrentUser(): User | null {
    return getFirebaseAuth().currentUser;
}
