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
    EmailAuthProvider,
    reauthenticateWithCredential,
    linkWithCredential,
    type User,
} from 'firebase/auth';
import { auth } from './firebase';
import { createLogger } from './utils/logger';

const log = createLogger('AUTH');

// ── Email Links (Flow 1 & 3) ─────────────────────────────────────────

export async function sendPasswordlessVerificationLink(email: string): Promise<void> {
    if (!email) throw new Error("Email is required");
    log.info('Sending passwordless verification link', { email });

    const actionCodeSettings = {
        // Automatically redirects back to app, needs to match Firebase console config
        url: window.location.origin,
        handleCodeInApp: true,
    };
    await sendSignInLinkToEmail(auth, email, actionCodeSettings);
    // Save email locally to complete sign-in without asking again
    window.localStorage.setItem('emailForSignIn', email);
    log.info('Verification link sent successfully', { email });
}

export function isVerificationLink(href: string): boolean {
    const result = isSignInWithEmailLink(auth, href);
    if (result) log.info('Detected magic verification link in URL');
    return result;
}

export async function finishPasswordlessSignIn(href: string): Promise<User> {
    log.info('Finishing passwordless sign-in from magic link');
    let email = window.localStorage.getItem('emailForSignIn');
    if (!email) {
        log.warn('No stored email found, prompting user');
        // Fallback if the user opens the link on a different device or browser
        email = window.prompt('Please provide your email for confirmation');
    }
    if (!email) throw new Error('Email is required to complete sign-in.');

    const result = await signInWithEmailLink(auth, email, href);
    window.localStorage.removeItem('emailForSignIn');
    log.info('Passwordless sign-in completed', { uid: result.user.uid, email });
    return result.user;
}

export async function finalizeMasterPasswordSetup(email: string, authKey: string): Promise<User> {
    const user = auth.currentUser;
    if (!user) throw new Error('No user is currently signed in to set the password.');
    log.info('Finalizing master password setup', { uid: user.uid });
    
    // Check if the user already has the "password" provider linked
    const hasPasswordProvider = user.providerData.some(provider => provider.providerId === 'password');
    
    if (hasPasswordProvider) {
        log.info('User has password provider, updating password');
        await updatePassword(user, authKey);
    } else {
        log.info('User lacks password provider, linking Email/Password credential');
        try {
            const credential = EmailAuthProvider.credential(email, authKey);
            await linkWithCredential(user, credential);
        } catch (error) {
            log.error('Failed to link Email/Password credential', error);
            throw error;
        }
    }
    
    log.info('Firebase Auth password configured successfully', { uid: user.uid });
    return user;
}

/**
 * Re-authenticate the current user before sensitive operations like password change.
 * Firebase requires recent authentication for `updatePassword`.
 */
export async function reauthenticateUser(email: string, authKey: string): Promise<void> {
    const user = auth.currentUser;
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
    const credential = await signInWithEmailAndPassword(auth, email, authKey);
    log.info('Sign-in with derived key successful', { uid: credential.user.uid });
    return credential.user;
}

// ── Google Sign-In ───────────────────────────────────────────────────

const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle(): Promise<User> {
    log.info('Starting Google sign-in popup');
    const result = await signInWithPopup(auth, googleProvider);
    log.info('Google sign-in successful', { uid: result.user.uid, email: result.user.email });
    return result.user;
}

// ── Sign Out ─────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
    log.info('Signing out user');
    await firebaseSignOut(auth);
    log.info('Sign-out complete');
}

// ── Auth State Observer ──────────────────────────────────────────────

export function onAuthChange(
    callback: (user: User | null) => void,
): () => void {
    return onAuthStateChanged(auth, (user) => {
        log.info('Auth state changed', { uid: user?.uid ?? null, email: user?.email ?? null });
        callback(user);
    });
}

// ── Current User ─────────────────────────────────────────────────────

export function getCurrentUser(): User | null {
    return auth.currentUser;
}
