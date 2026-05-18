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
  ChevronUp,
  ChevronDown,
  Trash2,
  Tag,
  CheckCircle2,
  Circle,
  MoreVertical,
  StickyNote,
  FileText,
  FolderOpen,
} from 'lucide-react';
import {
  addVaultChangeListener,
  getVaultItems,
  toggleFavorite,
  updateVaultItem,
  deleteVaultItem,
  type VaultItem,
  type CustomCategory,
  subscribeToCustomCategories,
} from '../store';
import { useSmartSearch } from '../hooks/useSmartSearch';
import { useSort } from '../hooks/useSort';
import { Sidebar, type SidebarFilter } from './Sidebar';
import { SortModal } from './SortModal';
import type { User } from 'firebase/auth';

// ── Category chip definition ───────────────────────────────────────────
type CategoryChip = 'all' | 'favorites' | 'banking' | 'email' | 'gaming' | 'cards' | 'ids';

const CHIPS: { id: CategoryChip; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'favorites', label: '★ Favorites' },
  { id: 'banking', label: 'Banking' },
  { id: 'email', label: 'Email' },
  { id: 'gaming', label: 'Gaming' },
  { id: 'cards', label: 'Cards' },
  { id: 'ids', label: 'IDs' },
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

import { BottomNav, type BottomTab } from './BottomNav';

interface ItemCardProps {
  item: VaultItem;
  onNavigate: (id: string) => void;
  onFavorite: (id: string) => void;
  favLoading: string | null;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onLongPress?: (id: string) => void;
}

function ItemCard({ item, onNavigate, onFavorite, favLoading, isSelectionMode, isSelected, onToggleSelect, onLongPress }: ItemCardProps) {
  let timer: any;
  const handleTouchStart = () => {
    timer = setTimeout(() => { if (onLongPress) onLongPress(item.id); }, 500);
  };
  const handleTouchEnd = () => { clearTimeout(timer); };

  return (
    <div 
      className={`flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 active:bg-white/10 transition-colors relative group ${isSelected ? 'bg-cyan-500/10 hover:bg-cyan-500/20' : ''}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleTouchStart}
      onMouseUp={handleTouchEnd}
      onMouseLeave={handleTouchEnd}
    >
      {isSelectionMode && (
        <button onClick={() => onToggleSelect && onToggleSelect(item.id)} className="p-1 shrink-0">
          {isSelected ? <CheckCircle2 className="w-5 h-5 text-cyan-400" /> : <Circle className="w-5 h-5 text-gray-500" />}
        </button>
      )}

      {/* Icon */}
      <button
        onClick={() => isSelectionMode ? onToggleSelect && onToggleSelect(item.id) : onNavigate(item.id)}
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

      {/* Star button (hide in selection mode) */}
      {!isSelectionMode && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onFavorite(item.id);
          }}
          disabled={favLoading === item.id}
          className={`p-2 rounded-lg transition-all shrink-0 ${
            item.isFavorite
              ? 'text-cyan-400'
              : 'text-gray-600 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
          }`}
          aria-label={item.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Star
            className="w-4 h-4"
            fill={item.isFavorite ? 'currentColor' : 'none'}
          />
        </button>
      )}
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
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Multi-select state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showLabelDialog, setShowLabelDialog] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');

  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);

  // Live vault sync
  useEffect(() => {
    const unsub = addVaultChangeListener((updated) => setItems([...updated]));
    return unsub;
  }, []);
  useEffect(() => {
    setItems(getVaultItems());
  }, []);

  // Live categories sync
  useEffect(() => {
    const unsub = subscribeToCustomCategories((categories) => {
      setCustomCategories(categories);
    });
    return unsub;
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

  // Core Vault Categories Heuristics and Item Count Calculations
  const categoryCounts = useMemo(() => {
    let passwords = 0;
    let notes = 0;
    let cards = 0;
    let ids = 0;
    let docs = 0;
    let devices = 0;
    const custom: Record<string, number> = {};

    activeVaultItems.forEach((item) => {
      if (item.categoryId) {
        custom[item.categoryId] = (custom[item.categoryId] || 0) + 1;
      }

      const titleLower = item.title.toLowerCase();

      if (item.type === 'Website' || item.type === 'App') {
        passwords++;
      } else if (item.type === 'Card') {
        cards++;
      } else if (item.type === 'Phone' || item.type === 'Door Lock') {
        devices++;
      } else if (item.type === 'Other') {
        const isId = titleLower.includes('id') || titleLower.includes('passport') || titleLower.includes('license') || titleLower.includes('ssn') || titleLower.includes('aadhaar') || titleLower.includes('pan');
        const isDoc = titleLower.includes('doc') || titleLower.includes('pdf') || titleLower.includes('file') || titleLower.includes('attachment') || titleLower.includes('cert');
        
        if (isId) {
          ids++;
        } else if (isDoc) {
          docs++;
        } else {
          notes++;
        }
      }
    });

    return { passwords, notes, cards, ids, docs, devices, custom };
  }, [activeVaultItems]);

  // 1. Sidebar filter
  const sidebarFiltered = useMemo(() => {
    if (sidebarFilter === 'trash') return items.filter((i) => !!i.deletedAt);
    if (sidebarFilter.startsWith('label-')) {
      const label = sidebarFilter.replace('label-', '');
      return activeVaultItems.filter((i) => i.labels?.includes(label));
    }
    return activeVaultItems;
  }, [activeVaultItems, sidebarFilter, items]);

  // 1b. Core Vault Category filter
  const coreCategoryFiltered = useMemo(() => {
    if (!activeCategory) return sidebarFiltered;

    return sidebarFiltered.filter((item) => {
      const titleLower = item.title.toLowerCase();

      if (activeCategory === 'passwords') {
        return item.type === 'Website' || item.type === 'App';
      }
      if (activeCategory === 'cards') {
        return item.type === 'Card';
      }
      if (activeCategory === 'devices') {
        return item.type === 'Phone' || item.type === 'Door Lock';
      }
      if (activeCategory === 'ids') {
        if (item.type !== 'Other') return false;
        return titleLower.includes('id') || titleLower.includes('passport') || titleLower.includes('license') || titleLower.includes('ssn') || titleLower.includes('aadhaar') || titleLower.includes('pan');
      }
      if (activeCategory === 'docs') {
        if (item.type !== 'Other') return false;
        return titleLower.includes('doc') || titleLower.includes('pdf') || titleLower.includes('file') || titleLower.includes('attachment') || titleLower.includes('cert');
      }
      if (activeCategory === 'notes') {
        if (item.type !== 'Other') return false;
        const isId = titleLower.includes('id') || titleLower.includes('passport') || titleLower.includes('license') || titleLower.includes('ssn') || titleLower.includes('aadhaar') || titleLower.includes('pan');
        const isDoc = titleLower.includes('doc') || titleLower.includes('pdf') || titleLower.includes('file') || titleLower.includes('attachment') || titleLower.includes('cert');
        return !isId && !isDoc;
      }
      // Match custom category ID
      return item.categoryId === activeCategory;
    });
  }, [sidebarFiltered, activeCategory]);

  // 2. Category chip filter (layered on top of core categories)
  const chipFiltered = useMemo(() => {
    switch (activeChip) {
      case 'favorites':
        return coreCategoryFiltered.filter((i) => i.isFavorite);
      case 'banking':
        return coreCategoryFiltered.filter((i) => i.labels?.includes('Banking'));
      case 'email':
        return coreCategoryFiltered.filter((i) => i.labels?.includes('Email'));
      case 'gaming':
        return coreCategoryFiltered.filter((i) => i.labels?.includes('Gaming'));
      case 'cards':
        return coreCategoryFiltered.filter((i) => i.type === 'Card');
      case 'ids':
        return coreCategoryFiltered.filter((i) => i.type === 'Other' && i.title.toLowerCase().includes('id'));
      default:
        return coreCategoryFiltered;
    }
  }, [coreCategoryFiltered, activeChip]);

  // 3. Smart search
  const searchFiltered = useSmartSearch(chipFiltered, searchQuery);

  // 4. Sort
  const { sortedItems, sortOption, setSortOption } = useSort(searchFiltered);

  // Group by type
  const grouped = useMemo(() => {
    const map = new Map<string, VaultItem[]>();
    sortedItems.forEach(item => {
      const type = item.type;
      const existing = map.get(type) || [];
      existing.push(item);
      map.set(type, existing);
    });
    return map;
  }, [sortedItems]);

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

  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleLongPress = (id: string) => {
    if (!isSelectionMode) {
      setIsSelectionMode(true);
      setSelectedIds(new Set([id]));
    }
  };

  const handleBulkLabel = async () => {
    if (!newLabelName.trim() || selectedIds.size === 0) return;
    const label = newLabelName.trim();
    for (const id of Array.from(selectedIds)) {
      const item = items.find(i => i.id === id);
      if (item) {
        const currentLabels = item.labels || [];
        if (!currentLabels.includes(label)) {
          await updateVaultItem(id, { labels: [...currentLabels, label] });
        }
      }
    }
    setItems(getVaultItems());
    setShowLabelDialog(false);
    setNewLabelName('');
    setIsSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Move ${selectedIds.size} items to recycle bin?`)) return;
    for (const id of Array.from(selectedIds)) {
      await deleteVaultItem(id);
    }
    setItems(getVaultItems());
    setIsSelectionMode(false);
    setSelectedIds(new Set());
  };

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex flex-col">
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
      <div className="sticky top-0 z-20 bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-white/5 pt-[max(env(safe-area-inset-top),_12px)]">
        {/* Top row */}
        {isSelectionMode ? (
          <div className="flex items-center justify-between px-4 py-3 bg-cyan-500/10">
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setIsSelectionMode(false); setSelectedIds(new Set()); }}
                className="p-2 rounded-lg hover:bg-white/5 text-gray-400 transition-colors"
                aria-label="Cancel selection"
              >
                <X className="w-5 h-5" />
              </button>
              <h1 className="text-white text-lg font-semibold">{selectedIds.size} selected</h1>
            </div>
            <button
              onClick={() => {
                if (selectedIds.size === sortedItems.length) {
                  setSelectedIds(new Set());
                } else {
                  setSelectedIds(new Set(sortedItems.map(i => i.id)));
                }
              }}
              className="text-cyan-400 font-medium text-sm px-2"
            >
              {selectedIds.size === sortedItems.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
        ) : (
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
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsSelectionMode(true)}
                className="p-2 rounded-lg hover:bg-white/5 text-gray-400 transition-colors"
                title="Select Items"
              >
                <CheckCircle2 className="w-5 h-5" />
              </button>
              {/* Avatar */}
              <div
                className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center ml-1"
                title={user.email ?? 'Signed in'}
              >
                <span className="text-white text-sm font-bold">{userInitial}</span>
              </div>
            </div>
          </div>
        )}

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
              className="w-full bg-[#16213e] border border-white/5 rounded-2xl py-2.5 pl-10 pr-9 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 focus:bg-white/5 transition-all"
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
                  ? 'bg-cyan-500/20 text-cyan-400'
                  : 'bg-[#16213e] text-gray-400 hover:bg-white/5 hover:text-gray-200'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto pb-[calc(max(env(safe-area-inset-bottom),_16px)_+_96px)]">
        {/* Core Categories Dashboard Grid */}
        {!isSelectionMode && !searchQuery && sidebarFilter === 'all' && (
          <div className="px-4 py-3">
            <div className="flex justify-between items-center mb-3 px-1">
              <h2 className="text-gray-400 text-xs uppercase tracking-wider font-semibold">Core Vault Categories</h2>
              {activeCategory && (
                <button
                  onClick={() => setActiveCategory(null)}
                  className="text-xs text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
                >
                  Reset Category
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {/* Passwords */}
              <button
                onClick={() => setActiveCategory(activeCategory === 'passwords' ? null : 'passwords')}
                className={`p-3.5 rounded-2xl border text-left transition-all duration-300 relative overflow-hidden group ${
                  activeCategory === 'passwords'
                    ? 'bg-gradient-to-br from-blue-600/30 to-cyan-500/20 border-cyan-500 shadow-lg shadow-cyan-500/10'
                    : 'bg-[#16213e] border-white/5 hover:border-white/10 active:scale-98'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="p-2 rounded-xl bg-blue-500/10 text-cyan-400">
                    <KeyRound className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-semibold text-gray-400 group-hover:text-gray-300 bg-white/5 px-2 py-0.5 rounded-full">
                    {categoryCounts.passwords}
                  </span>
                </div>
                <p className="text-white font-medium text-sm mt-3">Passwords</p>
                <p className="text-gray-500 text-xs mt-0.5">Logins & portals</p>
              </button>

              {/* Cards */}
              <button
                onClick={() => setActiveCategory(activeCategory === 'cards' ? null : 'cards')}
                className={`p-3.5 rounded-2xl border text-left transition-all duration-300 relative overflow-hidden group ${
                  activeCategory === 'cards'
                    ? 'bg-gradient-to-br from-pink-600/30 to-purple-500/20 border-pink-500 shadow-lg shadow-pink-500/10'
                    : 'bg-[#16213e] border-white/5 hover:border-white/10 active:scale-98'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="p-2 rounded-xl bg-pink-500/10 text-pink-400">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-semibold text-gray-400 group-hover:text-gray-300 bg-white/5 px-2 py-0.5 rounded-full">
                    {categoryCounts.cards}
                  </span>
                </div>
                <p className="text-white font-medium text-sm mt-3">Cards</p>
                <p className="text-gray-500 text-xs mt-0.5">Debit & credit cards</p>
              </button>

              {/* Notes */}
              <button
                onClick={() => setActiveCategory(activeCategory === 'notes' ? null : 'notes')}
                className={`p-3.5 rounded-2xl border text-left transition-all duration-300 relative overflow-hidden group ${
                  activeCategory === 'notes'
                    ? 'bg-gradient-to-br from-amber-600/30 to-yellow-500/20 border-amber-500 shadow-lg shadow-amber-500/10'
                    : 'bg-[#16213e] border-white/5 hover:border-white/10 active:scale-98'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
                    <StickyNote className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-semibold text-gray-400 group-hover:text-gray-300 bg-white/5 px-2 py-0.5 rounded-full">
                    {categoryCounts.notes}
                  </span>
                </div>
                <p className="text-white font-medium text-sm mt-3">Notes</p>
                <p className="text-gray-500 text-xs mt-0.5">Secure entries & keys</p>
              </button>

              {/* IDs */}
              <button
                onClick={() => setActiveCategory(activeCategory === 'ids' ? null : 'ids')}
                className={`p-3.5 rounded-2xl border text-left transition-all duration-300 relative overflow-hidden group ${
                  activeCategory === 'ids'
                    ? 'bg-gradient-to-br from-emerald-600/30 to-green-500/20 border-emerald-500 shadow-lg shadow-emerald-500/10'
                    : 'bg-[#16213e] border-white/5 hover:border-white/10 active:scale-98'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                    <FileText className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-semibold text-gray-400 group-hover:text-gray-300 bg-white/5 px-2 py-0.5 rounded-full">
                    {categoryCounts.ids}
                  </span>
                </div>
                <p className="text-white font-medium text-sm mt-3">IDs</p>
                <p className="text-gray-500 text-xs mt-0.5">Passports & licenses</p>
              </button>

              {/* Documents */}
              <button
                onClick={() => setActiveCategory(activeCategory === 'docs' ? null : 'docs')}
                className={`p-3.5 rounded-2xl border text-left transition-all duration-300 relative overflow-hidden group ${
                  activeCategory === 'docs'
                    ? 'bg-gradient-to-br from-violet-600/30 to-purple-500/20 border-purple-500 shadow-lg shadow-purple-500/10'
                    : 'bg-[#16213e] border-white/5 hover:border-white/10 active:scale-98'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
                    <FolderOpen className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-semibold text-gray-400 group-hover:text-gray-300 bg-white/5 px-2 py-0.5 rounded-full">
                    {categoryCounts.docs}
                  </span>
                </div>
                <p className="text-white font-medium text-sm mt-3">Documents</p>
                <p className="text-gray-500 text-xs mt-0.5">Secure files & certs</p>
              </button>

              {/* Devices */}
              <button
                onClick={() => setActiveCategory(activeCategory === 'devices' ? null : 'devices')}
                className={`p-3.5 rounded-2xl border text-left transition-all duration-300 relative overflow-hidden group ${
                  activeCategory === 'devices'
                    ? 'bg-gradient-to-br from-rose-600/30 to-red-500/20 border-rose-500 shadow-lg shadow-rose-500/10'
                    : 'bg-[#16213e] border-white/5 hover:border-white/10 active:scale-98'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-semibold text-gray-400 group-hover:text-gray-300 bg-white/5 px-2 py-0.5 rounded-full">
                    {categoryCounts.devices}
                  </span>
                </div>
                <p className="text-white font-medium text-sm mt-3">Devices</p>
                <p className="text-gray-500 text-xs mt-0.5">Phones & smartlocks</p>
              </button>

              {/* Custom Categories */}
              {customCategories.map((cat) => {
                const count = categoryCounts.custom[cat.id] || 0;
                const isSelected = activeCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(isSelected ? null : cat.id)}
                    className="p-3.5 rounded-2xl border text-left transition-all duration-300 relative overflow-hidden group active:scale-98"
                    style={{
                      borderColor: isSelected ? cat.color : 'rgba(255,255,255,0.05)',
                      background: isSelected 
                        ? `linear-gradient(135deg, ${cat.color}25, rgba(22,33,62,0.5))`
                        : '#16213e'
                    }}
                  >
                    <div className="flex justify-between items-start">
                      <div className="p-2 rounded-xl" style={{ backgroundColor: `${cat.color}15`, color: cat.color }}>
                        <Tag className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-semibold text-gray-400 group-hover:text-gray-300 bg-white/5 px-2 py-0.5 rounded-full">
                        {count}
                      </span>
                    </div>
                    <p className="text-white font-medium text-sm mt-3 truncate">{cat.name}</p>
                    <p className="text-gray-500 text-xs mt-0.5 truncate">Custom category</p>
                  </button>
                );
              })}

              {/* Security Audit Banner Card */}
              <button
                onClick={() => navigate('/security')}
                className="col-span-2 p-3.5 rounded-2xl border border-white/5 hover:border-cyan-500/30 bg-gradient-to-r from-[#16213e] to-[#0f172a] text-left transition-all duration-300 relative overflow-hidden group active:scale-98 flex items-center justify-between mt-1"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-cyan-500/10 rounded-xl text-cyan-400 group-hover:scale-105 transition-transform">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">Security Dashboard</p>
                    <p className="text-gray-500 text-xs mt-0.5">Analyze vault health & compromise risks</p>
                  </div>
                </div>
                <span className="text-cyan-400 text-xs font-medium bg-cyan-500/10 px-3 py-1 rounded-full group-hover:bg-cyan-500/20 transition-all flex items-center gap-1 shrink-0">
                  Audit
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Category Active Filtering Banner */}
        {activeCategory && sidebarFilter === 'all' && (
          <div className="mx-4 mt-2 mb-3 px-4 py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Viewing Category:</span>
              <span className="text-sm font-bold text-white capitalize">{activeCategory}</span>
            </div>
            <button
              onClick={() => setActiveCategory(null)}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold"
            >
              Clear Filter
            </button>
          </div>
        )}

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
            <div className="w-16 h-16 rounded-full bg-cyan-500/10 flex items-center justify-center mb-4">
              <Star className="w-8 h-8 text-cyan-400" fill="currentColor" />
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
          <div className="px-3 space-y-4 mt-3">
            {Array.from(grouped.entries()).map(([type, typeItems]) => {
              const isExpanded = expandedCategories[type] !== false; // Default true
              return (
                <div key={type}>
                  <button
                    onClick={() => setExpandedCategories(prev => ({ ...prev, [type]: !isExpanded }))}
                    className="w-full flex items-center justify-between mb-2 px-2 hover:bg-white/5 rounded-lg py-1.5 transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 text-xs uppercase tracking-wider font-semibold">{type}</span>
                      <span className="text-gray-600 text-xs">({typeItems.length})</span>
                    </div>
                    <div className="text-gray-500 group-hover:text-gray-300 transition-colors">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="bg-[#16213e] rounded-2xl overflow-hidden divide-y divide-white/5 shadow-lg">
                      {typeItems.map((item) => (
                        <ItemCard
                          key={item.id}
                          item={item}
                          onNavigate={(id) => navigate(`/item/${id}`)}
                          onFavorite={handleFavorite}
                          favLoading={favLoading}
                          isSelectionMode={isSelectionMode}
                          isSelected={selectedIds.has(item.id)}
                          onToggleSelect={handleToggleSelect}
                          onLongPress={handleLongPress}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
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
      {!isSelectionMode && (
        <button
          onClick={() => navigate('/add', { state: { prefilledCategory: activeCategory } })}
          className="fixed right-5 z-20 w-14 h-14 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-white flex items-center justify-center shadow-lg shadow-cyan-500/30 active:scale-95 transition-transform"
          style={{ bottom: 'calc(max(env(safe-area-inset-bottom), 4px) + 64px)' }}
          aria-label="Add new password"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {/* ── Selection Action Bar ────────────────────────────────────── */}
      {isSelectionMode && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-[#16213e] border-t border-white/5 pb-[max(env(safe-area-inset-bottom),_4px)]">
          <div className="flex items-center justify-around py-3 px-4" style={{ maxWidth: '448px', margin: '0 auto' }}>
            <button
              onClick={() => setShowLabelDialog(true)}
              disabled={selectedIds.size === 0}
              className="flex flex-col items-center gap-1 text-cyan-400 disabled:opacity-50 transition-opacity"
            >
              <Tag className="w-6 h-6" />
              <span className="text-[10px] font-medium text-gray-300">Label</span>
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={selectedIds.size === 0}
              className="flex flex-col items-center gap-1 text-red-400 disabled:opacity-50 transition-opacity"
            >
              <Trash2 className="w-6 h-6" />
              <span className="text-[10px] font-medium text-gray-300">Delete</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Label Dialog ───────────────────────────────────────────── */}
      {showLabelDialog && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#16213e] w-full max-w-sm rounded-2xl p-5 shadow-2xl border border-white/10">
            <h3 className="text-white text-lg font-semibold mb-4">Add Label to {selectedIds.size} Items</h3>
            <input
              type="text"
              value={newLabelName}
              onChange={(e) => setNewLabelName(e.target.value)}
              placeholder="e.g. Work, Streaming, Email..."
              className="w-full bg-[#1a1a2e] border border-white/10 rounded-xl py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors mb-6"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setShowLabelDialog(false); setNewLabelName(''); }}
                className="flex-1 py-2.5 rounded-xl text-gray-400 hover:bg-white/5 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkLabel}
                disabled={!newLabelName.trim()}
                className="flex-1 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold disabled:opacity-50 transition-colors"
              >
                Apply Label
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bottom Nav ──────────────────────────────────────────────── */}
      {!isSelectionMode && <BottomNav active={activeTab} onChange={setActiveTab} />}
    </div>
  );
}
