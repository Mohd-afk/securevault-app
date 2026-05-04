import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Eye, EyeOff, ChevronDown, Star } from 'lucide-react';
import { addVaultItem, getVaultItem, updateVaultItem, encryptTotpSecret, decryptTotpSecret, type ItemType } from '../store';
import { toast } from 'sonner';

const itemTypes: ItemType[] = ['Website', 'App', 'Phone', 'Door Lock', 'Card', 'Other'];

export function AddEditForm() {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  const [title, setTitle] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [type, setType] = useState<ItemType>('Website');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);

  useEffect(() => {
    if (id) {
      const item = getVaultItem(id);
      if (item) {
        setTitle(item.title);
        setUsername(item.username);
        setPassword(item.password);
        setType(item.type);
        setUrl(item.url);
        setNote(item.note);
        setIsFavorite(item.isFavorite || false);
        // Decrypt TOTP secret from separate encrypted context
        if (item.totpSecretEncrypted) {
          decryptTotpSecret(item.totpSecretEncrypted)
            .then((secret) => setTotpSecret(secret))
            .catch((e) => {
              console.warn('Could not decrypt TOTP secret', e);
              // Fall back to deprecated plaintext field if present
              if (item.totpSecret) setTotpSecret(item.totpSecret);
            });
        } else if (item.totpSecret) {
          // Migration path: show deprecated plaintext field
          setTotpSecret(item.totpSecret);
        }
      }
    }
  }, [id]);

  const canSave = title.trim() && password.trim();

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      // Encrypt TOTP secret with separate key context (if provided)
      const totpSecretEncrypted = totpSecret.trim()
        ? await encryptTotpSecret(totpSecret.trim())
        : undefined;

      const itemPayload = {
        title: title.trim(),
        username: username.trim(),
        password,
        type,
        url: url.trim(),
        note: note.trim(),
        isFavorite,
        totpSecretEncrypted,
        totpSecret: undefined, // Never store raw TOTP in vault blob
      };

      if (isEdit && id) {
        await updateVaultItem(id, itemPayload);
        navigate(`/item/${id}`, { replace: true });
      } else {
        const newItem = await addVaultItem(itemPayload);
        navigate(`/item/${newItem.id}`, { replace: true });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save. Please try again.';
      setSaveError(message);
      toast.error(message);
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-white/5 pt-[max(env(safe-area-inset-top),_12px)]">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-white">{isEdit ? 'Edit Password' : 'Add New Password'}</h2>
          </div>
          <button
            onClick={() => setIsFavorite(!isFavorite)}
            className={`p-2 rounded-lg transition-colors ${isFavorite ? 'text-[#f5a623]' : 'text-gray-500 hover:text-gray-300'}`}
            aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Star className="w-5 h-5" fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
        {/* Type */}
        <div>
          <label className="text-gray-400 text-xs mb-1.5 block">Type</label>
          <div className="relative">
            <button
              onClick={() => setShowTypeDropdown(!showTypeDropdown)}
              className="w-full bg-[#16213e] border border-gray-700/50 rounded-xl py-3 px-4 text-white text-left flex items-center justify-between focus:outline-none focus:border-cyan-500/50"
            >
              <span>{type}</span>
              <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${showTypeDropdown ? 'rotate-180' : ''}`} />
            </button>
            {showTypeDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#16213e] border border-gray-700/50 rounded-xl overflow-hidden z-20 shadow-xl">
                {itemTypes.map(t => (
                  <button
                    key={t}
                    onClick={() => { setType(t); setShowTypeDropdown(false); }}
                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-white/5 transition-colors ${t === type ? 'text-cyan-400 bg-white/5' : 'text-white'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="text-gray-400 text-xs mb-1.5 block">
            {type === 'Website' ? 'Site' : 'Title'} <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={type === 'Website' ? 'example.com' : 'Enter title'}
            className="w-full bg-[#16213e] border border-gray-700/50 rounded-xl py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
          />
        </div>

        {/* Username */}
        <div>
          <label className="text-gray-400 text-xs mb-1.5 block">Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter username or email"
            className="w-full bg-[#16213e] border border-gray-700/50 rounded-xl py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
          />
        </div>

        {/* Password */}
        <div>
          <label className="text-gray-400 text-xs mb-1.5 block">
            Password / Secret <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password or secret"
              className="w-full bg-[#16213e] border border-gray-700/50 rounded-xl py-3 px-4 pr-11 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
            </button>
          </div>
          <p className="text-gray-500 text-xs mt-1.5">Make sure you're saving your current password for this site</p>
        </div>

        {/* URL */}
        {(type === 'Website' || type === 'App') && (
          <div>
            <label className="text-gray-400 text-xs mb-1.5 block">URL</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full bg-[#16213e] border border-gray-700/50 rounded-xl py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
            />
          </div>
        )}

        {/* Note */}
        <div>
          <label className="text-gray-400 text-xs mb-1.5 block">Note</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add any additional notes..."
            rows={3}
            className="w-full bg-[#16213e] border border-gray-700/50 rounded-xl py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 transition-colors resize-none"
          />
        </div>

        {/* TOTP Secret (optional — for 2FA tracking) */}
        <div>
          <label className="text-gray-400 text-xs mb-1.5 block">
            TOTP Secret{' '}
            <span className="text-gray-600 font-normal">(optional — for 2FA tracking)</span>
          </label>
          <input
            type="text"
            value={totpSecret}
            onChange={(e) => setTotpSecret(e.target.value)}
            placeholder="JBSWY3DPEHPK3PXP"
            className="w-full bg-[#16213e] border border-gray-700/50 rounded-xl py-3 px-4 text-white font-mono placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
          />
          <p className="text-gray-600 text-xs mt-1.5">
            Store your 2FA secret key so the Security Dashboard can track which accounts have 2FA enabled.
          </p>
        </div>
      </div>

      {/* Error display */}
      {saveError && (
        <div className="px-4">
          <p className="text-red-400 text-sm text-center bg-red-500/10 border border-red-500/20 py-2 rounded-lg">{saveError}</p>
        </div>
      )}

      {/* Footer Buttons */}
      <div className="sticky bottom-0 bg-[#1a1a2e]/95 backdrop-blur-sm border-t border-white/5 px-4 py-4 flex gap-3 justify-end pb-[max(env(safe-area-inset-bottom),_16px)]">
        <button
          onClick={() => navigate(-1)}
          className="px-6 py-2.5 rounded-xl border border-gray-600 text-gray-300 hover:bg-white/5 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white disabled:opacity-40 transition-all active:scale-[0.98] shadow-lg shadow-cyan-500/20"
        >
          Save
        </button>
      </div>
    </div>
  );
}
