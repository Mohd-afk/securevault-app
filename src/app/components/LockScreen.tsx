import { useState } from 'react';
import { Shield, Lock, Eye, EyeOff, KeyRound } from 'lucide-react';
import {
  hasMasterPassword,
  setupMasterPassword,
  verifyMasterPassword,
  seedSampleData,
  unlockVault,
  setSessionPassword,
} from '../store';

interface LockScreenProps {
  onUnlock: () => void;
}

export function LockScreen({ onUnlock }: LockScreenProps) {
  const isSetup = !hasMasterPassword();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSetup) {
        // ── First-time setup ──────────────────────────────────
        if (password.length < 4) {
          setError('Master password must be at least 4 characters');
          setLoading(false);
          return;
        }
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          setLoading(false);
          return;
        }
        await setupMasterPassword(password);
        await seedSampleData(password);
        setSessionPassword(password);
        onUnlock();
      } else {
        // ── Returning user unlock ─────────────────────────────
        const valid = await verifyMasterPassword(password);
        if (valid) {
          await unlockVault(password);
          onUnlock();
        } else {
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
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500" />
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
      </div>
    </div>
  );
}
