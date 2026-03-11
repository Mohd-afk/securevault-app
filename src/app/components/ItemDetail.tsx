import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Eye, EyeOff, Copy, ExternalLink, Pencil, Trash2, Share2, Globe, Smartphone, Phone, DoorOpen, CreditCard, KeyRound, Check } from 'lucide-react';
import { getVaultItem, deleteVaultItem, type ItemType } from '../store';
import { format } from 'date-fns';

const typeIcons: Record<ItemType, React.ReactNode> = {
  Website: <Globe className="w-5 h-5 text-cyan-400" />,
  App: <Smartphone className="w-5 h-5 text-purple-400" />,
  Phone: <Phone className="w-5 h-5 text-green-400" />,
  'Door Lock': <DoorOpen className="w-5 h-5 text-amber-400" />,
  Card: <CreditCard className="w-5 h-5 text-pink-400" />,
  Other: <KeyRound className="w-5 h-5 text-gray-400" />,
};

const typeColors: Record<ItemType, string> = {
  Website: 'bg-cyan-500/10',
  App: 'bg-purple-500/10',
  Phone: 'bg-green-500/10',
  'Door Lock': 'bg-amber-500/10',
  Card: 'bg-pink-500/10',
  Other: 'bg-gray-500/10',
};

export function ItemDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [showPassword, setShowPassword] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const item = id ? getVaultItem(id) : undefined;

  if (!item) {
    return (
      <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center">
        <p className="text-gray-400">Item not found</p>
      </div>
    );
  }

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(field);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const handleDelete = async () => {
    await deleteVaultItem(item.id);
    navigate('/', { replace: true });
  };

  const maskedPassword = '\u2022'.repeat(Math.min(item.password.length, 14));

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-white/5">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => navigate('/')} className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className={`w-8 h-8 rounded-lg ${typeColors[item.type]} flex items-center justify-center`}>
            {typeIcons[item.type]}
          </div>
          <h2 className="text-white truncate flex-1">{item.title}</h2>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
        {/* Main info card */}
        <div className="bg-[#16213e] rounded-xl p-4 space-y-4">
          {/* Username */}
          <div>
            <label className="text-gray-500 text-xs block mb-1">Username</label>
            {item.username ? (
              <div className="flex items-center justify-between">
                <p className="text-white text-sm break-all mr-2">{item.username}</p>
                <button
                  onClick={() => copyToClipboard(item.username, 'username')}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 shrink-0"
                >
                  {copied === 'username' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            ) : (
              <p className="text-gray-500 text-sm bg-white/5 rounded-lg py-2 px-3">No username added</p>
            )}
          </div>

          {/* Password */}
          <div>
            <label className="text-gray-500 text-xs block mb-1">Password</label>
            <div className="flex items-center justify-between bg-white/5 rounded-lg py-2 px-3">
              <p className="text-white text-sm font-mono tracking-wider break-all mr-2">
                {showPassword ? item.password : maskedPassword}
              </p>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => copyToClipboard(item.password, 'password')}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400"
                >
                  {copied === 'password' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* URL / Sites */}
          {item.url && (
            <div>
              <label className="text-gray-500 text-xs block mb-1">Sites</label>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 text-sm flex items-start gap-1.5 hover:underline break-all"
              >
                <span className="flex-1">{item.url}</span>
                <ExternalLink className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              </a>
            </div>
          )}

          {/* Note */}
          <div>
            <label className="text-gray-500 text-xs block mb-1">Note</label>
            {item.note ? (
              <p className="text-gray-300 text-sm">{item.note}</p>
            ) : (
              <p className="text-gray-500 text-sm bg-white/5 rounded-lg py-2 px-3">No note added</p>
            )}
          </div>
        </div>

        {/* Metadata */}
        <div className="bg-[#16213e] rounded-xl p-4 space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-500 text-xs">Type</span>
            <span className="text-gray-300 text-xs">{item.type}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500 text-xs">Created</span>
            <span className="text-gray-300 text-xs">{format(new Date(item.createdAt), 'MMM d, yyyy h:mm a')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500 text-xs">Last changed</span>
            <span className="text-gray-300 text-xs">{format(new Date(item.updatedAt), 'MMM d, yyyy h:mm a')}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => navigate(`/edit/${item.id}`)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 transition-colors"
          >
            <Pencil className="w-4 h-4" />
            Edit
          </button>
          <button
            onClick={() => setShowDeleteDialog(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
          <div className="flex-1 min-w-[20px]" />
          <button
            onClick={async () => {
              const text = `${item.title}\nUsername: ${item.username || 'N/A'}\nPassword: ${item.password}${item.url ? `\nURL: ${item.url}` : ''}`;
              if (navigator.share) {
                try {
                  await navigator.share({
                    title: item.title,
                    text: text,
                  });
                } catch (error) {
                  // Fallback to copy if share fails or is cancelled
                  copyToClipboard(text, 'share');
                }
              } else {
                copyToClipboard(text, 'share');
              }
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-600 text-gray-300 hover:bg-white/5 transition-colors"
          >
            {copied === 'share' ? <Check className="w-4 h-4 text-green-400" /> : <Share2 className="w-4 h-4" />}
            {copied === 'share' ? 'Copied' : 'Share'}
          </button>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-6" onClick={() => setShowDeleteDialog(false)}>
          <div className="bg-[#16213e] rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white mb-2">Delete this item?</h3>
            <p className="text-gray-400 text-sm mb-6">
              Are you sure you want to delete "{item.title}"? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteDialog(false)}
                className="px-5 py-2 rounded-xl border border-gray-600 text-gray-300 hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-5 py-2 rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
