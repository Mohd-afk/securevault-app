import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Eye, EyeOff, ChevronDown, KeyRound, Lock } from 'lucide-react';
import { getSettings, saveSettings, changeMasterPassword, type AppSettings } from '../store';

const TIMEOUT_OPTIONS = [
    { label: '1 minute', value: 1 },
    { label: '2 minutes', value: 2 },
    { label: '5 minutes', value: 5 },
    { label: '15 minutes', value: 15 },
    { label: '30 minutes', value: 30 },
    { label: 'Never', value: 0 },
];

export function Settings() {
    const navigate = useNavigate();
    const [settings, setSettings] = useState<AppSettings>(getSettings);

    // Password change form
    const [showPasswordForm, setShowPasswordForm] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPasswords, setShowPasswords] = useState(false);
    const [changeError, setChangeError] = useState('');
    const [changeSuccess, setChangeSuccess] = useState(false);
    const [changingPassword, setChangingPassword] = useState(false);

    // Timeout dropdown
    const [showTimeoutDropdown, setShowTimeoutDropdown] = useState(false);

    const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
        const updated = { ...settings, [key]: value };
        setSettings(updated);
        saveSettings(updated);
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
        if (currentPassword === newPassword) {
            setChangeError('New password must be different from current password');
            return;
        }

        setChangingPassword(true);
        try {
            const success = await changeMasterPassword(currentPassword, newPassword);
            if (success) {
                setChangeSuccess(true);
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
                setShowPasswordForm(false);
                setTimeout(() => setChangeSuccess(false), 3000);
            } else {
                setChangeError('Current password is incorrect');
            }
        } catch {
            setChangeError('An error occurred. Please try again.');
        }
        setChangingPassword(false);
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
                    </div>
                </div>

                {/* App Info */}
                <div>
                    <span className="text-gray-500 text-xs uppercase tracking-wider px-1 mb-2 block">About</span>
                    <div className="bg-[#16213e] rounded-xl p-4 space-y-2">
                        <div className="flex justify-between">
                            <span className="text-gray-500 text-xs">Version</span>
                            <span className="text-gray-300 text-xs">1.0.0</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500 text-xs">Encryption</span>
                            <span className="text-gray-300 text-xs">AES-256-GCM</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500 text-xs">Key Derivation</span>
                            <span className="text-gray-300 text-xs">PBKDF2 (600K iterations)</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
