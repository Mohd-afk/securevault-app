import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router';
import { Toaster, toast } from 'sonner';
import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { router } from './routes';
import { initFirebase } from './firebase';
import { initUpdater, OTA_JUST_UPDATED_KEY } from './services/updater';
import { checkApkUpdateRequired } from './services/apk-update-checker';
import CriticalUpdateScreen from './components/CriticalUpdateScreen';
import ApkUpdateBanner from './components/ApkUpdateBanner';

export default function App() {
  const [criticalUpdate, setCriticalUpdate] = useState(false);
  const [bootComplete, setBootComplete] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [apkUpdateRequired, setApkUpdateRequired] = useState(false);
  const [apkDownloadUrl, setApkDownloadUrl] = useState('https://github.com/Mohd-afk/securevault-app/releases/latest');

  useEffect(() => {
    const _bm = (k: string) => { try { const p = localStorage.getItem('OTA_DEBUG_LOG') || ''; localStorage.setItem('OTA_DEBUG_LOG', p + '\n' + k + ': ' + new Date().toISOString()); } catch(e) {} };
    _bm('BOOT_MARK_1_react_mounted');
    console.log('[BOOT] App component mounted, effect fires...');
    const boot = async () => {
      console.log('[BOOT] Starting boot sequence...');

      // ─────────────────────────────────────────────────────────────────
      // STEP 1: notifyAppReady() — ABSOLUTE FIRST THING.
      // This MUST run before any other await. If this doesn't fire within
      // appReadyTimeout (15s), the plugin rolls back.
      // ─────────────────────────────────────────────────────────────────
      _bm('BOOT_MARK_2_before_notifyAppReady');
      if (Capacitor.isNativePlatform()) {
        try {
          await CapacitorUpdater.notifyAppReady();
          _bm('BOOT_MARK_3_notifyAppReady_ok');
          console.log('[BOOT] notifyAppReady() fired — bundle marked healthy');
        } catch (err) {
          _bm('BOOT_MARK_3_notifyAppReady_FAILED: ' + String(err));
          console.error('[BOOT] notifyAppReady() failed:', err);
        }
      }

      // Helper function to race a promise against a timeout
      const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number, name: string): Promise<T> => {
        return new Promise<T>((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(new Error(`Timeout of ${timeoutMs}ms exceeded for: ${name}`));
          }, timeoutMs);
          promise.then(
            (res) => { clearTimeout(timer); resolve(res); },
            (err) => { clearTimeout(timer); reject(err); }
          );
        });
      };

      // ─────────────────────────────────────────────────────────────────
      // STEP 2: Initialize Firebase.
      // Wrapped in a 3.0s timeout — failure/timeout must NOT prevent render.
      // ─────────────────────────────────────────────────────────────────
      _bm('BOOT_MARK_4_before_firebase');
      try {
        await withTimeout(initFirebase(), 3000, 'initFirebase');
        _bm('BOOT_MARK_5_firebase_ok');
        console.log('[BOOT] Firebase initialized');
      } catch (err: any) {
        _bm('BOOT_MARK_5_firebase_FAILED_OR_TIMEOUT: ' + String(err));
        console.warn('[BOOT] Firebase init failed or timed out (falling back to offline-first):', err);
        // Do NOT block render on Firebase failure
      }

      // ─────────────────────────────────────────────────────────────────
      // STEP 3: Render the app immediately — don't block on network checks.
      // APK + OTA checks run silently in the background after boot.
      // ─────────────────────────────────────────────────────────────────
      setBootComplete(true);
      _bm('BOOT_MARK_6_boot_complete');
      console.log('[BOOT] Boot sequence complete — rendering app');

      // ── Post-boot: show "just updated" toast if this is first launch after OTA ──
      if (Capacitor.isNativePlatform()) {
        const justUpdated = localStorage.getItem(OTA_JUST_UPDATED_KEY);
        if (justUpdated) {
          localStorage.removeItem(OTA_JUST_UPDATED_KEY);
          setTimeout(() => {
            toast.success(`✅ Updated to v${justUpdated}`, {
              description: 'New features are live. Enjoy Keeguard!',
              duration: 5000,
            });
          }, 1500);
        }
      }

      // ── Background checks — fire-and-forget, 3s after boot ────────────
      // These NEVER block the UI. They run after the app is already visible.
      setTimeout(() => {
        // APK update check
        checkApkUpdateRequired()
          .then(result => {
            console.log('[APK_UPDATE] Check result:', result);
            if (result.updateRequired) {
              setApkUpdateRequired(true);
              if (result.downloadUrl) setApkDownloadUrl(result.downloadUrl);
            }
          })
          .catch(err => console.error('[APK_UPDATE] Check failed (non-fatal):', err));

        // OTA silent background check
        initUpdater({ onCriticalUpdate: () => setCriticalUpdate(true) })
          .then(() => console.log('[OTA] Background check complete'))
          .catch(err => console.error('[OTA] Background check failed (non-fatal):', err));
      }, 3000);
    };

    boot();
  }, []);

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
          Loading Keeguard...
        </p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // APK update required — show full-screen blocker BEFORE routing.
  // This must sit above criticalUpdate in priority because a missing native
  // plugin can cause the OTA critical-update flow to also fail.
  if (apkUpdateRequired) return <ApkUpdateBanner downloadUrl={apkDownloadUrl} />;

  if (criticalUpdate) return <CriticalUpdateScreen onTimeout={() => setCriticalUpdate(false)} />;

  return (
    <div className="dark min-h-screen bg-[#1a1a2e]">
      {bootError ? (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          textAlign: 'center',
          gap: '16px'
        }}>
          <div style={{
            background: '#7f1d1d',
            color: '#fca5a5',
            padding: '16px 24px',
            borderRadius: '12px',
            border: '1px solid #b91c1c',
            maxWidth: '400px'
          }}>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 600 }}>Application Error</h2>
            <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.5' }}>{bootError}</p>
            <p style={{ margin: '12px 0 0 0', fontSize: '12px', opacity: 0.8 }}>Please check your network connection and reload the application.</p>
          </div>
        </div>
      ) : (
        <>
          <RouterProvider router={router} />
          <Toaster
            theme="dark"
            position="bottom-center"
            toastOptions={{
              style: {
                background: '#16213e',
                border: '1px solid rgba(6,182,212,0.25)',
                color: '#fff',
                marginBottom: 'env(safe-area-inset-bottom)',
              },
            }}
          />
        </>
      )}
    </div>
  );
}
