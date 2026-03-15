import { useState, useRef, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import { ArrowLeft, Eye, EyeOff, ChevronDown, KeyRound, Lock, Upload, Download, LogOut, FileText, AtSign, Loader2, Check, X, Pencil, Share2, ShieldAlert, MonitorOff, Trash2 } from 'lucide-react';
import { getSettings, saveSettings, changeMasterPassword, bulkAddVaultItems, exportVaultItemsAsCsv, type AppSettings, type ItemType, verifyMasterPassword, resetVault } from '../store';
import { signOut, sendPasswordlessVerificationLink } from '../auth';
import { getUsernameForUid, checkUsernameAvailable, changeUsername } from '../firestore';
import { isPasswordStrong, PasswordStrengthIndicator } from '../utils/password';
import { toast } from 'sonner';
import type { User } from 'firebase/auth';

const TIMEOUT_OPTIONS = [
    { label: '1 minute', value: 1 },
    { label: '2 minutes', value: 2 },
    { label: '5 minutes', value: 5 },
    { label: '15 minutes', value: 15 },
    { label: '30 minutes', value: 30 },
    { label: 'Never', value: 0 },
];

interface OutletContext {
    onLock: () => void;
    onSignOut: () => void;
    user: User;
}

export function Settings() {
    const navigate = useNavigate();
    const { onSignOut, user } = useOutletContext<OutletContext>();
    const [settings, setSettings] = useState<AppSettings>({
        autoLockTimeout: 5,
        lockOnHide: true,
        allowScreenshots: true,
    });

    // Load settings asynchronously from IndexedDB on mount
    useEffect(() => {
        getSettings().then(setSettings);
    }, []);

    // Password change form
    const [showPasswordForm, setShowPasswordForm] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPasswords, setShowPasswords] = useState(false);
    const [changeError, setChangeError] = useState('');
    const [changeSuccess, setChangeSuccess] = useState(false);
    const [changingPassword, setChangingPassword] = useState(false);

    // Delete data form
    const [showDeleteData, setShowDeleteData] = useState(false);
    const [deleteDataPassword, setDeleteDataPassword] = useState('');
    const [showDeletePassword, setShowDeletePassword] = useState(false);
    const [deleteDataError, setDeleteDataError] = useState('');
    const [deletingData, setDeletingData] = useState(false);

    // Timeout dropdown
    const [showTimeoutDropdown, setShowTimeoutDropdown] = useState(false);

    // CSV import
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [importing, setImporting] = useState(false);
    const [importPreview, setImportPreview] = useState<{
        count: number;
        items: Array<{ title: string; username: string; password: string; url: string }>;
    } | null>(null);

    // Username state
    const [currentUsername, setCurrentUsername] = useState<string | null>(null);
    const [editingUsername, setEditingUsername] = useState(false);
    const [newUsername, setNewUsername] = useState('');
    const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
    const usernameCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [savingUsername, setSavingUsername] = useState(false);

    const VALID_USERNAME = /^[a-z0-9_]{3,20}$/;

    // Load username on mount
    useEffect(() => {
        if (user?.uid) {
            getUsernameForUid(user.uid).then(u => setCurrentUsername(u)).catch(() => { });
        }
    }, [user?.uid]);

    const handleNewUsernameChange = (value: string) => {
        const cleaned = value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
        setNewUsername(cleaned);

        if (usernameCheckTimer.current) clearTimeout(usernameCheckTimer.current);

        if (!cleaned || cleaned.length < 3) {
            setUsernameStatus(cleaned.length > 0 ? 'invalid' : 'idle');
            return;
        }

        if (!VALID_USERNAME.test(cleaned)) {
            setUsernameStatus('invalid');
            return;
        }

        if (cleaned === currentUsername) {
            setUsernameStatus('idle');
            return;
        }

        setUsernameStatus('checking');
        usernameCheckTimer.current = setTimeout(async () => {
            try {
                const available = await checkUsernameAvailable(cleaned);
                setUsernameStatus(available ? 'available' : 'taken');
            } catch {
                setUsernameStatus('idle');
            }
        }, 400);
    };

    const handleSaveUsername = async () => {
        if (!user?.uid || !newUsername || usernameStatus !== 'available') return;
        setSavingUsername(true);
        try {
            if (currentUsername) {
                await changeUsername(user.uid, currentUsername, newUsername);
            } else {
                // User didn't have a username before (legacy user)
                const { claimUsername } = await import('../firestore');
                await claimUsername(user.uid, newUsername);
            }
            setCurrentUsername(newUsername);
            setEditingUsername(false);
            setNewUsername('');
            setUsernameStatus('idle');
            toast.success('Username updated!');
        } catch {
            toast.error('Failed to update username. It may have just been taken.');
        }
        setSavingUsername(false);
    };

    const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
        const updated = { ...settings, [key]: value };
        setSettings(updated);
        saveSettings(updated); // fire-and-forget async
    };

    const handleChangePassword = async () => {
        setChangeError('');
        setChangeSuccess(false);

        if (newPassword.length < 4) {
            setChangeError('New password must be at least 4 characters');
            return;
        }
        if (newPassword !== confirmPassword) {
            setChangeError('New passwords do not match');
            return;
        }
        if (!isPasswordStrong(newPassword)) {
            setChangeError('New password does not meet complexity requirements');
            return;
        }
        if (currentPassword === newPassword) {
            setChangeError('New password must be different from current password');
            return;
        }

        setChangingPassword(true);
        try {
            // changeMasterPassword handles re-auth internally with old password
            const success = await changeMasterPassword(currentPassword, newPassword);
            if (success) {
                toast.success('Master password changed. Please log in again.');
                await handleSignOut();
            } else {
                setChangeError('Failed to change password');
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            if (message.includes('auth/wrong-password') || message.includes('auth/invalid-credential')) {
                setChangeError('Current password is incorrect.');
            } else if (message.includes('auth/requires-recent-login')) {
                setChangeError('Session expired. Please sign out and sign in again before changing your password.');
            } else {
                setChangeError('An error occurred. Please try again.');
            }
        }
        setChangingPassword(false);
    };

    const handleForgotPassword = async () => {
        if (!user?.email) return;
        try {
            await sendPasswordlessVerificationLink(user.email);
            toast.success('Password reset link sent to your email.');
            await handleSignOut();
        } catch {
            toast.error('Failed to send reset link.');
        }
    };

    const handleDeleteData = async () => {
        setDeleteDataError('');
        if (!deleteDataPassword) {
            setDeleteDataError('Please enter your master password');
            return;
        }
        setDeletingData(true);
        try {
            const verified = await verifyMasterPassword(deleteDataPassword);
            if (!verified) {
                setDeleteDataError('Incorrect password');
                setDeletingData(false);
                return;
            }
            await resetVault();
            toast.success('All data has been deleted');
            await handleSignOut();
        } catch {
            setDeleteDataError('An error occurred while deleting data');
            setDeletingData(false);
        }
    };

    const handleShareApp = () => {
        if (navigator.share) {
            navigator.share({
                title: 'SecureVault',
                text: 'Check out SecureVault, a secure, zero-knowledge password manager!',
                url: window.location.origin
            }).catch(() => { });
        } else {
            navigator.clipboard.writeText(window.location.origin);
            toast.success('App link copied to clipboard!');
        }
    };

    // ── CSV Import ───────────────────────────────────────────────────

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            parseCsv(text);
        };
        reader.readAsText(file);

        // Reset input so the same file can be selected again
        e.target.value = '';
    };

    const parseCsv = (text: string) => {
        const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
        if (lines.length < 2) {
            toast.error('CSV file appears to be empty');
            return;
        }

        // Parse header
        const header = lines[0].toLowerCase().split(',').map((h) => h.trim().replace(/"/g, ''));

        // Find column indices — support multiple CSV formats
        const nameIdx = header.findIndex((h) => ['name', 'title', 'site', 'site name'].includes(h));
        const urlIdx = header.findIndex((h) => ['url', 'website', 'login_uri', 'login uri'].includes(h));
        const usernameIdx = header.findIndex((h) => ['username', 'user', 'login_username', 'login username', 'email'].includes(h));
        const passwordIdx = header.findIndex((h) => ['password', 'login_password', 'login password'].includes(h));

        if (passwordIdx === -1) {
            toast.error('CSV file must have a "password" column');
            return;
        }

        const parsed: Array<{ title: string; username: string; password: string; url: string }> = [];

        for (let i = 1; i < lines.length; i++) {
            const values = parseCsvLine(lines[i]);
            const pw = values[passwordIdx]?.trim();
            if (!pw) continue;

            const url = urlIdx !== -1 ? values[urlIdx]?.trim() ?? '' : '';
            let title = nameIdx !== -1 ? values[nameIdx]?.trim() ?? '' : '';

            // If no title, derive from URL
            if (!title && url) {
                try {
                    title = new URL(url).hostname.replace('www.', '');
                } catch {
                    title = url;
                }
            }
            if (!title) title = `Import ${i}`;

            parsed.push({
                title,
                username: usernameIdx !== -1 ? values[usernameIdx]?.trim() ?? '' : '',
                password: pw,
                url,
            });
        }

        if (parsed.length === 0) {
            toast.error('No valid entries found in CSV');
            return;
        }

        setImportPreview({ count: parsed.length, items: parsed });
    };

    // Simple CSV line parser that handles quoted fields
    const parseCsvLine = (line: string): string[] => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current);
        return result;
    };

    const confirmImport = async () => {
        if (!importPreview) return;
        setImporting(true);

        try {
            const vaultItems = importPreview.items.map((item) => {
                // Guess the type from the URL
                let type: ItemType = 'Other';
                if (item.url) {
                    type = 'Website';
                }
                return {
                    title: item.title,
                    username: item.username,
                    password: item.password,
                    type,
                    url: item.url,
                    note: '',
                };
            });

            const count = await bulkAddVaultItems(vaultItems);
            toast.success(`Successfully imported ${count} passwords`);
            setImportPreview(null);
        } catch {
            toast.error('Failed to import passwords');
        }
        setImporting(false);
    };

    const handleSignOut = async () => {
        try {
            await signOut();
            onSignOut();
        } catch {
            toast.error('Failed to sign out');
        }
    };

    const currentTimeoutLabel = TIMEOUT_OPTIONS.find((o) => o.value === settings.autoLockTimeout)?.label ?? '5 minutes';

    return (
        <div className="min-h-screen bg-[#1a1a2e] flex flex-col">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-white/5">
                <div className="flex items-center gap-3 px-4 py-3">
                    <button onClick={() => navigate('/')} className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <h2 className="text-white">Settings</h2>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
                {/* Account Section */}
                <div>
                    <span className="text-gray-500 text-xs uppercase tracking-wider px-1 mb-2 block">Account</span>
                    <div className="bg-[#16213e] rounded-xl p-4 space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
                                <span className="text-cyan-400 text-sm font-medium">
                                    {(user.displayName?.[0] || user.email?.[0] || 'U').toUpperCase()}
                                </span>
                            </div>
                            <div className="flex-1 min-w-0">
                                {user.displayName && (
                                    <p className="text-white text-sm truncate">{user.displayName}</p>
                                )}
                                <p className="text-gray-400 text-xs truncate">{user.email}</p>
                            </div>
                        </div>
                        <button
                            onClick={handleSignOut}
                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-colors text-sm"
                        >
                            <LogOut className="w-4 h-4" />
                            Sign Out
                        </button>

                        {/* Username Section */}
                        <div className="pt-3 border-t border-white/5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                                        <AtSign className="w-4 h-4 text-purple-400" />
                                    </div>
                                    <div>
                                        <span className="text-white text-sm block">Username</span>
                                        {currentUsername ? (
                                            <span className="text-gray-400 text-xs">@{currentUsername}</span>
                                        ) : (
                                            <span className="text-gray-500 text-xs italic">Not set</span>
                                        )}
                                    </div>
                                </div>
                                {(!currentUsername) && (
                                    <button
                                        onClick={() => {
                                            setEditingUsername(!editingUsername);
                                            setNewUsername(currentUsername || '');
                                            setUsernameStatus('idle');
                                        }}
                                        className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-gray-200 transition-colors"
                                    >
                                        <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>

                            {editingUsername && (
                                <div className="mt-3 space-y-2">
                                    <div className="relative">
                                        <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                        <input
                                            type="text"
                                            value={newUsername}
                                            onChange={(e) => handleNewUsernameChange(e.target.value)}
                                            placeholder="new_username"
                                            className={`w-full bg-[#1a1a2e] border rounded-xl py-2.5 pl-9 pr-10 text-white text-sm placeholder-gray-500 focus:outline-none transition-colors ${usernameStatus === 'available' ? 'border-emerald-500'
                                                : usernameStatus === 'taken' || usernameStatus === 'invalid' ? 'border-red-500'
                                                    : 'border-gray-700 focus:border-cyan-500'
                                                }`}
                                            maxLength={20}
                                            autoComplete="off"
                                        />
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                            {usernameStatus === 'checking' && <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" />}
                                            {usernameStatus === 'available' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                                            {(usernameStatus === 'taken' || usernameStatus === 'invalid') && <X className="w-3.5 h-3.5 text-red-400" />}
                                        </div>
                                    </div>

                                    <div className="text-[11px]">
                                        {usernameStatus === 'available' && <p className="text-emerald-400">✓ Available</p>}
                                        {usernameStatus === 'taken' && <p className="text-red-400">✗ Already taken</p>}
                                        {usernameStatus === 'invalid' && <p className="text-red-400">3-20 chars, lowercase, numbers, underscores only</p>}
                                    </div>

                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => { setEditingUsername(false); setNewUsername(''); setUsernameStatus('idle'); }}
                                            className="flex-1 py-2 rounded-xl border border-gray-600 text-gray-300 hover:bg-white/5 transition-colors text-xs"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleSaveUsername}
                                            disabled={savingUsername || usernameStatus !== 'available'}
                                            className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 text-white py-2 rounded-xl disabled:opacity-50 transition-all text-xs flex items-center justify-center gap-1"
                                        >
                                            {savingUsername ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                                            {savingUsername ? 'Saving...' : 'Save'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Security Section */}
                <div>
                    <span className="text-gray-500 text-xs uppercase tracking-wider px-1 mb-2 block">Security</span>
                    <div className="bg-[#16213e] rounded-xl p-4 space-y-4">
                        {/* Change Master Password */}
                        <div>
                            <button
                                onClick={() => setShowPasswordForm(!showPasswordForm)}
                                className="w-full flex items-center justify-between"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                                        <KeyRound className="w-4 h-4 text-cyan-400" />
                                    </div>
                                    <span className="text-white text-sm">Change Master Password</span>
                                </div>
                                <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${showPasswordForm ? 'rotate-180' : ''}`} />
                            </button>

                            {changeSuccess && (
                                <p className="text-green-400 text-sm mt-3">Master password changed successfully!</p>
                            )}

                            {showPasswordForm && (
                                <div className="mt-4 space-y-4 pt-4 border-t border-white/5">
                                    {/* Current Password */}
                                    <div>
                                        <label className="text-gray-400 text-xs mb-1.5 block">Current Password</label>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500" />
                                            <input
                                                type={showPasswords ? 'text' : 'password'}
                                                value={currentPassword}
                                                onChange={(e) => setCurrentPassword(e.target.value)}
                                                placeholder="Enter current password"
                                                className="w-full bg-[#1a1a2e] border border-gray-700/50 rounded-xl py-3 pl-10 pr-11 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPasswords(!showPasswords)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                                            >
                                                {showPasswords ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* New Password */}
                                    <div>
                                        <label className="text-gray-400 text-xs mb-1.5 block">New Password</label>
                                        <div className="relative">
                                            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500" />
                                            <input
                                                type={showPasswords ? 'text' : 'password'}
                                                value={newPassword}
                                                onChange={(e) => setNewPassword(e.target.value)}
                                                placeholder="Enter new password"
                                                className="w-full bg-[#1a1a2e] border border-gray-700/50 rounded-xl py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
                                            />
                                        </div>
                                        {newPassword && <PasswordStrengthIndicator password={newPassword} />}
                                    </div>

                                    {/* Confirm New Password */}
                                    <div>
                                        <label className="text-gray-400 text-xs mb-1.5 block">Confirm New Password</label>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500" />
                                            <input
                                                type={showPasswords ? 'text' : 'password'}
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                placeholder="Confirm new password"
                                                className="w-full bg-[#1a1a2e] border border-gray-700/50 rounded-xl py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
                                            />
                                        </div>
                                    </div>

                                    {changeError && (
                                        <p className="text-red-400 text-sm">{changeError}</p>
                                    )}

                                    <button
                                        onClick={handleChangePassword}
                                        disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
                                        className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white py-3 rounded-xl disabled:opacity-50 transition-all active:scale-[0.98] shadow-lg shadow-cyan-500/20"
                                    >
                                        {changingPassword ? 'Changing...' : 'Change Password'}
                                    </button>

                                    {/* Password Complexity Indicator can also be shown if needed, but not required now */}
                                    <div className="pt-4 mt-2 border-t border-white/5 text-center">
                                        <p className="text-gray-400 text-xs mb-2">Forgot your current password?</p>
                                        <button
                                            onClick={handleForgotPassword}
                                            className="text-cyan-400 text-xs hover:text-cyan-300 transition-colors"
                                        >
                                            Send Password Reset Link
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Auto-Lock Section */}
                <div>
                    <span className="text-gray-500 text-xs uppercase tracking-wider px-1 mb-2 block">Auto-Lock</span>
                    <div className="bg-[#16213e] rounded-xl p-4 space-y-4">
                        {/* Timeout Dropdown */}
                        <div>
                            <label className="text-gray-400 text-xs mb-1.5 block">Lock after inactivity</label>
                            <div className="relative">
                                <button
                                    onClick={() => setShowTimeoutDropdown(!showTimeoutDropdown)}
                                    className="w-full bg-[#1a1a2e] border border-gray-700/50 rounded-xl py-3 px-4 text-white text-left flex items-center justify-between focus:outline-none focus:border-cyan-500/50"
                                >
                                    <span className="text-sm">{currentTimeoutLabel}</span>
                                    <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${showTimeoutDropdown ? 'rotate-180' : ''}`} />
                                </button>
                                {showTimeoutDropdown && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-[#16213e] border border-gray-700/50 rounded-xl overflow-hidden z-20 shadow-xl">
                                        {TIMEOUT_OPTIONS.map((opt) => (
                                            <button
                                                key={opt.value}
                                                onClick={() => {
                                                    updateSetting('autoLockTimeout', opt.value);
                                                    setShowTimeoutDropdown(false);
                                                }}
                                                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-white/5 transition-colors ${opt.value === settings.autoLockTimeout ? 'text-cyan-400 bg-white/5' : 'text-white'}`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Lock on screen hide toggle */}
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-white text-sm">Lock on screen hide</p>
                                <p className="text-gray-500 text-xs mt-0.5">Lock vault when switching tabs</p>
                            </div>
                            <button
                                onClick={() => updateSetting('lockOnHide', !settings.lockOnHide)}
                                className={`relative w-11 h-6 rounded-full transition-colors ${settings.lockOnHide ? 'bg-cyan-500' : 'bg-gray-600'}`}
                            >
                                <span
                                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${settings.lockOnHide ? 'translate-x-5' : 'translate-x-0'}`}
                                />
                            </button>
                        </div>

                        {/* Block Screenshots toggle */}
                        <div className="flex items-center justify-between pt-4 border-t border-white/5">
                            <div>
                                <p className="text-white text-sm">Block screenshots</p>
                                <p className="text-gray-500 text-xs mt-0.5">Prevent screenshots & screen recording</p>
                            </div>
                            <button
                                onClick={() => {
                                    updateSetting('allowScreenshots', !settings.allowScreenshots);
                                    if (settings.allowScreenshots) {
                                        toast.info('Screenshot blocking requires the Android wrapper to be installed.');
                                    }
                                }}
                                className={`relative w-11 h-6 rounded-full transition-colors ${!settings.allowScreenshots ? 'bg-cyan-500' : 'bg-gray-600'}`}
                            >
                                <span
                                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${!settings.allowScreenshots ? 'translate-x-5' : 'translate-x-0'}`}
                                />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Data Section — CSV Import */}
                <div>
                    <span className="text-gray-500 text-xs uppercase tracking-wider px-1 mb-2 block">Data</span>
                    <div className="bg-[#16213e] rounded-xl p-4 space-y-4">
                        <div>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={importing}
                                className="w-full flex items-center gap-3"
                            >
                                <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                                    <Upload className="w-4 h-4 text-purple-400" />
                                </div>
                                <div className="text-left">
                                    <span className="text-white text-sm block">Import Passwords</span>
                                    <span className="text-gray-500 text-xs">From Chrome CSV export</span>
                                </div>
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv"
                                onChange={handleFileSelect}
                                className="hidden"
                            />
                        </div>

                        {/* Export Passwords */}
                        <div className="pt-3 border-t border-white/5">
                            <button
                                onClick={() => {
                                    const csv = exportVaultItemsAsCsv();
                                    if (!csv || csv.split('\n').length <= 1) {
                                        toast.error('No passwords to export');
                                        return;
                                    }
                                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `securevault-export-${new Date().toISOString().slice(0, 10)}.csv`;
                                    a.click();
                                    URL.revokeObjectURL(url);
                                    toast.success('Passwords exported as CSV');
                                    toast.warning('This file contains unencrypted passwords. Delete it after use!', { duration: 8000 });
                                }}
                                className="w-full flex items-center gap-3"
                            >
                                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                                    <Download className="w-4 h-4 text-emerald-400" />
                                </div>
                                <div className="text-left">
                                    <span className="text-white text-sm block">Export Passwords</span>
                                    <span className="text-gray-500 text-xs">Download as CSV file</span>
                                </div>
                            </button>
                        </div>

                        {/* Import Preview */}
                        {importPreview && (
                            <div className="mt-3 pt-3 border-t border-white/5 space-y-3">
                                <div className="flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-cyan-400" />
                                    <p className="text-white text-sm">
                                        Found <span className="text-cyan-400 font-medium">{importPreview.count}</span> passwords
                                    </p>
                                </div>

                                {/* Preview first few items */}
                                <div className="bg-[#1a1a2e] rounded-xl p-3 max-h-32 overflow-y-auto space-y-1.5">
                                    {importPreview.items.slice(0, 5).map((item, i) => (
                                        <p key={i} className="text-gray-400 text-xs truncate">
                                            {item.title} — {item.username || 'no username'}
                                        </p>
                                    ))}
                                    {importPreview.count > 5 && (
                                        <p className="text-gray-500 text-xs">...and {importPreview.count - 5} more</p>
                                    )}
                                </div>

                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setImportPreview(null)}
                                        className="flex-1 py-2.5 rounded-xl border border-gray-600 text-gray-300 hover:bg-white/5 transition-colors text-sm"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={confirmImport}
                                        disabled={importing}
                                        className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 text-white py-2.5 rounded-xl disabled:opacity-50 transition-all active:scale-[0.98] shadow-lg shadow-cyan-500/20 text-sm"
                                    >
                                        {importing ? 'Importing...' : 'Import All'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Delete All Data */}
                        <div className="pt-4 border-t border-white/5 border-red-500/20">
                            <button
                                onClick={() => setShowDeleteData(!showDeleteData)}
                                className="w-full flex items-center justify-between"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                                        <Trash2 className="w-4 h-4 text-red-400" />
                                    </div>
                                    <div className="text-left">
                                        <span className="text-white text-sm block">Delete Account & Data</span>
                                        <span className="text-red-400/80 text-xs">Permanently remove Everything</span>
                                    </div>
                                </div>
                                <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${showDeleteData ? 'rotate-180' : ''}`} />
                            </button>

                            {showDeleteData && (
                                <div className="mt-4 space-y-4 pt-4 border-t border-white/5">
                                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                                        <p className="text-red-400 text-sm font-medium mb-1">Warning: Destructive Action</p>
                                        <p className="text-gray-400 text-xs">This will permanently delete your account, settings, and all vault data. This cannot be undone.</p>
                                    </div>

                                    <div>
                                        <label className="text-gray-400 text-xs mb-1.5 block">Confirm Master Password</label>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500" />
                                            <input
                                                type={showDeletePassword ? 'text' : 'password'}
                                                value={deleteDataPassword}
                                                onChange={(e) => setDeleteDataPassword(e.target.value)}
                                                placeholder="Enter master password to confirm"
                                                className="w-full bg-[#1a1a2e] border border-gray-700/50 rounded-xl py-3 pl-10 pr-11 text-white placeholder-gray-500 focus:outline-none focus:border-red-500/50 transition-colors"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowDeletePassword(!showDeletePassword)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                                            >
                                                {showDeletePassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                                            </button>
                                        </div>
                                    </div>

                                    {deleteDataError && (
                                        <p className="text-red-400 text-sm">{deleteDataError}</p>
                                    )}

                                    <button
                                        onClick={handleDeleteData}
                                        disabled={deletingData || !deleteDataPassword}
                                        className="w-full bg-red-500 text-white py-3 rounded-xl disabled:opacity-50 transition-all active:scale-[0.98] shadow-lg shadow-red-500/20 hover:bg-red-600"
                                    >
                                        {deletingData ? 'Deleting...' : 'Delete Everything'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Referrals Section */}
                <div>
                    <span className="text-gray-500 text-xs uppercase tracking-wider px-1 mb-2 block">Spread the Word</span>
                    <div className="bg-[#16213e] rounded-xl p-4">
                        <button
                            onClick={handleShareApp}
                            className="w-full flex items-center justify-between group"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/20 flex items-center justify-center group-hover:scale-105 transition-transform">
                                    <Share2 className="w-5 h-5 text-cyan-400" />
                                </div>
                                <div className="text-left">
                                    <span className="text-white text-sm block font-medium group-hover:text-cyan-400 transition-colors">Share SecureVault</span>
                                    <span className="text-gray-400 text-xs">Invite your friends</span>
                                </div>
                            </div>
                        </button>
                    </div>
                </div>

                {/* App Info */}
                <div>
                    <span className="text-gray-500 text-xs uppercase tracking-wider px-1 mb-2 block">About</span>
                    <div className="bg-[#16213e] rounded-xl p-4 space-y-2">
                        <div className="flex justify-between">
                            <span className="text-gray-500 text-xs">Version</span>
                            <span className="text-gray-300 text-xs">2.0.0</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500 text-xs">Encryption</span>
                            <span className="text-gray-300 text-xs">AES-256-GCM</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500 text-xs">Key Derivation</span>
                            <span className="text-gray-300 text-xs">PBKDF2 (600K iterations)</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500 text-xs">Cloud Sync</span>
                            <span className="text-green-400 text-xs">● Active</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
