import { Shield, ShieldCheck, Wrench } from 'lucide-react';

export type BottomTab = 'safe' | 'security' | 'tools' | 'search';

export interface BottomNavProps {
  active: BottomTab;
  onChange: (tab: BottomTab) => void;
}

export function BottomNav({ active, onChange }: BottomNavProps) {
  const tabs: { id: BottomTab; icon: React.ReactNode; label: string }[] = [
    { id: 'safe', icon: <Shield className="w-5 h-5" />, label: 'Safe' },
    { id: 'security', icon: <ShieldCheck className="w-5 h-5" />, label: 'Security' },
    { id: 'tools', icon: <Wrench className="w-5 h-5" />, label: 'Tools' },
  ];

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-30 bg-[#1a1a2e]/95 backdrop-blur-md border-t border-white/5 flex justify-around items-center pb-[max(env(safe-area-inset-bottom),_4px)]"
      style={{ maxWidth: '448px', margin: '0 auto' }}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex flex-col items-center gap-1 px-5 pt-3 pb-2 transition-colors ${
            active === t.id
              ? 'text-cyan-400'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          {t.icon}
          <span className="text-[10px] font-medium">{t.label}</span>
          {active === t.id && (
            <div className="absolute bottom-0 h-0.5 w-10 bg-cyan-400 rounded-t-full" />
          )}
        </button>
      ))}
    </div>
  );
}
