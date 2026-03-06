import { useState } from 'react';
import {
    Shield,
    Mail,
    Lock,
    Eye,
    EyeOff,
    ArrowRight,
    RefreshCw,
    CheckCircle,
} from 'lucide-react';
import {
    signUpWithEmail,
    signInWithEmail,
    signInWithGoogle,
    resendVerificationEmail,
    reloadUser,
} from '../auth';

type AuthMode = 'signin' | 'signup' | 'verify';

interface AuthScreenProps {
    onAuthenticated: () => void;
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
    const [mode, setMode] = useState<AuthMode>('signin');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [verifyEmail, setVerifyEmail] = useState('');
    const [resending, setResending] = useState(false);
    const [resent, setResent] = useState(false);

    const handleEmailAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (mode === 'signup') {
                const user = await signUpWithEmail(email, password);
                setVerifyEmail(user.email ?? email);
                setMode('verify');
            } else {
                const user = await signInWithEmail(email, password);
                if (!user.emailVerified) {
                    setVerifyEmail(user.email ?? email);
                    setMode('verify');
                } else {
                    onAuthenticated();
                }
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'An error occurred';
            // Friendly error messages
            if (message.includes('auth/email-already-in-use')) {
                setError('This email is already registered. Try signing in.');
            } else if (message.includes('auth/invalid-credential') || message.includes('auth/wrong-password')) {
                setError('Invalid email or password.');
            } else if (message.includes('auth/user-not-found')) {
                setError('No account found with this email.');
            } else if (message.includes('auth/weak-password')) {
                setError('Password must be at least 6 characters.');
            } else if (message.includes('auth/invalid-email')) {
                setError('Please enter a valid email address.');
            } else if (message.includes('auth/too-many-requests')) {
                setError('Too many attempts. Please try again later.');
            } else {
                setError(message);
            }
        }
        setLoading(false);
    };

    const handleGoogleSignIn = async () => {
        setError('');
        setLoading(true);
        try {
            await signInWithGoogle();
            onAuthenticated();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Google sign-in failed';
            if (message.includes('auth/popup-closed-by-user')) {
                // User closed the popup, don't show error
            } else {
                setError(message);
            }
        }
        setLoading(false);
    };

    const handleResendVerification = async () => {
        setResending(true);
        setResent(false);
        try {
            await resendVerificationEmail();
            setResent(true);
            setTimeout(() => setResent(false), 3000);
        } catch {
            setError('Failed to resend verification email.');
        }
        setResending(false);
    };

    const handleCheckVerification = async () => {
        setError('');
        setLoading(true);
        try {
            const user = await reloadUser();
            if (user?.emailVerified) {
                onAuthenticated();
            } else {
                setError('Email not yet verified. Please check your inbox and click the verification link.');
            }
        } catch {
            setError('Failed to check verification status.');
        }
        setLoading(false);
    };

    // ── Verify Email Screen ──────────────────────────────────────────
    if (mode === 'verify') {
        return (
            <div className="min-h-screen bg-[#1a1a2e] flex flex-col items-center justify-center px-6">
                <div className="w-full max-w-sm flex flex-col items-center">
                    {/* Icon */}
                    <div className="mb-6 flex flex-col items-center">
                        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center mb-4 shadow-lg shadow-cyan-500/20">
                            <Mail className="w-10 h-10 text-white" />
                        </div>
                        <h1 className="text-white mb-1">Check Your Email</h1>
                        <p className="text-gray-400 text-sm text-center mt-1">
                            We sent a verification link to
                        </p>
                        <p className="text-cyan-400 text-sm mt-1">{verifyEmail}</p>
                    </div>

                    <div className="w-full space-y-4">
                        <p className="text-gray-500 text-xs text-center">
                            Click the link in the email to verify your account, then tap the button below.
                        </p>

                        <button
                            onClick={handleCheckVerification}
                            disabled={loading}
                            className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white py-3 rounded-xl disabled:opacity-50 transition-all active:scale-[0.98] shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                                <CheckCircle className="w-4 h-4" />
                            )}
                            {loading ? 'Checking...' : "I've Verified My Email"}
                        </button>

                        <button
                            onClick={handleResendVerification}
                            disabled={resending || resent}
                            className="w-full py-2.5 rounded-xl border border-gray-600 text-gray-300 hover:bg-white/5 transition-colors text-sm disabled:opacity-50"
                        >
                            {resent ? '✓ Verification email sent!' : resending ? 'Sending...' : 'Resend Verification Email'}
                        </button>

                        {error && (
                            <p className="text-red-400 text-sm text-center">{error}</p>
                        )}

                        <button
                            onClick={() => {
                                setMode('signin');
                                setError('');
                            }}
                            className="w-full text-gray-500 text-xs text-center hover:text-gray-300 transition-colors"
                        >
                            ← Back to Sign In
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── Sign In / Sign Up Screen ─────────────────────────────────────
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
                        {mode === 'signup' ? 'Create your account' : 'Sign in to your vault'}
                    </p>
                </div>

                {/* Email/Password Form */}
                <form onSubmit={handleEmailAuth} className="w-full space-y-4">
                    {/* Email */}
                    <div>
                        <label className="text-gray-400 text-xs mb-1.5 block">Email</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500" />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Enter your email"
                                className="w-full bg-[#16213e] border border-gray-700 rounded-xl py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
                                autoFocus
                                required
                            />
                        </div>
                    </div>

                    {/* Password */}
                    <div>
                        <label className="text-gray-400 text-xs mb-1.5 block">Password</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500" />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder={mode === 'signup' ? 'Create a password (min 6 chars)' : 'Enter your password'}
                                className="w-full bg-[#16213e] border border-gray-700 rounded-xl py-3 pl-10 pr-11 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
                                required
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

                    {error && (
                        <p className="text-red-400 text-sm text-center">{error}</p>
                    )}

                    <button
                        type="submit"
                        disabled={loading || !email || !password}
                        className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white py-3 rounded-xl disabled:opacity-50 transition-all active:scale-[0.98] shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                            <ArrowRight className="w-4 h-4" />
                        )}
                        {loading ? 'Please wait...' : mode === 'signup' ? 'Create Account' : 'Sign In'}
                    </button>
                </form>

                {/* Divider */}
                <div className="w-full flex items-center gap-3 my-5">
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-gray-500 text-xs">or</span>
                    <div className="flex-1 h-px bg-white/10" />
                </div>

                {/* Google Sign-In */}
                <button
                    onClick={handleGoogleSignIn}
                    disabled={loading}
                    className="w-full py-3 rounded-xl border border-gray-600 text-white hover:bg-white/5 transition-colors active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-50"
                >
                    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                    Continue with Google
                </button>

                {/* Toggle mode */}
                <div className="mt-6">
                    <button
                        onClick={() => {
                            setMode(mode === 'signin' ? 'signup' : 'signin');
                            setError('');
                        }}
                        className="text-gray-400 text-sm hover:text-cyan-400 transition-colors"
                    >
                        {mode === 'signin'
                            ? "Don't have an account? Sign Up"
                            : 'Already have an account? Sign In'}
                    </button>
                </div>
            </div>
        </div>
    );
}
