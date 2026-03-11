import { useState, useEffect, useRef, useCallback } from 'react';
import jsPDF from 'jspdf';
import {
    Shield,
    Mail,
    Lock,
    Eye,
    EyeOff,
    ArrowRight,
    RefreshCw,
    Check,
    X,
    AlertTriangle,
    AtSign,
    Loader2,
    Download,
} from 'lucide-react';
import {
    sendPasswordlessVerificationLink,
    isVerificationLink,
    finishPasswordlessSignIn,
    finalizeMasterPasswordSetup,
    signInWithDerivedKey,
    signInWithGoogle,
} from '../auth';
import { deriveAuthKey } from '../crypto';
import {
    hasConfiguredVault,
    setupInitialVault,
    setSessionPassword,
    unlockVault,
    resetVault,
} from '../store';
import { checkUsernameAvailable, claimUsername, checkEmailRegistered, registerEmail } from '../firestore';
import { getCurrentUser } from '../auth';

type AuthMode = 'signin' | 'signup' | 'forgot' | 'verify' | 'setup_master' | 'processing_link';

// ── Password strength validation ────────────────────────────────────

interface PasswordCheck {
    label: string;
    passed: boolean;
}

function validatePassword(password: string): PasswordCheck[] {
    return [
        { label: 'At least 8 characters', passed: password.length >= 8 },
        { label: 'One uppercase letter (A-Z)', passed: /[A-Z]/.test(password) },
        { label: 'One lowercase letter (a-z)', passed: /[a-z]/.test(password) },
        { label: 'One number (0-9)', passed: /[0-9]/.test(password) },
        { label: 'One special character (!@#$...)', passed: /[!@#$%^&*()_+\-=\[\]{}|;':",./<>?\\`~]/.test(password) },
    ];
}

function isPasswordStrong(password: string): boolean {
    return validatePassword(password).every((c) => c.passed);
}

function PasswordStrengthIndicator({ password }: { password: string }) {
    const checks = validatePassword(password);
    if (!password) return null;

    return (
        <div className="space-y-1.5 pt-1 mb-3">
            {checks.map((check) => (
                <div key={check.label} className="flex items-center gap-2 text-xs">
                    {check.passed ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                        <X className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    )}
                    <span className={check.passed ? 'text-emerald-400' : 'text-red-400'}>
                        {check.label}
                    </span>
                </div>
            ))}
        </div>
    );
}

// ── Component ────────────────────────────────────────────────────────

interface AuthScreenProps {
    onAuthenticated: () => void;
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
    const [mode, setMode] = useState<AuthMode>('signin');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [isResetFlow, setIsResetFlow] = useState(false);
    const [hasAcknowledged, setHasAcknowledged] = useState(false);

    // ── Username state ─────────────────────────────────────────────────
    const [username, setUsername] = useState('');
    const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
    const usernameCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const VALID_USERNAME = /^[a-z0-9_]{3,20}$/;

    const handleUsernameChange = useCallback((value: string) => {
        const cleaned = value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
        setUsername(cleaned);

        // Clear previous timer
        if (usernameCheckTimer.current) clearTimeout(usernameCheckTimer.current);

        if (!cleaned || cleaned.length < 3) {
            setUsernameStatus(cleaned.length > 0 ? 'invalid' : 'idle');
            return;
        }

        if (!VALID_USERNAME.test(cleaned)) {
            setUsernameStatus('invalid');
            return;
        }

        // Debounced availability check
        setUsernameStatus('checking');
        usernameCheckTimer.current = setTimeout(async () => {
            try {
                const available = await checkUsernameAvailable(cleaned);
                setUsernameStatus(available ? 'available' : 'taken');
            } catch {
                setUsernameStatus('idle');
            }
        }, 400);
    }, []);

    // ── On Mount: Check Magic Link ────────────────────────────────────
    useEffect(() => {
        const checkMagicLink = async () => {
            if (isVerificationLink(window.location.href)) {
                setMode('processing_link');
                try {
                    const user = await finishPasswordlessSignIn(window.location.href);
                    setEmail(user.email ?? '');

                    // Check if they already have a vault (indicates they are resetting)
                    const hasVault = await hasConfiguredVault();
                    setIsResetFlow(hasVault);

                    // Clean the URL bar so they don't refresh the magic link
                    window.history.replaceState(null, '', window.location.pathname);

                    setMode('setup_master');
                } catch (err: unknown) {
                    setError('Verification link is invalid or expired. Please try again.');
                    setMode('signin');
                }
            }
        };
        checkMagicLink();
    }, []);

    // ── Email Login ───────────────────────────────────────────────
    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            // First derive the auth key
            const authKey = await deriveAuthKey(password, email);
            await signInWithDerivedKey(email, authKey);

            // They successfully authenticated. The session password state is updated
            // globally when `LockScreen` is bypassed or explicitly through `store.ts`.
            // Load and decrypt vault data from cloud so it's ready immediately
            await unlockVault(password);
            onAuthenticated();
        } catch (err: unknown) {
            // Generic message for security (don't reveal if user or pass is wrong)
            setError('Incorrect email or Master Password.');
        }
        setLoading(false);
    };

    // ── Request Magic Link (Sign up or Forgot) ────────────────────
    const handleRequestLink = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (mode === 'signup') {
                const exists = await checkEmailRegistered(email);
                if (exists) {
                    setError('EMAIL_EXISTS');
                    setLoading(false);
                    return;
                }
            }

            await sendPasswordlessVerificationLink(email);
            setMode('verify');
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            if (message.includes('auth/email-already-in-use')) {
                setError('EMAIL_EXISTS');
            } else if (message.includes('auth/invalid-email')) {
                setError('Please enter a valid email address.');
            } else if (message.includes('auth/unauthorized-domain')) {
                setError('This domain is not authorized. Please contact the admin.');
            } else {
                setError('Failed: ' + message);
            }
        }
        setLoading(false);
    };

    // ── Google Sign-In ────────────────────────────────────────────────
    const handleGoogleSignIn = async () => {
        setError('');
        setGoogleLoading(true);

        // Safety timeout: if popup hangs or user closes it, reset after 10s
        const safetyTimeout = setTimeout(() => {
            setGoogleLoading(false);
        }, 10_000);

        try {
            const user = await signInWithGoogle();
            clearTimeout(safetyTimeout);
            setEmail(user.email ?? '');

            // Check if this Google user already has a vault
            const hasVault = await hasConfiguredVault();

            if (hasVault) {
                // Returning user — they already set up a vault before.
                // Go to the main app where AppShell will show LockScreen.
                onAuthenticated();
            } else {
                // New user — needs to create a master password for encryption.
                setMode('setup_master');
            }
        } catch (err: unknown) {
            clearTimeout(safetyTimeout);
            const message = err instanceof Error ? err.message : '';
            if (message.includes('auth/popup-closed-by-user')) {
                // User closed the popup, not an error
            } else if (message.includes('auth/cancelled-popup-request')) {
                // Duplicate popup, ignore
            } else {
                setError('Google sign-in failed. Please try again.');
            }
        }
        setGoogleLoading(false);
    };

    const cancelGoogleSignIn = () => {
        setGoogleLoading(false);
    };

    // ── Generate Dynamic PDF ─────────────────────────────────────────
    const handleDownloadPDF = () => {
        if (!password) return;

        const doc = new jsPDF();

        // Add styling and text to the PDF
        doc.setFillColor(26, 26, 46); // Dark blue background color (#1a1a2e)
        doc.rect(0, 0, 210, 297, 'F'); // Fill the entire A4 page

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(24);
        doc.text("SecureVault Emergency Kit", 20, 30);

        doc.setFontSize(12);
        doc.setTextColor(156, 163, 175); // gray-400
        doc.text("Keep this document in a safe, physically secure location.", 20, 45);
        doc.text("If you lose your Master Password, your vault cannot be recovered.", 20, 52);

        doc.setDrawColor(55, 65, 81); // gray-700
        doc.line(20, 60, 190, 60);

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);

        doc.text("Account Details:", 20, 80);

        doc.setFontSize(12);
        doc.setTextColor(6, 182, 212); // cyan-500
        doc.text(`Email: ${email}`, 20, 95);

        doc.setTextColor(255, 255, 255);
        doc.text(`Master Password: ${password}`, 20, 110);

        doc.setTextColor(156, 163, 175); // gray-400
        doc.setFontSize(10);
        const date = new Date().toLocaleString();
        doc.text(`Generated on: ${date}`, 20, 130);

        doc.save("SecureVault_Emergency_Kit.pdf");
    };

    // ── Master Password Setup (Flow 1 & 3) ────────────────────────
    const handleSetupMaster = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!isPasswordStrong(password)) {
            setError('Please fix all password requirements below.');
            return;
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        // Username validation (only for new signups, not reset)
        if (!isResetFlow) {
            if (!username || !VALID_USERNAME.test(username)) {
                setError('Please choose a valid username (3-20 chars, lowercase letters, numbers, underscores).');
                return;
            }
            if (usernameStatus !== 'available') {
                setError('Please choose an available username.');
                return;
            }
            if (!hasAcknowledged) {
                setError('Please acknowledge the disclaimer before continuing.');
                return;
            }
        }

        setLoading(true);

        try {
            if (isResetFlow) {
                // Warning! They are resetting their existing vault. Destroy old data.
                await resetVault();
            }

            // Derive Auth Key and update Firebase Auth password
            const authKey = await deriveAuthKey(password, email);
            await finalizeMasterPasswordSetup(authKey);

            // Generate the encrypted vault and push to Firestore
            await setupInitialVault(password);

            // Claim username for new signups
            if (!isResetFlow && username) {
                const user = getCurrentUser();
                if (user) {
                    await claimUsername(user.uid, username);
                }
            }

            // Register this email as 'used' via hashed Firestore document
            await registerEmail(email);

            setSessionPassword(password);
            onAuthenticated();
        } catch {
            setError('Failed to create vault. Please check your connection and try again.');
        }
        setLoading(false);
    };


    // ── Processing Link Screen ───────────────────────────────────────
    if (mode === 'processing_link') {
        return (
            <div className="min-h-screen bg-[#1a1a2e] flex flex-col items-center justify-center px-6">
                <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-gray-400">Verifying secure link...</p>
            </div>
        );
    }

    // ── Verify Email Screen ──────────────────────────────────────────
    if (mode === 'verify') {
        return (
            <div className="min-h-screen bg-[#1a1a2e] flex flex-col items-center justify-center px-6">
                <div className="w-full max-w-sm flex flex-col items-center">
                    <div className="mb-6 flex flex-col items-center">
                        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center mb-4 shadow-lg shadow-cyan-500/20">
                            <Mail className="w-10 h-10 text-white" />
                        </div>
                        <h1 className="text-white mb-1">Check Your Email</h1>
                        <p className="text-gray-400 text-sm text-center mt-1">
                            We sent a secure link to
                        </p>
                        <p className="text-cyan-400 text-sm mt-1">{email}</p>
                    </div>

                    <div className="w-full space-y-4 text-center pb-4">
                        <p className="text-gray-500 text-xs text-center border border-gray-700/50 bg-[#16213e] rounded-xl p-4 shadow-inner">
                            If you're using this device, <strong className="text-gray-300">click the link in the email</strong> to verify your identity and install your vault.
                        </p>

                        <p className="text-gray-500 text-[10px] mt-2 mb-4">
                            You can safely close this app and open your email client.
                        </p>

                        <button
                            onClick={() => {
                                setMode('signin');
                                setError('');
                            }}
                            className="text-gray-500 text-xs hover:text-gray-300 transition-colors mt-6 pt-4 border-t border-gray-700/50 w-full inline-block"
                        >
                            ← Back to Sign In
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── Set up Master Password Screen ───────────────────────────────
    if (mode === 'setup_master') {
        return (
            <div className="min-h-screen bg-[#1a1a2e] flex flex-col items-center py-10 px-6 overflow-y-auto">
                <div className="w-full max-w-sm flex flex-col items-center">
                    <div className="mb-6 flex flex-col items-center text-center">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center mb-4 shadow-lg shadow-cyan-500/20">
                            <Shield className="w-7 h-7 text-white" />
                        </div>
                        <h1 className="text-white text-xl mb-1">{isResetFlow ? 'Reset Master Password' : 'Create Master Password'}</h1>
                        <p className="text-gray-400 text-xs text-center mt-2 max-w-[280px]">
                            Your Master Password is never stored anywhere. If you forget it, your vault cannot be recovered by anyone — not even us.
                        </p>
                    </div>

                    {isResetFlow && (
                        <div className="mb-6 bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex gap-3 text-red-400 text-xs items-start">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <p>Because your Master Password is never stored, we cannot recover your existing vault. <b>Continuing will permanently delete all your saved passwords.</b> Only proceed if you accept this.</p>
                        </div>
                    )}

                    {!isResetFlow && (
                        <div className="mb-6 w-full bg-[#16213e] border border-red-500/30 rounded-xl overflow-hidden shadow-lg shadow-red-500/10">
                            <div className="bg-red-500/10 px-4 py-3 border-b border-red-500/20 flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                                <h3 className="text-red-400 font-medium text-sm">Critical Security Notice</h3>
                            </div>
                            <div className="p-4 space-y-4">
                                <p className="text-gray-300 text-sm leading-relaxed text-left">
                                    SecureVault uses <strong>Zero-Knowledge Encryption</strong>. This means we do not store your Master Password and <strong>cannot reset it if you forget it.</strong>
                                </p>

                                <div className="bg-[#1a1a2e] p-3 rounded-lg border border-cyan-500/20">
                                    <h4 className="text-cyan-400 text-xs font-semibold mb-2">Recommended Setup:</h4>
                                    <ol className="text-gray-400 text-xs space-y-2 list-decimal list-inside text-left">
                                        <li>Download your Emergency Kit PDF.</li>
                                        <li>Write your new Master Password on it.</li>
                                        <li>Store it in a physically secure location.</li>
                                    </ol>
                                </div>
                            </div>
                        </div>
                    )}

                    <form onSubmit={handleSetupMaster} className="w-full space-y-4 pb-8">
                        <div>
                            <label className="text-gray-400 text-xs mb-1.5 block">Master Password</label>
                            <div className="relative mb-2">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500" />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Create a strong password"
                                    className="w-full bg-[#16213e] border border-gray-700 rounded-xl py-3 pl-10 pr-11 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
                                    required
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
                            <PasswordStrengthIndicator password={password} />
                        </div>

                        <div>
                            <label className="text-gray-400 text-xs mb-1.5 block">Confirm Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500" />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Confirm password"
                                    className="w-full bg-[#16213e] border border-gray-700 rounded-xl py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
                                    required
                                />
                            </div>
                        </div>

                        {/* Username field — only for new signups */}
                        {!isResetFlow && (
                            <div>
                                <label className="text-gray-400 text-xs mb-1.5 block">Choose a Username</label>
                                <div className="relative">
                                    <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500" />
                                    <input
                                        type="text"
                                        value={username}
                                        onChange={(e) => handleUsernameChange(e.target.value)}
                                        placeholder="e.g. john_doe123"
                                        className={`w-full bg-[#16213e] border rounded-xl py-3 pl-10 pr-11 text-white placeholder-gray-500 focus:outline-none transition-colors ${usernameStatus === 'available' ? 'border-emerald-500'
                                            : usernameStatus === 'taken' || usernameStatus === 'invalid' ? 'border-red-500'
                                                : 'border-gray-700 focus:border-cyan-500'
                                            }`}
                                        maxLength={20}
                                        autoComplete="off"
                                    />
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                        {usernameStatus === 'checking' && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
                                        {usernameStatus === 'available' && <Check className="w-4 h-4 text-emerald-400" />}
                                        {usernameStatus === 'taken' && <X className="w-4 h-4 text-red-400" />}
                                        {usernameStatus === 'invalid' && <X className="w-4 h-4 text-red-400" />}
                                    </div>
                                </div>
                                <div className="mt-1.5 text-xs">
                                    {usernameStatus === 'idle' && username.length === 0 && (
                                        <p className="text-gray-500">Lowercase letters, numbers, underscores. 3-20 characters.</p>
                                    )}
                                    {usernameStatus === 'invalid' && (
                                        <p className="text-red-400">Must be 3-20 characters. Only lowercase letters, numbers, and underscores.</p>
                                    )}
                                    {usernameStatus === 'available' && (
                                        <p className="text-emerald-400">✓ Username is available!</p>
                                    )}
                                    {usernameStatus === 'taken' && (
                                        <p className="text-red-400">✗ Username is already taken.</p>
                                    )}
                                    {usernameStatus === 'checking' && (
                                        <p className="text-gray-400">Checking availability...</p>
                                    )}
                                </div>
                            </div>
                        )}

                        {error && (
                            <p className="text-red-400 text-sm text-center bg-red-500/10 border border-red-500/20 py-2 rounded-lg">{error}</p>
                        )}

                        {!isResetFlow && (
                            <label className="flex items-start gap-3 mt-4 mb-2 cursor-pointer group">
                                <div className="relative flex items-center justify-center mt-0.5">
                                    <input
                                        type="checkbox"
                                        checked={hasAcknowledged}
                                        onChange={(e) => setHasAcknowledged(e.target.checked)}
                                        className="peer appearance-none w-5 h-5 border-2 border-gray-600 rounded-md bg-[#16213e] checked:bg-cyan-500 checked:border-cyan-500 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                                    />
                                    <Check className="absolute w-3.5 h-3.5 text-[#1a1a2e] opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" />
                                </div>
                                <span className="text-gray-400 text-xs leading-snug group-hover:text-gray-300 transition-colors text-left flex-1">
                                    I understand that my Master Password cannot be recovered, and I have saved it in a secure location.
                                </span>
                            </label>
                        )}

                        {!isResetFlow && (
                            <button
                                type="button"
                                onClick={handleDownloadPDF}
                                disabled={!hasAcknowledged || !isPasswordStrong(password)}
                                className="w-full flex items-center justify-center gap-2 bg-[#16213e] hover:bg-[#1f2937] border border-gray-700 disabled:opacity-50 text-white py-3 rounded-xl transition-colors mt-4 text-sm"
                            >
                                <Download className="w-4 h-4 text-gray-400" />
                                Download PDF Emergency Kit
                            </button>
                        )}

                        <button
                            type="submit"
                            disabled={loading || !password || !confirmPassword || !isPasswordStrong(password) || (!isResetFlow && (usernameStatus !== 'available' || !hasAcknowledged))}
                            className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white py-3 rounded-xl disabled:opacity-50 transition-all active:scale-[0.98] mt-4 shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2"
                        >
                            {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
                            {loading ? 'Securing vault...' : isResetFlow ? 'Reset and Continue' : 'Create Vault'}
                        </button>
                    </form>
                </div>
            </div>
        )
    }

    // ── Sign In / Request Link Screen ─────────────────────────────────────
    const isLogin = mode === 'signin';
    const isSignup = mode === 'signup';

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
                        Zero-Knowledge Encryption
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={isLogin ? handleLogin : handleRequestLink} className="w-full space-y-4">
                    {/* Email */}
                    <div>
                        <label className="text-gray-400 text-xs mb-1.5 block">Email Address</label>
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

                    {/* Master Password - Only for Login */}
                    {isLogin && (
                        <div>
                            <div className="flex justify-between items-center mb-1.5">
                                <label className="text-gray-400 text-xs block">Master Password</label>
                                <button type="button" onClick={() => { setMode('forgot'); setError(''); setPassword(''); }} className="text-cyan-400 text-[10px] hover:underline">Forgot Master Password?</button>
                            </div>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500" />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Enter your Master Password"
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
                    )}

                    {error && error !== 'EMAIL_EXISTS' && (
                        <p className="text-red-400 text-sm text-center my-2 bg-red-500/10 border border-red-500/20 py-2 rounded-lg">{error}</p>
                    )}

                    {error === 'EMAIL_EXISTS' && (
                        <div className="text-center my-2 bg-red-500/10 border border-red-500/20 py-3 px-4 rounded-lg">
                            <p className="text-red-400 text-sm">An account with this email already exists.</p>
                            <button
                                type="button"
                                onClick={() => { setMode('signin'); setError(''); }}
                                className="text-cyan-400 text-sm mt-1 hover:underline"
                            >
                                Sign In instead →
                            </button>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading || !email || (isLogin && !password)}
                        className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white py-3 rounded-xl disabled:opacity-50 transition-all active:scale-[0.98] shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 mt-2"
                    >
                        {loading ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                            <ArrowRight className="w-4 h-4" />
                        )}
                        {loading ? 'Please wait...' : isLogin ? 'Open Vault' : isSignup ? 'Create Account' : 'Send Reset Link'}
                    </button>
                </form>

                {/* Google Sign-In Divider + Button */}
                <div className="w-full mt-5">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="flex-1 h-px bg-gray-700/50" />
                        <span className="text-gray-500 text-xs">or</span>
                        <div className="flex-1 h-px bg-gray-700/50" />
                    </div>
                    <button
                        onClick={handleGoogleSignIn}
                        disabled={loading || googleLoading}
                        className="w-full flex items-center justify-center gap-3 bg-[#16213e] border border-gray-700/50 text-white py-3 rounded-xl hover:bg-white/5 active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                        {googleLoading ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                            <svg className="w-5 h-5" viewBox="0 0 24 24">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                            </svg>
                        )}
                        {googleLoading ? 'Waiting for Google...' : 'Continue with Google'}
                    </button>
                    {googleLoading && (
                        <button
                            onClick={cancelGoogleSignIn}
                            className="text-gray-500 text-xs hover:text-gray-300 transition-colors mt-2"
                        >
                            Cancel
                        </button>
                    )}
                </div>

                {/* Toggle mode */}
                <div className="mt-8">
                    <button
                        onClick={() => {
                            setMode(isLogin ? 'signup' : 'signin');
                            setError('');
                            setPassword('');
                        }}
                        className="text-gray-400 text-sm hover:text-cyan-400 transition-colors"
                    >
                        {isLogin
                            ? "New to SecureVault? Create Account"
                            : 'Already have an account? Sign In'}
                    </button>
                    {!isLogin && (
                        <p className="text-gray-500 text-[10px] text-center mt-3 max-w-[260px]">
                            We will send a secure link to your email to verify your identity.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
