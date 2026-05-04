import { useEffect } from 'react';
import {
  Shield,
  Clock,
  Users,
  CreditCard,
  FileText,
  IdCard,
  Tag,
  Pencil,
  AlarmClock,
  Archive,
  BookTemplate,
  Trash2,
  Settings,
  X,
} from 'lucide-react';
import type { VaultItem } from '../store';

export type SidebarFilter =
  | 'all'
  | 'codes'
  | 'passkeys'
  | 'cards'
  | 'notes'
  | 'ids'
  | 'label-business'
  | 'label-private'
  | 'expiring'
  | 'archived'
  | 'templates'
  | 'trash';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  activeFilter: SidebarFilter;
  onFilterChange: (filter: SidebarFilter) => void;
  items: VaultItem[];
  onNavigateSettings: () => void;
}

function SidebarRow({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
        active
          ? 'bg-cyan-500/15 text-cyan-400'
          : 'text-gray-300 hover:bg-white/5 active:bg-white/10'
      }`}
    >
      <span className={`shrink-0 ${active ? 'text-cyan-400' : 'text-gray-400'}`}>
        {icon}
      </span>
      <span className="flex-1 text-left font-medium text-sm">{label}</span>
      {count !== undefined && (
        <span className={`text-sm tabular-nums ${active ? 'text-cyan-400' : 'text-gray-500'}`}>
          {count}
        </span>
      )}
    </button>
  );
}

export function Sidebar({
  open,
  onClose,
  activeFilter,
  onFilterChange,
  items,
  onNavigateSettings,
}: SidebarProps) {
  // Lock scroll when sidebar is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const activeItems = items.filter((i) => !i.deletedAt);
  const trashedItems = items.filter((i) => !!i.deletedAt);

  const select = (f: SidebarFilter) => {
    onFilterChange(f);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed top-0 left-0 z-50 h-full w-[300px] max-w-[85vw] bg-[#16213e] flex flex-col shadow-2xl transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),_16px)] pb-4 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-semibold text-lg">Safe</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onNavigateSettings}
              className="p-2 rounded-lg hover:bg-white/5 text-gray-400 transition-colors"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/5 text-gray-400 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scroll area */}
        <div className="flex-1 overflow-y-auto py-2">
          {/* All */}
          <div className="px-2 mb-1">
            <SidebarRow
              icon={<Shield className="w-5 h-5" />}
              label="All"
              count={activeItems.length}
              active={activeFilter === 'all'}
              onClick={() => select('all')}
            />
          </div>

          {/* Categories */}
          <div className="px-4 py-2">
            <p className="text-gray-500 text-xs uppercase tracking-widest mb-1">Categories</p>
          </div>
          <div className="px-2 space-y-0.5">
            <SidebarRow
              icon={<Clock className="w-5 h-5" />}
              label="One-time codes"
              count={activeItems.filter((i) => !!i.totpSecretEncrypted || !!i.totpSecret).length}
              active={activeFilter === 'codes'}
              onClick={() => select('codes')}
            />
            <SidebarRow
              icon={<Users className="w-5 h-5" />}
              label="Passkeys"
              count={0}
              active={activeFilter === 'passkeys'}
              onClick={() => select('passkeys')}
            />
            <SidebarRow
              icon={<CreditCard className="w-5 h-5" />}
              label="Payment cards"
              count={activeItems.filter((i) => i.type === 'Card').length}
              active={activeFilter === 'cards'}
              onClick={() => select('cards')}
            />
            <SidebarRow
              icon={<FileText className="w-5 h-5" />}
              label="Notes"
              count={activeItems.filter((i) => !!i.note && !i.password).length}
              active={activeFilter === 'notes'}
              onClick={() => select('notes')}
            />
            <SidebarRow
              icon={<IdCard className="w-5 h-5" />}
              label="IDs"
              count={0}
              active={activeFilter === 'ids'}
              onClick={() => select('ids')}
            />
          </div>

          {/* Divider */}
          <div className="mx-4 my-3 border-t border-white/5" />

          {/* Labels */}
          <div className="px-4 py-2">
            <p className="text-gray-500 text-xs uppercase tracking-widest mb-1">Labels</p>
          </div>
          <div className="px-2 space-y-0.5">
            <SidebarRow
              icon={<Tag className="w-5 h-5" />}
              label="Business"
              count={0}
              active={activeFilter === 'label-business'}
              onClick={() => select('label-business')}
            />
            <SidebarRow
              icon={<Tag className="w-5 h-5" />}
              label="Private"
              count={0}
              active={activeFilter === 'label-private'}
              onClick={() => select('label-private')}
            />
            <SidebarRow
              icon={<Pencil className="w-5 h-5" />}
              label="Manage labels"
              active={false}
              onClick={onNavigateSettings}
            />
          </div>

          {/* Divider */}
          <div className="mx-4 my-3 border-t border-white/5" />

          {/* System */}
          <div className="px-4 py-2">
            <p className="text-gray-500 text-xs uppercase tracking-widest mb-1">System</p>
          </div>
          <div className="px-2 space-y-0.5">
            <SidebarRow
              icon={<AlarmClock className="w-5 h-5" />}
              label="Expiring"
              count={0}
              active={activeFilter === 'expiring'}
              onClick={() => select('expiring')}
            />
            <SidebarRow
              icon={<Archive className="w-5 h-5" />}
              label="Archived"
              count={0}
              active={activeFilter === 'archived'}
              onClick={() => select('archived')}
            />
            <SidebarRow
              icon={<BookTemplate className="w-5 h-5" />}
              label="Templates"
              count={0}
              active={activeFilter === 'templates'}
              onClick={() => select('templates')}
            />
            <SidebarRow
              icon={<Trash2 className="w-5 h-5" />}
              label="Recycle Bin"
              count={trashedItems.length}
              active={activeFilter === 'trash'}
              onClick={() => select('trash')}
            />
          </div>
        </div>
      </div>
    </>
  );
}
