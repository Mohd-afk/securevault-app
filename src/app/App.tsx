import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { router } from './routes';
import { initFirebase } from './firebase';
import { initUpdater } from './services/updater';
import CriticalUpdateScreen from './components/CriticalUpdateScreen';

export default function App() {
  const [criticalUpdate, setCriticalUpdate] = useState(false);
  const [bootComplete, setBootComplete] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    const boot = async () => {
      // ─────────────────────────────────────────────────────────────────
      // STEP 1: notifyAppReady() — ABSOLUTE FIRST THING.
      // This MUST run before any other await. If this doesn't fire within
      // appReadyTimeout (15s in capacitor.config.ts), the plugin rolls back.
      // ─────────────────────────────────────────────────────────────────
      if (Capacitor.isNativePlatform()) {
        try {
          await CapacitorUpdater.notifyAppReady();
          console.log('[BOOT] notifyAppReady() fired — bundle marked healthy');
        } catch (err) {
          // Log but don't stop — bundle health is best-effort
          console.error('[BOOT] notifyAppReady() failed:', err);
        }
      }

      // ─────────────────────────────────────────────────────────────────
      // STEP 2: Initialize Firebase.
      // Wrapped in try/catch — a Firebase failure must NOT prevent render.
      // If Firebase fails here, the app still shows UI (auth will fail gracefully).
      // ─────────────────────────────────────────────────────────────────
      try {
        await initFirebase();
        console.log('[BOOT] Firebase initialized');
      } catch (err) {
        // Firebase init failure is serious but not fatal for the shell
        console.error('[BOOT] Firebase init failed — app will work in degraded mode:', err);
        setBootError('Firebase initialization failed. Some features may be unavailable.');
        // Still complete boot — do NOT block render
        setBootComplete(true);
        return;
      }

      // ─────────────────────────────────────────────────────────────────
      // STEP 3: Check for OTA updates (non-blocking).
      // This happens after Firebase is ready. Failure is silently logged.
      // ─────────────────────────────────────────────────────────────────
      try {
        await initUpdater({ onCriticalUpdate: () => setCriticalUpdate(true) });
        console.log('[BOOT] OTA check complete');
      } catch (err) {
        console.error('[BOOT] OTA check failed (non-fatal):', err);
      }

      setBootComplete(true);
    };

    boot();
  }, []);

  // Show a minimal loading UI while boot sequence runs
  // This is intentionally minimal — no Firebase dependency needed
  if (!bootComplete) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#1a1a2e',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: '12px',
        fontFamily: 'sans-serif',
      }}>
        <div style={{
          width: '32px',
          height: '32px',
          border: '2px solid #06b6d4',
          borderTop: '2px solid transparent',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }} />
        <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>
          Loading SecureVault...
        </p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (criticalUpdate) return <CriticalUpdateScreen />;

  return (
    <div className="dark min-h-screen bg-[#1a1a2e]">
      {bootError && (
        <div style={{
          background: '#7f1d1d',
          color: '#fca5a5',
          padding: '8px 16px',
          fontSize: '12px',
          textAlign: 'center',
        }}>
          ⚠️ {bootError}
        </div>
      )}
      <RouterProvider router={router} />
      <Toaster
        theme="dark"
        position="top-center"
        toastOptions={{
          style: {
            background: '#16213e',
            border: '1px solid rgba(255,255,255,0.05)',
            color: '#fff',
          },
        }}
      />
    </div>
  );
}
