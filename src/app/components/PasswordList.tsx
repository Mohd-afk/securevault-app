import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Plus, Search, Globe, Smartphone, Phone, DoorOpen, CreditCard, KeyRound, Shield, Lock, X, Settings as SettingsIcon } from 'lucide-react';
import { getVaultItems, addVaultChangeListener, type VaultItem, type ItemType } from '../store';
import type { User } from 'firebase/auth';

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

interface PasswordListProps {
  onLock: () => void;
  onSignOut: () => void;
  user: User;
}

export function PasswordList({ onLock, user }: PasswordListProps) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [items, setItems] = useState<VaultItem[]>(getVaultItems());

  // Listen for real-time vault changes (from Firestore sync)
  useEffect(() => {
    const unsubscribe = addVaultChangeListener((updatedItems) => {
      setItems([...updatedItems]);
    });
    return () => unsubscribe();
  }, []);

  // Also refresh items when component mounts or navigates back
  useEffect(() => {
    setItems(getVaultItems());
  }, []);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      i => i.title.toLowerCase().includes(q) ||
        i.username.toLowerCase().includes(q) ||
        i.url.toLowerCase().includes(q) ||
        i.type.toLowerCase().includes(q)
    );
  }, [items, searchQuery]);

  // Group by type
  const grouped = useMemo(() => {
    const map = new Map<ItemType, VaultItem[]>();
    filteredItems.forEach(item => {
      const existing = map.get(item.type) || [];
      existing.push(item);
      map.set(item.type, existing);
    });
    return map;
  }, [filteredItems]);

  // User initial for avatar
  const userInitial = (user.displayName?.[0] || user.email?.[0] || 'U').toUpperCase();

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-white/5">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-white">SecureVault</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSearch(!showSearch)}
              className="p-2 rounded-lg hover:bg-white/5 text-gray-400 transition-colors"
            >
              <Search className="w-5 h-5" />
            </button>
            <button
              onClick={() => navigate('/settings')}
              className="p-2 rounded-lg hover:bg-white/5 text-gray-400 transition-colors"
            >
              <SettingsIcon className="w-5 h-5" />
            </button>
            <button
              onClick={onLock}
              className="p-2 rounded-lg hover:bg-white/5 text-gray-400 transition-colors"
            >
              <Lock className="w-5 h-5" />
            </button>
            {/* User avatar */}
            <div
              className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center cursor-default"
              title={user.email ?? 'Signed in'}
            >
              <span className="text-cyan-400 text-xs font-medium">{userInitial}</span>
            </div>
          </div>
        </div>

        {showSearch && (
          <div className="px-4 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search passwords..."
                className="w-full bg-[#16213e] border border-gray-700/50 rounded-xl py-2.5 pl-9 pr-9 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
                autoFocus
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-24">
        {/* Stats */}
        <div className="px-4 py-4">
          <p className="text-gray-400 text-sm">
            {items.length} saved {items.length === 1 ? 'password' : 'passwords'}
          </p>
        </div>

        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
              <KeyRound className="w-8 h-8 text-gray-500" />
            </div>
            <p className="text-gray-400 text-center">
              {searchQuery ? 'No matching passwords found' : 'No passwords saved yet'}
            </p>
            <p className="text-gray-500 text-sm text-center mt-1">
              {searchQuery ? 'Try a different search term' : 'Tap + to add your first password'}
            </p>
          </div>
        ) : (
          <div className="px-4 space-y-5">
            {Array.from(grouped.entries()).map(([type, typeItems]) => (
              <div key={type}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="text-gray-500 text-xs uppercase tracking-wider">{type}</span>
                  <span className="text-gray-600 text-xs">({typeItems.length})</span>
                </div>
                <div className="bg-[#16213e] rounded-xl overflow-hidden divide-y divide-white/5">
                  {typeItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => navigate(`/item/${item.id}`)}
                      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 active:bg-white/10 transition-colors text-left"
                    >
                      <div className={`w-10 h-10 rounded-xl ${typeColors[item.type]} flex items-center justify-center shrink-0`}>
                        {typeIcons[item.type]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate">{item.title}</p>
                        <p className="text-gray-500 text-xs truncate mt-0.5">
                          {item.username || item.url || item.type}
                        </p>
                      </div>
                      <svg className="w-4 h-4 text-gray-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => navigate('/add')}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-white flex items-center justify-center shadow-lg shadow-cyan-500/30 active:scale-95 transition-transform z-20"
      >
        <Plus className="w-6 h-6" />
      </button>
    </div>
  );
}
