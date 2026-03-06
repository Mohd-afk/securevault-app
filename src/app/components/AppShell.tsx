import { useState, useEffect, useRef, useCallback } from 'react';
import { Outlet } from 'react-router';
import { LockScreen } from './LockScreen';
import { AuthScreen } from './AuthScreen';
import { getSettings, clearSession, clearLocalVaultData } from '../store';
import { onAuthChange, signOut } from '../auth';
import type { User } from 'firebase/auth';

export function AppShell() {
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibilityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Auth state listener ────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = onAuthChange((firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
      // If user signs out, reset unlock state
      if (!firebaseUser) {
        setUnlocked(false);
        clearSession();
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLock = useCallback(() => {
    clearSession();
    setUnlocked(false);
  }, []);

  const handleSignOut = useCallback(async () => {
    clearSession();
    clearLocalVaultData();
    setUnlocked(false);
    try {
      await signOut();
    } catch {
      // Ignore sign-out errors
    }
  }, []);

  // ── Auto-lock on inactivity ──────────────────────────────────────
  useEffect(() => {
    if (!unlocked) return;

    const settings = getSettings();
    if (settings.autoLockTimeout === 0) return;

    const timeoutMs = settings.autoLockTimeout * 60 * 1000;

    const resetTimer = () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      inactivityTimer.current = setTimeout(handleLock, timeoutMs);
    };

    const events = ['mousemove', 'keydown', 'touchstart', 'click', 'scroll'];
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, [unlocked, handleLock]);

  // ── Auto-lock on tab hide ────────────────────────────────────────
  useEffect(() => {
    if (!unlocked) return;

    const settings = getSettings();
    if (!settings.lockOnHide) return;

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
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (visibilityTimer.current) clearTimeout(visibilityTimer.current);
    };
  }, [unlocked, handleLock]);

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

  // ── Gate 1: Auth ─────────────────────────────────────────────────
  if (!user) {
    return <AuthScreen onAuthenticated={() => { }} />;
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
