// ─── APK Update Banner ────────────────────────────────────────────────────
// Full-screen blocker shown when the installed APK is below min_apk_version.
// Non-dismissible by design: a required APK update means native code the old
// app binary cannot execute. Blocking is intentional.
// ─────────────────────────────────────────────────────────────────────────────

import { Download, RefreshCw } from 'lucide-react';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

interface ApkUpdateBannerProps {
  downloadUrl: string;
}

export default function ApkUpdateBanner({ downloadUrl }: ApkUpdateBannerProps) {
  const handleDownload = async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        // Use the native Capacitor Browser plugin so the download page opens
        // in the system browser (where users can download + install the APK)
        await Browser.open({ url: downloadUrl });
      } else {
        window.open(downloadUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      // Fallback: use native window.open
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div
      id="apk-update-banner"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1a0a0a 0%, #2d0f0f 50%, #1a0a0a 100%)',
        color: '#ffffff',
        fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      {/* Top accent bar */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '4px',
        background: 'linear-gradient(90deg, #dc2626, #ef4444, #f87171)',
      }} />

      {/* Icon */}
      <div style={{
        width: 88,
        height: 88,
        borderRadius: '50%',
        background: 'rgba(239, 68, 68, 0.15)',
        border: '2px solid rgba(239, 68, 68, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '1.75rem',
        boxShadow: '0 0 40px rgba(239, 68, 68, 0.15)',
      }}>
        <RefreshCw size={40} color="#ef4444" />
      </div>

      {/* Title */}
      <h1 style={{
        fontSize: '1.6rem',
        fontWeight: 700,
        margin: '0 0 0.75rem 0',
        color: '#fee2e2',
        letterSpacing: '-0.02em',
      }}>
        App Update Required
      </h1>

      {/* Subtitle */}
      <p style={{
        fontSize: '0.95rem',
        color: 'rgba(254, 226, 226, 0.65)',
        maxWidth: 320,
        lineHeight: 1.65,
        margin: '0 0 0.5rem 0',
      }}>
        A new version of SecureVault is available that includes important native updates.
      </p>
      <p style={{
        fontSize: '0.875rem',
        color: 'rgba(254, 226, 226, 0.45)',
        maxWidth: 300,
        lineHeight: 1.6,
        margin: '0 0 2.5rem 0',
      }}>
        Please download and install the latest APK to continue using the app.
      </p>

      {/* Download Button */}
      <button
        id="apk-update-download-btn"
        onClick={handleDownload}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
          color: '#ffffff',
          border: 'none',
          borderRadius: '12px',
          padding: '14px 28px',
          fontSize: '1rem',
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 4px 24px rgba(220, 38, 38, 0.4)',
          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          letterSpacing: '0.01em',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
          (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 28px rgba(220, 38, 38, 0.55)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
          (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 24px rgba(220, 38, 38, 0.4)';
        }}
      >
        <Download size={20} />
        Download Update
      </button>

      {/* Instruction hint */}
      <p style={{
        fontSize: '0.75rem',
        color: 'rgba(254, 226, 226, 0.35)',
        marginTop: '1.25rem',
        maxWidth: 280,
        lineHeight: 1.5,
      }}>
        Opens GitHub Releases in your browser. Download the APK and install it to resume.
      </p>
    </div>
  );
}
