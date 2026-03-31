import { useState, useEffect, useRef } from 'react';
import { createLogger } from '../utils/logger';

const log = createLogger('UI');
import { Shield, Eye, EyeOff, KeyRound, LogOut, Fingerprint } from 'lucide-react';
import {
  hasConfiguredVault,
  setupInitialVault,
  unlockVault,
  setSessionPassword,
  getAndClearPendingAutoUnlockPassword,
  unlockWithBiometric,
  checkBiometricAvailability,
  getSettings,
} from '../store';
import { isPasswordStrong, PasswordStrengthIndicator } from '../utils/password';

interface LockScreenProps {
  onUnlock: () => void;
  userEmail?: string;
  onSignOut?: () => void;
}

export function LockScreen({ onUnlock, userEmail, onSignOut }: LockScreenProps) {
  const [isSetup, setIsSetup] = useState<boolean | null>(null);
  const [isAutoUnlocking, setIsAutoUnlocking] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Biometric state
  // biometricAvailable: null = not yet checked, true/false = check result
  const [biometricAvailable, setBiometricAvailable] = useState<boolean>(false);
  // showBiometricButton: false initially — auto-prompt fires first.
  // Shown only after the user cancels the auto-prompt.
  const [showBiometricButton, setShowBiometricButton] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  // Prevents double-firing on strict-mode double-mount in dev
  const biometricTriggeredRef = useRef(false);

  // ── Biometric unlock handler ─────────────────────────────────────────
  const handleBiometricUnlock = async (isAutoTrigger = false) => {
    if (biometricLoading) return;
    const USER_CANCEL_CODES = ['ERROR_10', 'ERROR_13', 'USER_CANCELED', 'error_10', 'error_13'];
    setBiometricLoading(true);
    if (!isAutoTrigger) setError('');
    try {
      log.info('LockScreen: Attempting biometric unlock', { isAutoTrigger });
      const success = await unlockWithBiometric();
      if (success) {
        log.info('LockScreen: Biometric unlock successful');
        onUnlock();
      }
    } catch (e: any) {
      const errStr = String(e?.message ?? e ?? '');
      const isCancelled = USER_CANCEL_CODES.some((code) => errStr.includes(code));
      if (isCancelled) {
        log.info('LockScreen: Biometric prompt cancelled by user — showing manual button');
        // User dismissed — reveal the re-trigger button, do not show an error
        setShowBiometricButton(true);
      } else {
        log.error('LockScreen: Biometric unlock failed (non-cancel)', e);
        setError('Biometric authentication failed. Please try again or enter your Master Password.');
        setShowBiometricButton(true); // Let them retry or fall back
      }
    } finally {
      setBiometricLoading(false);
    }
  };

  // ── On-mount: vault check + biometric auto-prompt ─────────────────────
  useEffect(() => {
    let cancelled = false;
    log.info('LockScreen: Checking if vault is configured');

    hasConfiguredVault().then(async (has) => {
      if (cancelled) return;
      log.info('LockScreen: Vault configured check result', { hasVault: has });

      if (has) {
        // 1. Try password-based auto-unlock from pending session password
        const autoUnlockPwd = getAndClearPendingAutoUnlockPassword();
        if (autoUnlockPwd) {
          log.info('LockScreen: Found pending auto-unlock password, attempting auto-unlock');
          setIsAutoUnlocking(true);
          try {
            setPassword(autoUnlockPwd);
            setLoading(true);
            setError('');
            await unlockVault(autoUnlockPwd);
            log.info('LockScreen: Auto-unlock successful');
            if (!cancelled) onUnlock();
            return;
          } catch (e) {
            log.error('LockScreen: Auto-unlock failed', e);
            if (!cancelled) {
              setError('Session expired or incorrect password. Please unlock again.');
              setLoading(false);
              setIsAutoUnlocking(false);
            }
          }
        }

        // 2. Check biometrics — auto-prompt if available and enabled
        if (!biometricTriggeredRef.current) {
          biometricTriggeredRef.current = true;
          try {
            const settings = await getSettings();
            if (settings.biometricEnabled) {
              const { available } = await checkBiometricAvailability();
              if (available && !cancelled) {
                setBiometricAvailable(true);
                log.info('LockScreen: Biometric is enabled and available — auto-prompting');
                // Slight delay so the screen renders first (better UX)
                setTimeout(() => {
                  if (!cancelled) handleBiometricUnlock(true);
                }, 300);
              }
            }
          } catch (e) {
            log.warn('LockScreen: Failed to check biometric availability', e);
          }
        }

        if (!cancelled) setIsSetup(false); // returning user
      } else {
        // New user — needs first-time vault setup
        if (!cancelled) setIsSetup(true);
      }
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show loader while checking vault or auto-unlocking
  if (isSetup === null || isAutoUnlocking) {
    return (
      <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Master Password Submit ──────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSetup) {
        // First-time vault setup
        log.info('LockScreen: First-time vault setup attempt');
        if (!isPasswordStrong(password)) {
          setError('Please fix all password requirements below.');
          setLoading(false);
          return;
        }
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          setLoading(false);
          return;
        }

        try {
          if (userEmail) {
            log.info('LockScreen: Linking master password to user account', { userEmail });
            const { deriveAuthKey } = await import('../crypto');
            const { finalizeMasterPasswordSetup } = await import('../auth');
            const authKey = await deriveAuthKey(password, userEmail);
            await finalizeMasterPasswordSetup(userEmail, authKey);
          }
        } catch (linkError: any) {
          log.error('LockScreen: Failed to link master password to account', linkError);
          const errorMsg = linkError?.code === 'auth/requires-recent-login'
            ? 'Session expired. Please sign out and sign in again to set up your vault.'
            : 'Failed to link master password. Please try again.';
          setError(errorMsg);
          setLoading(false);
          return;
        }

        await setupInitialVault(password);
        setSessionPassword(password);
        log.info('LockScreen: Initial vault setup complete');
        onUnlock();
      } else {
        // Returning user unlock via master password
        log.info('LockScreen: Returning user unlock attempt');
        try {
          await unlockVault(password);
          log.info('LockScreen: Unlock successful');
          onUnlock();
        } catch (e) {
          log.error('LockScreen: Unlock failed (wrong password or decrypt error)', e);
          setError('Incorrect master password');
        }
      }
    } catch {
      setError('An error occurred. Please try again.');
    }
    setLoading(false);
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#1a1a2e] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm flex flex-col items-center">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center mb-4 shadow-lg shadow-cyan-500/20">
            <Shield className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-white mb-1">SecureVault</h1>

          {userEmail && (
            <p className="text-cyan-400 text-xs mt-0.5 mb-1">{userEmail}</p>
          )}

          <p className="text-gray-400 text-sm">
            {isSetup ? 'Set up your master password' : 'Enter your master password'}
          </p>
        </div>

        {/* ── Biometric button (only shown after user cancels auto-prompt) ── */}
        {!isSetup && biometricAvailable && showBiometricButton && (
          <button
            type="button"
            onClick={() => handleBiometricUnlock(false)}
            disabled={biometricLoading}
            className="w-full mb-5 bg-[#16213e] hover:bg-[#1a2942] border border-emerald-500/30 text-emerald-400 py-3 rounded-xl disabled:opacity-50 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {biometricLoading ? (
              <span className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Fingerprint className="w-4 h-4" />
            )}
            {biometricLoading ? 'Authenticating...' : 'Unlock with Biometrics'}
          </button>
        )}

        {/* Biometric loading spinner while auto-prompt is active */}
        {!isSetup && biometricAvailable && !showBiometricButton && biometricLoading && (
          <div className="mb-5 flex flex-col items-center gap-2 text-gray-400 text-sm">
            <span className="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
            <p>Waiting for biometric...</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="w-full space-y-4">
          <div>
            <label className="text-gray-400 text-xs mb-1.5 block">
              {isSetup ? 'Create Master Password' : 'Master Password'}
            </label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter master password"
                className="w-full bg-[#16213e] border border-gray-700 rounded-xl py-3 pl-10 pr-11 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
                autoFocus={!biometricAvailable}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
              </button>
            </div>
          </div>
          {isSetup && <PasswordStrengthIndicator password={password} />}

          {isSetup && (
            <div>
              <label className="text-gray-400 text-xs mb-1.5 block">Confirm Password</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm master password"
                  className="w-full bg-[#16213e] border border-gray-700 rounded-xl py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>
            </div>
          )}

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white py-3 rounded-xl disabled:opacity-50 transition-all active:scale-[0.98] shadow-lg shadow-cyan-500/20"
          >
            {loading ? 'Unlocking...' : isSetup ? 'Create Vault' : 'Unlock'}
          </button>
        </form>

        {isSetup && (
          <p className="text-gray-500 text-xs text-center mt-6 px-4">
            This password encrypts your vault. If you forget it, your data cannot be recovered.
          </p>
        )}

        {/* Sign out & Reset links */}
        <div className="mt-8 flex flex-col items-center gap-4">
          {onSignOut && (
            <button
              onClick={onSignOut}
              className="flex items-center gap-2 text-gray-500 text-xs hover:text-gray-300 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out and switch account
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
