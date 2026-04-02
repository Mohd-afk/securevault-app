import { useState, useEffect, useRef, useCallback } from 'react';
import { Outlet } from 'react-router';
import { LockScreen } from './LockScreen';
import { AuthScreen } from './AuthScreen';
import { getSettings, clearSession, clearLocalVaultData, getVaultItems, permanentlyDeleteVaultItem } from '../store';
import { onAuthChange, signOut, isVerificationLink } from '../auth';
import { getFirebaseAuth } from '../firebase';
import type { User } from 'firebase/auth';
import { createLogger } from '../utils/logger';
import { registerCurrentDevice, listenForRevocation, updateLastActive } from '../services/deviceSession';
import { saveUserEmailToProfile } from '../firestore';

const log = createLogger('UI');

export function AppShell() {
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [magicLinkActive, setMagicLinkActive] = useState(false);

  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibilityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks whether we've received ANY auth event yet during this boot.
  // Firebase emits null first on cold boot while it restores from IndexedDB.
  // We must NOT clearSession on that first null — it's not a sign-out.
  const isInitialAuthEvent = useRef(true);

  // Check on mount if we're entering via a magic link
  useEffect(() => {
    if (isVerificationLink(window.location.href)) {
      log.info('AppShell: Magic link detected on mount');
      setMagicLinkActive(true);
    }
  }, []);

  // ── Auth state listener ────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = onAuthChange((firebaseUser) => {
      const wasInitial = isInitialAuthEvent.current;
      isInitialAuthEvent.current = false;

      log.info('AppShell: Auth state change', {
        uid: firebaseUser?.uid ?? null,
        isInitialEvent: wasInitial,
      });

      // If switching to a DIFFERENT user, clear stale local data
      if (firebaseUser && user && firebaseUser.uid !== user.uid) {
        log.info('AppShell: User switched, clearing stale data', { oldUid: user.uid, newUid: firebaseUser.uid });
        clearLocalVaultData().catch(console.error);
        clearSession();
      }

      setUser(firebaseUser);
      setAuthLoading(false);

      // Only clearSession on a CONFIRMED sign-out (not the initial cold-boot null).
      // On cold boot, Firebase emits null while still reading from IndexedDB.
      // Clearing session during that window would destroy valid vault state.
      if (!firebaseUser && !wasInitial) {
        log.info('AppShell: Confirmed sign-out — clearing session');
        setUnlocked(false);
        clearSession();
      }
    });
    return () => unsubscribe();
  }, [user]);

  const handleLock = useCallback(() => {
    log.info('AppShell: Vault locked');
    clearSession();
    setUnlocked(false);
  }, []);

  const handleSignOut = useCallback(async () => {
    log.info('AppShell: Signing out');
    // If we were processing a magic link but decided to sign out
    setMagicLinkActive(false);
    clearSession();
    clearLocalVaultData().catch(console.error);
    setUnlocked(false);
    try {
      await signOut();
      log.info('AppShell: Sign-out complete');
    } catch (e) {
      log.error('AppShell: Sign-out error (ignored)', e);
    }
  }, []);

  // ── Auto-delete expired trash items ────────────────────────────────
  useEffect(() => {
    if (!unlocked) return;
    const items = getVaultItems();
    const now = new Date().getTime();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    items.forEach(item => {
      if (item.deletedAt) {
        const deletedTime = new Date(item.deletedAt).getTime();
        if (now - deletedTime > thirtyDaysMs) {
          permanentlyDeleteVaultItem(item.id).catch(console.error);
        }
      }
    });
  }, [unlocked]);

  // ── Auto-lock on inactivity ──────────────────────────────────────
  useEffect(() => {
    if (!unlocked) return;

    let cancelled = false;

    getSettings().then((settings) => {
      if (cancelled || settings.autoLockTimeout === 0) return;

      const timeoutMs = settings.autoLockTimeout * 60 * 1000;

      const resetTimer = () => {
        if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
        inactivityTimer.current = setTimeout(handleLock, timeoutMs);
      };

      const events = ['mousemove', 'keydown', 'touchstart', 'click', 'scroll'];
      events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
      resetTimer();

      // Store cleanup for this specific invocation
      cleanupRef.current = () => {
        events.forEach((e) => window.removeEventListener(e, resetTimer));
        if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      };
    });

    const cleanupRef = { current: null as (() => void) | null };

    return () => {
      cancelled = true;
      cleanupRef.current?.();
    };
  }, [unlocked, handleLock]);

  // ── Auto-lock on tab hide ────────────────────────────────────────
  useEffect(() => {
    if (!unlocked) return;

    let cancelled = false;

    getSettings().then((settings) => {
      if (cancelled || !settings.lockOnHide) return;

      const handleVisibility = () => {
        if (document.hidden) {
          visibilityTimer.current = setTimeout(handleLock, 30_000);
        } else {
          if (visibilityTimer.current) {
            clearTimeout(visibilityTimer.current);
            visibilityTimer.current = null;
          }
        }
      };

      document.addEventListener('visibilitychange', handleVisibility);
      cleanupRef.current = () => {
        document.removeEventListener('visibilitychange', handleVisibility);
        if (visibilityTimer.current) clearTimeout(visibilityTimer.current);
      };
    });

    const cleanupRef = { current: null as (() => void) | null };

    return () => {
      cancelled = true;
      cleanupRef.current?.();
    };
  }, [unlocked, handleLock]);

  // ── Device Session tracking ────────────────────────────────────────
  useEffect(() => {
    if (!unlocked || !user) return;

    let cleanupListener: (() => void) | undefined;
    let cancelled = false;

    // Register device and sync location
    registerCurrentDevice(user.uid).then(() => {
      if (cancelled) return;
      // Start listening for revocation after registration
      cleanupListener = listenForRevocation(user.uid, () => {
        log.warn('AppShell: Session revoked remotely. Signing out.');
        handleSignOut();
      });
    }).catch(e => log.error('AppShell: Failed to register device', e));

    if (user.email) {
      saveUserEmailToProfile(user.uid, user.email).catch(e => log.error('AppShell: Failed to save email to profile', e));
    }

    // Update lastActive on user interactions, throttled internally to 10 min
    const handleInteraction = () => {
      updateLastActive(user.uid).catch(e => log.error('AppShell: Failed heartbeat', e));
    };

    const interactionEvents = ['mousedown', 'keydown', 'touchstart'];
    interactionEvents.forEach(e => document.addEventListener(e, handleInteraction, { passive: true }));
    
    // Also run an interval just in case they are reading passively
    const tenMins = 10 * 60 * 1000;
    const heartbeatInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        handleInteraction();
      }
    }, tenMins);

    return () => {
      cancelled = true;
      if (cleanupListener) cleanupListener();
      clearInterval(heartbeatInterval);
      interactionEvents.forEach(e => document.removeEventListener(e, handleInteraction));
    };
  }, [unlocked, user, handleSignOut]);

  // ── Loading state ────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Loading SecureVault...</p>
        </div>
      </div>
    );
  }

  // ── Gate 1: Auth & Magic Links ───────────────────────────────────
  // If no user, OR we are actively processing a magic link setup
  if (!user || magicLinkActive) {
    return <AuthScreen onAuthenticated={() => {
      // Completed account authentication
      setMagicLinkActive(false);
      setUser(getFirebaseAuth().currentUser);
      // Force all users to LockScreen to manage their vault state
      setUnlocked(false);
    }} />;
  }

  // ── Gate 2: Lock ─────────────────────────────────────────────────
  if (!unlocked) {
    return (
      <LockScreen
        onUnlock={() => setUnlocked(true)}
        userEmail={user.email ?? undefined}
        onSignOut={handleSignOut}
      />
    );
  }

  // ── Unlocked vault ───────────────────────────────────────────────
  return (
    <div className="max-w-md mx-auto min-h-screen bg-[#1a1a2e] relative shadow-2xl">
      <Outlet context={{ onLock: handleLock, onSignOut: handleSignOut, user }} />
    </div>
  );
}
