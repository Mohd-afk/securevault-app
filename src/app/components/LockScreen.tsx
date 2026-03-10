import { useState } from 'react';
import { Shield, Eye, EyeOff, KeyRound, LogOut } from 'lucide-react';
import {
  hasConfiguredVault,
  setupInitialVault,
  unlockVault,
  setSessionPassword,
} from '../store';
import { useEffect } from 'react';

interface LockScreenProps {
  onUnlock: () => void;
  userEmail?: string;
  onSignOut?: () => void;
}

export function LockScreen({ onUnlock, userEmail, onSignOut }: LockScreenProps) {
  const [isSetup, setIsSetup] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Check if the user has a configured vault
  useEffect(() => {
    let cancelled = false;
    hasConfiguredVault().then((has) => {
      if (!cancelled) setIsSetup(!has);
    });
    return () => { cancelled = true; };
  }, []);

  // Show loader while checking
  if (isSetup === null) {
    return (
      <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSetup) {
        // ── First-time setup ──────────────────────────────────
        if (password.length < 8) {
          setError('Master password must be at least 8 characters');
          setLoading(false);
          return;
        }
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          setLoading(false);
          return;
        }
        await setupInitialVault(password);
        setSessionPassword(password);
        onUnlock();
      } else {
        // ── Returning user unlock ─────────────────────────────
        // Go straight to unlockVault — it loads from cloud, derives the key,
        // and decrypts in a single pass. If the password is wrong, decryption
        // throws and we land in the catch block. This avoids running PBKDF2
        // multiple times (verify → unlock → migrate was 3x before).
        try {
          await unlockVault(password);
          onUnlock();
        } catch {
          setError('Incorrect master password');
        }
      }
    } catch {
      setError('An error occurred. Please try again.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm flex flex-col items-center">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center mb-4 shadow-lg shadow-cyan-500/20">
            <Shield className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-white mb-1">SecureVault</h1>

          {/* User email */}
          {userEmail && (
            <p className="text-cyan-400 text-xs mt-0.5 mb-1">{userEmail}</p>
          )}

          <p className="text-gray-400 text-sm">
            {isSetup ? 'Set up your master password' : 'Enter your master password'}
          </p>
        </div>

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
                autoFocus
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
