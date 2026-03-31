// ΓöÇΓöÇΓöÇ SecureVault Auth Module ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// Wraps Firebase Auth for email logic (passwordless + derived keys) and Google Sign-In.
// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

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

// ΓöÇΓöÇ Email Links (Flow 1 & 3) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

export async function sendPasswordlessVerificationLink(email: string, mode: 'signup' | 'reset'): Promise<void> {
    if (!email) throw new Error("Email is required");
    log.info('Sending passwordless verification link', { email, mode });

    const actionCodeSettings = {
        // Automatically redirects back to app with the mode parameter
        url: `${window.location.origin}/?mode=${mode}`,
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
    
    try {
        const hasPasswordProvider = user.providerData.some(p => p.providerId === "password");

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
        throw error; // keep rejecting so the UI knows it failed
    }
    
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

// ΓöÇΓöÇ Master Password Auth (Flow 2) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

export async function signInWithDerivedKey(
    email: string,
    authKey: string,
): Promise<User> {
    log.info('Signing in with derived auth key', { email });
    const credential = await signInWithEmailAndPassword(auth, email, authKey);
    log.info('Sign-in with derived key successful', { uid: credential.user.uid });
    return credential.user;
}

// ΓöÇΓöÇ Google Sign-In ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle(): Promise<User> {
    log.info('Starting Google sign-in popup');
    const result = await signInWithPopup(auth, googleProvider);
    log.info('Google sign-in successful', { uid: result.user.uid, email: result.user.email });
    return result.user;
}

// ΓöÇΓöÇ Sign Out ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

export async function signOut(): Promise<void> {
    log.info('Signing out user');
    await firebaseSignOut(auth);
    log.info('Sign-out complete');
}

// ΓöÇΓöÇ Auth State Observer ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

export function onAuthChange(
    callback: (user: User | null) => void,
): () => void {
    return onAuthStateChanged(auth, (user) => {
        log.info('Auth state changed', { uid: user?.uid ?? null, email: user?.email ?? null });
        callback(user);
    });
}

// ΓöÇΓöÇ Current User ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

export function getCurrentUser(): User | null {
    return auth.currentUser;
}
