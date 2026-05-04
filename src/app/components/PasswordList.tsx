import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import {
  Plus,
  Globe,
  Smartphone,
  Phone,
  DoorOpen,
  CreditCard,
  KeyRound,
  Shield,
  Star,
  SlidersHorizontal,
  Search,
  X,
  AlignJustify,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import {
  getVaultItems,
  addVaultChangeListener,
  toggleFavorite,
  type VaultItem,
} from '../store';
import { useSmartSearch } from '../hooks/useSmartSearch';
import { useSort } from '../hooks/useSort';
import { Sidebar, type SidebarFilter } from './Sidebar';
import { SortModal } from './SortModal';
import type { User } from 'firebase/auth';

// ── Category chip definition ───────────────────────────────────────────
type CategoryChip = 'all' | 'favorites' | 'codes' | 'passkeys' | 'cards' | 'notes';

const CHIPS: { id: CategoryChip; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'favorites', label: '★ Favorites' },
  { id: 'codes', label: 'Codes' },
  { id: 'passkeys', label: 'Passkeys' },
  { id: 'cards', label: 'Cards' },
  { id: 'notes', label: 'Notes' },
];

// ── Type icon/color maps ──────────────────────────────────────────────
const typeIcons: Record<string, React.ReactNode> = {
  Website: <Globe className="w-5 h-5 text-cyan-400" />,
  App: <Smartphone className="w-5 h-5 text-purple-400" />,
  Phone: <Phone className="w-5 h-5 text-green-400" />,
  'Door Lock': <DoorOpen className="w-5 h-5 text-amber-400" />,
  Card: <CreditCard className="w-5 h-5 text-pink-400" />,
  Other: <KeyRound className="w-5 h-5 text-gray-400" />,
};

const typeColors: Record<string, string> = {
  Website: 'bg-cyan-500/10',
  App: 'bg-purple-500/10',
  Phone: 'bg-green-500/10',
  'Door Lock': 'bg-amber-500/10',
  Card: 'bg-pink-500/10',
  Other: 'bg-gray-500/10',
};

// ── Bottom tab bar ─────────────────────────────────────────────────────
type BottomTab = 'safe' | 'security' | 'tools' | 'search';

interface BottomNavProps {
  active: BottomTab;
  onChange: (tab: BottomTab) => void;
}

function BottomNav({ active, onChange }: BottomNavProps) {
  const tabs: { id: BottomTab; icon: React.ReactNode; label: string }[] = [
    { id: 'safe', icon: <Shield className="w-5 h-5" />, label: 'Safe' },
    { id: 'security', icon: <ShieldCheck className="w-5 h-5" />, label: 'Security' },
    { id: 'tools', icon: <Wrench className="w-5 h-5" />, label: 'Tools' },
    { id: 'search', icon: <Search className="w-5 h-5" />, label: 'Search' },
  ];
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-30 bg-[#111827]/95 backdrop-blur-md border-t border-white/5 flex justify-around items-center pb-[max(env(safe-area-inset-bottom),_4px)]"
      style={{ maxWidth: '448px', margin: '0 auto' }}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex flex-col items-center gap-1 px-5 pt-3 pb-2 transition-colors ${
            active === t.id
              ? 'text-[#f5a623]'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          {t.icon}
          <span className="text-[10px] font-medium">{t.label}</span>
          {active === t.id && (
            <div className="absolute bottom-0 h-0.5 w-10 bg-[#f5a623] rounded-t-full" />
          )}
        </button>
      ))}
    </div>
  );
}

// ── Password Item Card ─────────────────────────────────────────────────
interface ItemCardProps {
  item: VaultItem;
  onNavigate: (id: string) => void;
  onFavorite: (id: string) => void;
  favLoading: string | null;
}

function ItemCard({ item, onNavigate, onFavorite, favLoading }: ItemCardProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 active:bg-white/10 transition-colors relative group">
      {/* Icon */}
      <button
        onClick={() => onNavigate(item.id)}
        className="flex items-center gap-3 flex-1 min-w-0 text-left"
      >
        <div
          className={`w-10 h-10 rounded-xl ${
            typeColors[item.type] ?? 'bg-gray-500/10'
          } flex items-center justify-center shrink-0`}
        >
          {typeIcons[item.type] ?? <KeyRound className="w-5 h-5 text-gray-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm truncate font-medium">{item.title}</p>
          <p className="text-gray-500 text-xs truncate mt-0.5">
            {item.username || item.url || item.type}
          </p>
        </div>
      </button>

      {/* Star button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onFavorite(item.id);
        }}
        disabled={favLoading === item.id}
        className={`p-2 rounded-lg transition-all shrink-0 ${
          item.isFavorite
            ? 'text-[#f5a623]'
            : 'text-gray-600 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
        }`}
        aria-label={item.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      >
        <Star
          className="w-4 h-4"
          fill={item.isFavorite ? 'currentColor' : 'none'}
        />
      </button>
    </div>
  );
}

// ── Main PasswordList ──────────────────────────────────────────────────
interface PasswordListProps {
  onLock: () => void;
  onSignOut: () => void;
  user: User;
}

export function PasswordList({ onLock: _onLock, user }: PasswordListProps) {
  const navigate = useNavigate();
  const [items, setItems] = useState<VaultItem[]>(getVaultItems());
  const [searchQuery, setSearchQuery] = useState('');
  const [activeChip, setActiveChip] = useState<CategoryChip>('all');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarFilter, setSidebarFilter] = useState<SidebarFilter>('all');
  const [sortModalOpen, setSortModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<BottomTab>('safe');
  const [favLoading, setFavLoading] = useState<string | null>(null);

  // Live vault sync
  useEffect(() => {
    const unsub = addVaultChangeListener((updated) => setItems([...updated]));
    return unsub;
  }, []);
  useEffect(() => {
    setItems(getVaultItems());
  }, []);

  // ── Handle bottom tab navigation ────────────────────────────────────
  useEffect(() => {
    if (activeTab === 'security') navigate('/security');
    else if (activeTab === 'tools') navigate('/generator');
    else if (activeTab === 'search') {
      // Focus search
      const el = document.getElementById('smart-search-input');
      if (el) (el as HTMLInputElement).focus();
      setActiveTab('safe');
    }
  }, [activeTab, navigate]);

  // ── Filter chain ────────────────────────────────────────────────────
  const activeVaultItems = useMemo(
    () => items.filter((i) => !i.deletedAt),
    [items],
  );

  // 1. Sidebar filter
  const sidebarFiltered = useMemo(() => {
    if (sidebarFilter === 'trash') return items.filter((i) => !!i.deletedAt);
    return activeVaultItems;
  }, [activeVaultItems, sidebarFilter, items]);

  // 2. Category chip filter
  const chipFiltered = useMemo(() => {
    switch (activeChip) {
      case 'favorites':
        return sidebarFiltered.filter((i) => i.isFavorite);
      case 'codes':
        return sidebarFiltered.filter((i) => !!i.totpSecretEncrypted || !!i.totpSecret);
      case 'passkeys':
        return []; // No passkey type in current model
      case 'cards':
        return sidebarFiltered.filter((i) => i.type === 'Card');
      case 'notes':
        return sidebarFiltered.filter((i) => !!i.note && !i.password);
      default:
        return sidebarFiltered;
    }
  }, [sidebarFiltered, activeChip]);

  // 3. Smart search
  const searchFiltered = useSmartSearch(chipFiltered, searchQuery);

  // 4. Sort
  const { sortedItems, sortOption, setSortOption } = useSort(searchFiltered);

  // ── Favorite toggle ──────────────────────────────────────────────────
  const handleFavorite = useCallback(async (id: string) => {
    setFavLoading(id);
    try {
      await toggleFavorite(id);
      setItems(getVaultItems());
    } finally {
      setFavLoading(null);
    }
  }, []);

  const userInitial = (user.displayName?.[0] || user.email?.[0] || 'U').toUpperCase();
  const totalActive = activeVaultItems.length;

  return (
    <div className="min-h-screen bg-[#0f1117] flex flex-col">
      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeFilter={sidebarFilter}
        onFilterChange={(f) => {
          setSidebarFilter(f);
          if (f === 'trash') navigate('/trash');
        }}
        items={items}
        onNavigateSettings={() => navigate('/settings')}
      />

      {/* ── Sort Modal ──────────────────────────────────────────────── */}
      <SortModal
        open={sortModalOpen}
        onClose={() => setSortModalOpen(false)}
        value={sortOption}
        onChange={setSortOption}
      />

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-[#0f1117]/95 backdrop-blur-sm border-b border-white/5 pt-[max(env(safe-area-inset-top),_12px)]">
        {/* Top row */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg hover:bg-white/5 text-gray-400 transition-colors"
              aria-label="Open menu"
            >
              <AlignJustify className="w-5 h-5" />
            </button>
            <h1 className="text-white text-xl font-semibold">Safe</h1>
          </div>
          <div className="flex items-center gap-1">
            {/* Sort icon */}
            <button
              onClick={() => setSortModalOpen(true)}
              className="p-2 rounded-lg hover:bg-white/5 text-gray-400 transition-colors"
              aria-label="Sort options"
            >
              <SlidersHorizontal className="w-5 h-5" />
            </button>
            {/* Avatar */}
            <div
              className="w-9 h-9 rounded-full bg-[#f5a623] flex items-center justify-center ml-1"
              title={user.email ?? 'Signed in'}
            >
              <span className="text-black text-sm font-bold">{userInitial}</span>
            </div>
          </div>
        </div>

        {/* Smart Search */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              id="smart-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-full bg-[#1a2035] border border-white/8 rounded-2xl py-2.5 pl-10 pr-9 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-[#f5a623]/40 focus:bg-[#1e2640] transition-all"
            />
            {searchQuery ? (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                <X className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => setSortModalOpen(true)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                aria-label="Sort"
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Smart search hint */}
          {searchQuery && sortedItems.length === 0 && (
            <div className="mt-2 px-1 py-2 text-xs text-gray-500">
              Try:{' '}
              <span className="text-gray-400 font-mono">"goo acc 123"</span> finds Google account{' '}
              <span className="text-gray-400">safe123@gmail.com</span>
            </div>
          )}
        </div>

        {/* Category Chips */}
        <div
          className="flex gap-2 px-4 pb-3 overflow-x-auto"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {CHIPS.map((chip) => (
            <button
              key={chip.id}
              onClick={() => setActiveChip(chip.id)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                activeChip === chip.id
                  ? 'bg-[#f5a623] text-black'
                  : 'bg-[#1a2035] text-gray-400 hover:bg-[#1e2640] hover:text-gray-200'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto pb-28">
        {/* Empty state — no search results */}
        {sortedItems.length === 0 && searchQuery ? (
          <div className="flex flex-col items-center justify-center py-20 px-6">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
              <Search className="w-8 h-8 text-gray-600" />
            </div>
            <p className="text-gray-400 text-base font-medium text-center">No results found</p>
            <p className="text-gray-600 text-sm text-center mt-2 max-w-xs">
              Try a different search.{' '}
              <span className="text-gray-500 font-mono text-xs">
                "goo acc 123"
              </span>{' '}
              finds Google account safe123@gmail.com
            </p>
          </div>
        ) : sortedItems.length === 0 && activeChip === 'favorites' ? (
          /* Empty favorites */
          <div className="flex flex-col items-center justify-center py-20 px-6">
            <div className="w-16 h-16 rounded-full bg-[#f5a623]/10 flex items-center justify-center mb-4">
              <Star className="w-8 h-8 text-[#f5a623]" fill="currentColor" />
            </div>
            <p className="text-white text-base font-medium text-center">No favorites here</p>
            <p className="text-gray-500 text-sm text-center mt-2 max-w-xs">
              Mark cards as favorites by tapping the ★ star icon on any item.
            </p>
          </div>
        ) : sortedItems.length === 0 ? (
          /* Empty vault */
          <div className="flex flex-col items-center justify-center py-20 px-6">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
              <KeyRound className="w-8 h-8 text-gray-500" />
            </div>
            <p className="text-gray-400 text-base font-medium text-center">
              {totalActive === 0 ? 'No passwords saved yet' : 'No items in this category'}
            </p>
            <p className="text-gray-600 text-sm text-center mt-1">
              {totalActive === 0 ? 'Tap + to add your first password' : 'Try a different filter'}
            </p>
          </div>
        ) : (
          /* Item list */
          <div className="bg-[#141824] mx-3 mt-3 rounded-2xl overflow-hidden divide-y divide-white/5 shadow-lg">
            {sortedItems.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                onNavigate={(id) => navigate(`/item/${id}`)}
                onFavorite={handleFavorite}
                favLoading={favLoading}
              />
            ))}
          </div>
        )}

        {/* Item count footer */}
        {sortedItems.length > 0 && (
          <p className="text-center text-gray-600 text-xs mt-4 mb-2">
            {sortedItems.length} {sortedItems.length === 1 ? 'item' : 'items'}
            {totalActive !== sortedItems.length
              ? ` of ${totalActive} total`
              : ''}
          </p>
        )}
      </div>

      {/* ── FAB ─────────────────────────────────────────────────────── */}
      <button
        onClick={() => navigate('/add')}
        className="fixed right-5 z-20 w-14 h-14 rounded-full bg-[#f5a623] text-black flex items-center justify-center shadow-lg shadow-[#f5a623]/30 active:scale-95 transition-transform"
        style={{ bottom: 'calc(max(env(safe-area-inset-bottom), 4px) + 64px)' }}
        aria-label="Add new password"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* ── Bottom Nav ──────────────────────────────────────────────── */}
      <BottomNav active={activeTab} onChange={setActiveTab} />
    </div>
  );
}
