// ─── Critical Update Screen ──────────────────────────────────────────
// Full-screen blocker shown when a critical/security update is downloading.
// Prevents user from interacting with the app until the update is applied.
// ─────────────────────────────────────────────────────────────────────

import { Shield, Loader2 } from 'lucide-react';

export default function CriticalUpdateScreen() {
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
      {/* Shield Icon */}
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(59, 130, 246, 0.3))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '1.5rem',
          boxShadow: '0 0 40px rgba(139, 92, 246, 0.2)',
        }}
      >
        <Shield size={40} color="#8b5cf6" />
      </div>

      {/* Title */}
      <h1
        style={{
          fontSize: '1.5rem',
          fontWeight: 700,
          margin: '0 0 0.75rem 0',
          background: 'linear-gradient(90deg, #8b5cf6, #3b82f6)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        Security Update Required
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
        A critical security update is being installed. The app will restart automatically.
      </p>

      {/* Spinner */}
      <Loader2
        size={28}
        color="#8b5cf6"
        style={{
          animation: 'spin 1s linear infinite',
        }}
      />

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
