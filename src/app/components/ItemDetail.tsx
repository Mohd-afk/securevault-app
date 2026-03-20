import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Eye, EyeOff, Copy, ExternalLink, Pencil, Trash2, Share2, Globe, Smartphone, Phone, DoorOpen, CreditCard, KeyRound, Check, RotateCcw, AlertTriangle } from 'lucide-react';
import { getVaultItem, deleteVaultItem, permanentlyDeleteVaultItem, restoreVaultItem, type ItemType } from '../store';
import { format, differenceInDays } from 'date-fns';
import { toast } from 'sonner';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

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
  const [showPermanentDeleteDialog, setShowPermanentDeleteDialog] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const item = id ? getVaultItem(id) : undefined;

  if (!item) {
    return (
      <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center">
        <p className="text-gray-400">Item not found</p>
      </div>
    );
  }

  const isTrashed = !!item.deletedAt;
  const daysRemaining = isTrashed ? Math.max(0, 30 - differenceInDays(new Date(), new Date(item.deletedAt!))) : 0;

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(field);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const handleMoveToTrash = async () => {
    await deleteVaultItem(item.id);
    toast.success('Moved to Trash');
    navigate('/', { replace: true });
  };

  const handlePermanentDelete = async () => {
    await permanentlyDeleteVaultItem(item.id);
    toast.success('Permanently deleted');
    navigate('/', { replace: true });
  };

  const handleRestore = async () => {
    await restoreVaultItem(item.id);
    toast.success('Restored from Trash');
    navigate('/', { replace: true });
  };

  const handleShare = async () => {
    const text = `${item.title}\nUsername: ${item.username || 'N/A'}\nPassword: ${item.password}${item.url ? `\nURL: ${item.url}` : ''}`;
    if (Capacitor.isNativePlatform()) {
      try {
        await Share.share({
          title: item.title,
          text: text,
          dialogTitle: 'Share Password'
        });
      } catch (error) {
        copyToClipboard(text, 'share');
      }
    } else if (navigator.share) {
      try {
        await navigator.share({ title: item.title, text });
      } catch {
        copyToClipboard(text, 'share');
      }
    } else {
      copyToClipboard(text, 'share');
    }
  };

  const maskedPassword = '\u2022'.repeat(Math.min(item.password.length, 14));

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-white/5 pt-[max(env(safe-area-inset-top),_12px)]">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => navigate('/')} className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className={`w-8 h-8 rounded-lg ${isTrashed ? 'bg-red-500/10' : typeColors[item.type]} flex items-center justify-center`}>
            {isTrashed ? <Trash2 className="w-5 h-5 text-red-400" /> : typeIcons[item.type]}
          </div>
          <h2 className="text-white truncate flex-1">{item.title}</h2>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
        {/* Trash banner */}
        {isTrashed && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-red-400 text-sm font-medium">This item is in Trash</p>
              <p className="text-gray-400 text-xs mt-0.5">
                {daysRemaining > 0
                  ? `Will be permanently deleted in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`
                  : 'Scheduled for permanent deletion'}
              </p>
            </div>
          </div>
        )}

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
          {isTrashed && item.deletedAt && (
            <div className="flex justify-between">
              <span className="text-gray-500 text-xs">Deleted</span>
              <span className="text-red-400 text-xs">{format(new Date(item.deletedAt), 'MMM d, yyyy h:mm a')}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        {isTrashed ? (
          /* Trashed item actions */
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleRestore}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Restore
            </button>
            <button
              onClick={() => setShowPermanentDeleteDialog(true)}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete Forever
            </button>
          </div>
        ) : (
          /* Active item actions */
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => navigate(`/edit/${item.id}`)}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 transition-colors"
            >
              <Pencil className="w-4 h-4" />
              Edit
            </button>
            <button
              onClick={() => setShowDeleteDialog(true)}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Trash
            </button>
            <button
              onClick={handleShare}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-600 text-gray-300 hover:bg-white/5 transition-colors"
            >
              {copied === 'share' ? <Check className="w-4 h-4 text-green-400" /> : <Share2 className="w-4 h-4" />}
              {copied === 'share' ? 'Copied' : 'Share'}
            </button>
          </div>
        )}
      </div>

      {/* Move to Trash confirmation dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-6" onClick={() => setShowDeleteDialog(false)}>
          <div className="bg-[#16213e] rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white mb-2">Move to Trash?</h3>
            <p className="text-gray-400 text-sm mb-1">
              "{item.title}" will be moved to Trash.
            </p>
            <p className="text-gray-500 text-xs mb-6">
              Items in Trash are permanently deleted after 30 days. You can restore them anytime before that.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteDialog(false)}
                className="px-5 py-2 rounded-xl border border-gray-600 text-gray-300 hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleMoveToTrash}
                className="px-5 py-2 rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors"
              >
                Move to Trash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permanent delete confirmation dialog (for trashed items) */}
      {showPermanentDeleteDialog && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-6" onClick={() => setShowPermanentDeleteDialog(false)}>
          <div className="bg-[#16213e] rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white mb-2">Delete Permanently?</h3>
            <p className="text-gray-400 text-sm mb-6">
              Are you sure you want to permanently delete "{item.title}"? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowPermanentDeleteDialog(false)}
                className="px-5 py-2 rounded-xl border border-gray-600 text-gray-300 hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePermanentDelete}
                className="px-5 py-2 rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors"
              >
                Delete Forever
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
