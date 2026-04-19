// ─── Critical Update Screen ──────────────────────────────────────────
// Full-screen blocker shown when a critical/security update is downloading.
// Prevents user from interacting with the app until the update is applied.
//
// SAFETY: If the OTA download does not complete within TIMEOUT_MS, the
// blocker automatically clears itself and lets the user into the app.
// This prevents an infinite-spinner scenario when the bundle URL is broken
// or network is unavailable — which previously locked users out forever.
// ─────────────────────────────────────────────────────────────────────

import { Shield, Loader2, AlertTriangle } from 'lucide-react';
import { useEffect, useState } from 'react';

/** If OTA hasn't resolved in this many ms, let the user in anyway. */
const TIMEOUT_MS = 30_000; // 30 seconds

interface CriticalUpdateScreenProps {
  /** Called when the safety timeout fires — clears the blocker in App.tsx */
  onTimeout?: () => void;
}

export default function CriticalUpdateScreen({ onTimeout }: CriticalUpdateScreenProps) {
  const [timedOut, setTimedOut] = useState(false);
  const [remaining, setRemaining] = useState(Math.round(TIMEOUT_MS / 1000));

  useEffect(() => {
    let countdown = Math.round(TIMEOUT_MS / 1000);

    const interval = setInterval(() => {
      countdown -= 1;
      setRemaining(countdown);
      if (countdown <= 0) clearInterval(interval);
    }, 1000);

    const timer = setTimeout(() => {
      clearInterval(interval);
      setTimedOut(true);
      // Give the user 2 more seconds to read "failed" state, then bail out.
      setTimeout(() => onTimeout?.(), 2000);
    }, TIMEOUT_MS);

    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, [onTimeout]);

  return (
    <div
      id="critical-update-screen"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f0c29 0%, #1a1a2e 50%, #16213e 100%)',
        color: '#ffffff',
        fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
        textAlign: 'center',
        padding: '2rem',
      }}
    >
      {/* Shield / Warning Icon */}
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          background: timedOut
            ? 'linear-gradient(135deg, rgba(239,68,68,0.3), rgba(249,115,22,0.3))'
            : 'linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(59, 130, 246, 0.3))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '1.5rem',
          boxShadow: timedOut
            ? '0 0 40px rgba(239,68,68,0.2)'
            : '0 0 40px rgba(139, 92, 246, 0.2)',
          transition: 'background 0.4s, box-shadow 0.4s',
        }}
      >
        {timedOut
          ? <AlertTriangle size={40} color="#f87171" />
          : <Shield size={40} color="#8b5cf6" />
        }
      </div>

      {/* Title */}
      <h1
        style={{
          fontSize: '1.5rem',
          fontWeight: 700,
          margin: '0 0 0.75rem 0',
          background: timedOut
            ? 'linear-gradient(90deg, #f87171, #fb923c)'
            : 'linear-gradient(90deg, #8b5cf6, #3b82f6)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          transition: 'background 0.4s',
        }}
      >
        {timedOut ? 'Update Unavailable' : 'Security Update Required'}
      </h1>

      {/* Subtitle */}
      <p
        style={{
          fontSize: '0.95rem',
          color: 'rgba(255, 255, 255, 0.6)',
          maxWidth: 320,
          lineHeight: 1.6,
          margin: '0 0 2rem 0',
        }}
      >
        {timedOut
          ? 'The update could not complete. You will be taken to the app now.'
          : 'A critical security update is being installed. The app will restart automatically.'
        }
      </p>

      {/* Spinner or done indicator */}
      {!timedOut && (
        <>
          <Loader2
            size={28}
            color="#8b5cf6"
            style={{ animation: 'spin 1s linear infinite' }}
          />
          <p style={{
            marginTop: '0.75rem',
            fontSize: '0.8rem',
            color: 'rgba(255,255,255,0.35)',
          }}>
            Timing out in {remaining}s if download stalls…
          </p>
        </>
      )}

      {/* Inline keyframes for the spinner */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
