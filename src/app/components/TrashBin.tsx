import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Trash2, RefreshCw, KeyRound, Globe, Smartphone, Phone, DoorOpen, CreditCard, Clock } from 'lucide-react';
import { getVaultItems, addVaultChangeListener, restoreVaultItem, permanentlyDeleteVaultItem, type VaultItem } from '../store';
import { toast } from 'sonner';
import { createLogger } from '../utils/logger';

const log = createLogger('TrashBin');

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

export function TrashBin() {
  const navigate = useNavigate();
  const [items, setItems] = useState<VaultItem[]>(getVaultItems());

  useEffect(() => {
    log.info('TrashBin mounted');
    const unsubscribe = addVaultChangeListener((updatedItems) => {
      setItems([...updatedItems]);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setItems(getVaultItems());
  }, []);

  const deletedItems = useMemo(() => items.filter(i => i.deletedAt).sort((a,b) => {
      const aDate = new Date(a.deletedAt!).getTime();
      const bDate = new Date(b.deletedAt!).getTime();
      return bDate - aDate;
  }), [items]);

  const handleRestore = async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      try {
          await restoreVaultItem(id);
          toast.success('Item restored');
          log.info(`Restored item ${id}`);
      } catch (error) {
          toast.error('Failed to restore item');
          log.error(`Failed to restore item ${id}`, error);
      }
  };

  const handlePermanentDelete = async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!window.confirm("Are you sure you want to permanently delete this item? This action cannot be undone.")) return;
      try {
          await permanentlyDeleteVaultItem(id);
          toast.success('Item permanently deleted');
          log.info(`Permanently deleted item ${id}`);
      } catch (error) {
          toast.error('Failed to delete item');
          log.error(`Failed to delete item ${id}`, error);
      }
  };

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex flex-col">
      <div className="sticky top-0 z-10 bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-white/5">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => navigate('/settings')} className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 text-white">
            <Trash2 className="w-5 h-5 text-red-400" />
            <h2 className="text-base font-medium">Trash Bin</h2>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-5 pb-[max(env(safe-area-inset-bottom),_20px)] space-y-4">
        {/* Notice Card */}
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
          <Clock className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
             <p className="text-red-400 text-sm font-medium">Auto-Delete Notice</p>
             <p className="text-gray-400 text-xs mt-1 leading-relaxed">
                 Items in the trash are automatically deleted after 30 days. You can restore them before they are permanently removed.
             </p>
          </div>
        </div>

        {deletedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
               <Trash2 className="w-8 h-8 text-gray-500" />
            </div>
            <p className="text-gray-400 text-center">Your trash bin is empty.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {deletedItems.map((item) => (
               <div key={item.id} className="bg-[#16213e] rounded-xl p-4 flex items-center gap-3">
                 <div className={`w-10 h-10 rounded-xl ${typeColors[item.type] || typeColors.Other} flex items-center justify-center shrink-0`}>
                    {typeIcons[item.type] || typeIcons.Other}
                 </div>
                 <div className="flex-1 min-w-0">
                    <p className="text-white text-sm truncate">{item.title}</p>
                    <p className="text-gray-500 text-xs truncate mt-0.5">
                      {item.username || item.url || item.type}
                    </p>
                 </div>
                 <div className="flex gap-2">
                    <button onClick={(e) => handleRestore(item.id, e)} className="p-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors text-emerald-400" title="Restore">
                      <RefreshCw className="w-4 h-4 cursor-pointer" />
                    </button>
                    <button onClick={(e) => handlePermanentDelete(item.id, e)} className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 transition-colors text-red-400" title="Delete Permanently">
                      <Trash2 className="w-4 h-4" />
                    </button>
                 </div>
               </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
