import { useState, useEffect, useRef, useCallback } from 'react';
import { Outlet } from 'react-router';
import { LockScreen } from './LockScreen';
import { getSettings, clearSession } from '../store';

export function AppShell() {
  const [unlocked, setUnlocked] = useState(false);
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibilityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLock = useCallback(() => {
    clearSession();
    setUnlocked(false);
  }, []);

  // ── Auto-lock on inactivity ──────────────────────────────────────
  useEffect(() => {
    if (!unlocked) return;

    const settings = getSettings();
    if (settings.autoLockTimeout === 0) return; // "Never" = disabled

    const timeoutMs = settings.autoLockTimeout * 60 * 1000;

    const resetTimer = () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      inactivityTimer.current = setTimeout(handleLock, timeoutMs);
    };

    const events = ['mousemove', 'keydown', 'touchstart', 'click', 'scroll'];
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer(); // start timer immediately

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
        // Start a short grace period (30 seconds) so quick tab switches don't lock
        visibilityTimer.current = setTimeout(handleLock, 30_000);
      } else {
        // Came back — cancel the lock timer
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

  if (!unlocked) {
    return <LockScreen onUnlock={() => setUnlocked(true)} />;
  }

  return (
    <div className="max-w-md mx-auto min-h-screen bg-[#1a1a2e] relative shadow-2xl">
      <Outlet context={{ onLock: handleLock }} />
    </div>
  );
}
