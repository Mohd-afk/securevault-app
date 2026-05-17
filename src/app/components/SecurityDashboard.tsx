import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Globe,
  Smartphone,
  Phone,
  DoorOpen,
  CreditCard,
  KeyRound,
  WifiOff,
} from 'lucide-react';
import { getVaultItems, type VaultItem } from '../store';
import { checkBatch, type HibpBatchResult } from '../services/hibpCache';
import { BottomNav } from './BottomNav';

// ── Security analysis types ───────────────────────────────────────────
interface SecurityAnalysis {
  weak: VaultItem[];
  reused: VaultItem[];
  twoFaMissing: VaultItem[];
  compromised: VaultItem[];  // passwords confirmed in breach database
  unavailable: VaultItem[];  // couldn't check (offline / timeout)
  total: number;
}

// ── Strength gauge ───────────────────────────────────────────────────
function ScoreGauge({ total, weak, reused, compromised, twoFaMissing }: {
  total: number;
  weak: number;
  reused: number;
  compromised: number;
  twoFaMissing: number;
}) {
  // Compute approximate arc segments (pure SVG, no libraries)
  const issues = weak + reused + compromised + twoFaMissing;
  const healthy = Math.max(total - issues, 0);

  const ARC_R = 70;
  const CX = 90;
  const CY = 90;
  const START_DEG = 240;
  const SPAN = 240;

  const toXY = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: CX + ARC_R * Math.cos(rad), y: CY + ARC_R * Math.sin(rad) };
  };

  const arc = (start: number, end: number, color: string) => {
    if (Math.abs(end - start) < 0.5) return null;
    const s = toXY(start);
    const e = toXY(end);
    const large = end - start > 180 ? 1 : 0;
    return (
      <path
        key={color}
        d={`M${s.x} ${s.y} A${ARC_R} ${ARC_R} 0 ${large} 1 ${e.x} ${e.y}`}
        fill="none"
        stroke={color}
        strokeWidth="12"
        strokeLinecap="round"
      />
    );
  };

  const healthyAngle = total > 0 ? (healthy / total) * SPAN : SPAN;
  const weakAngle    = total > 0 ? (weak / total) * SPAN : 0;
  const reusedAngle  = total > 0 ? (reused / total) * SPAN : 0;
  const compAngle    = total > 0 ? (compromised / total) * SPAN : 0;

  let cursor = START_DEG;
  const segments = [
    { angle: healthyAngle, color: '#22c55e' },  // green
    { angle: reusedAngle,  color: '#eab308' },  // yellow
    { angle: weakAngle,    color: '#f59e0b' },  // amber
    { angle: compAngle,    color: '#ef4444' },  // red
    // 2FA slice: cyan
    { angle: total > 0 ? (twoFaMissing / total) * SPAN : 0, color: '#06b6d4' },
  ];

  return (
    <div className="flex flex-col items-center">
      <svg width="180" height="140" viewBox="0 0 180 140">
        {/* Track */}
        <path
          d={`M${toXY(START_DEG).x} ${toXY(START_DEG).y} A${ARC_R} ${ARC_R} 0 1 1 ${toXY(START_DEG + SPAN).x} ${toXY(START_DEG + SPAN).y}`}
          fill="none"
          stroke="#16213e"
          strokeWidth="12"
          strokeLinecap="round"
        />
        {segments.map(({ angle, color }, i) => {
          if (angle < 0.5) { cursor += angle; return null; }
          const seg = arc(cursor, cursor + angle, color);
          cursor += angle;
          return seg;
        })}
        <text x={CX} y={CY + 4} textAnchor="middle" fill="white" fontSize="26" fontWeight="700">
          {total}
        </text>
        <text x={CX} y={CY + 22} textAnchor="middle" fill="#6b7280" fontSize="11">
          passwords
        </text>
      </svg>
    </div>
  );
}

// ── Metric card ───────────────────────────────────────────────────────
function MetricCard({
  count,
  label,
  dotColor,
  onClick,
}: {
  count: number;
  label: string;
  dotColor: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="bg-[#16213e] rounded-2xl p-4 flex flex-col items-start hover:bg-white/5 active:bg-white/10 transition-colors"
    >
      <div className="flex items-center justify-between w-full mb-1">
        <span className="text-white text-3xl font-bold tabular-nums">{count}</span>
        <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
      </div>
      <span className="text-gray-500 text-sm">{label}</span>
    </button>
  );
}

// ── Type icon map ────────────────────────────────────────────────────
const typeIcons: Record<string, React.ReactNode> = {
  Website: <Globe className="w-5 h-5 text-cyan-400" />,
  App: <Smartphone className="w-5 h-5 text-purple-400" />,
  Phone: <Phone className="w-5 h-5 text-green-400" />,
  'Door Lock': <DoorOpen className="w-5 h-5 text-amber-400" />,
  Card: <CreditCard className="w-5 h-5 text-pink-400" />,
  Other: <KeyRound className="w-5 h-5 text-gray-400" />,
};

// ── k-Anonymity HIBP check ───────────────────────────────────────────
// ── Security analysis (local — no network) ───────────────────────────
function analyzeVault(items: VaultItem[]): Omit<SecurityAnalysis, 'compromised' | 'unavailable'> {
  const active = items.filter((i) => !i.deletedAt && i.password);

  // Weak: password length < 10 or no uppercase or no digits
  const weak = active.filter((i) => {
    const p = i.password;
    return (
      p.length < 10 ||
      !/[A-Z]/.test(p) ||
      !/[0-9]/.test(p)
    );
  });

  // Reused: exact password string appears more than once
  const passwordCount = new Map<string, number>();
  active.forEach((i) => {
    passwordCount.set(i.password, (passwordCount.get(i.password) || 0) + 1);
  });
  const reused = active.filter((i) => (passwordCount.get(i.password) || 0) > 1);

  // 2FA missing: has a password but no TOTP secret (encrypted or legacy)
  const twoFaMissing = active.filter(
    (i) => i.password && !i.totpSecretEncrypted && !i.totpSecret,
  );

  return { weak, reused, twoFaMissing, total: active.length };
}

// ── Detail list screen ───────────────────────────────────────────
function DetailListScreen({
  title,
  items,
  onBack,
}: {
  title: string;
  items: VaultItem[];
  onBack: () => void;
}) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-[#1a1a2e] flex flex-col">
      <div className="sticky top-0 z-10 bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-white/5 pt-[max(env(safe-area-inset-top),_12px)]">
        <div className="flex items-center gap-3 px-4 py-3 pb-4">
          <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-white text-lg font-semibold">{title}</h2>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto pb-[calc(max(env(safe-area-inset-bottom),_16px)_+_80px)]">
        {items.map((item) => {
          let host = item.title;
          try {
            if (item.url) host = new URL(item.url.startsWith('http') ? item.url : `https://${item.url}`).hostname;
          } catch {}
          return (
            <button
              key={item.id}
              onClick={() => navigate('/item/' + item.id)}
              className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-white/5 hover:bg-white/5 text-left transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-[#16213e] flex items-center justify-center shrink-0 text-white font-bold text-base">
                {item.title.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{host}</p>
                <p className="text-gray-500 text-xs truncate">{item.username || item.url}</p>
              </div>
            </button>
          );
        })}
        {items.length === 0 && (
          <div className="py-20 text-center text-gray-500">
            <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No issues found.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main SecurityDashboard ────────────────────────────────────────────
type DashboardState = 'idle' | 'checking' | 'done';
type DetailView = null | 'compromised' | 'weak' | 'reused' | '2fa';

export function SecurityDashboard() {
  const navigate = useNavigate();
  const [dashState, setDashState] = useState<DashboardState>('idle');
  const [progress, setProgress] = useState({ checked: 0, total: 0 });
  const [lastChecked, setLastChecked] = useState<string | null>(
    () => localStorage.getItem('keeguard_security_last_checked')
  );
  const [analysis, setAnalysis] = useState<SecurityAnalysis | null>(null);
  const [detailView, setDetailView] = useState<DetailView>(null);

  const items = getVaultItems().filter((i) => !i.deletedAt);

  const { weak, reused, twoFaMissing, total } = analyzeVault(items);

  const runSecurityCheck = useCallback(async () => {
    setDashState('checking');
    const active = items.filter((i) => i.password);
    setProgress({ checked: 0, total: active.length });

    // Use the cached, rate-limited, timeout-aware HIBP service
    const result = await checkBatch(
      active.map((i) => ({ id: i.id, password: i.password })),
      (checked, total) => setProgress({ checked, total }),
    );

    const compromisedIds = new Set(result.compromised);
    const unavailableIds = new Set(result.unavailable);

    setAnalysis({
      weak,
      reused,
      twoFaMissing,
      compromised: active.filter((i) => compromisedIds.has(i.id)),
      unavailable: active.filter((i) => unavailableIds.has(i.id)),
      total,
    });
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setLastChecked(timeStr);
    localStorage.setItem('keeguard_security_last_checked', timeStr);
    setDashState('done');
  }, [items, weak, reused, twoFaMissing, total]);

  // ── Detail view ─────────────────────────────────────────────────────
  if (detailView) {
    let listItems: VaultItem[] = [];
    let title = '';
    if (detailView === 'compromised') { listItems = analysis?.compromised || []; title = 'Compromised'; }
    if (detailView === 'weak') { listItems = analysis?.weak || weak; title = 'Weak'; }
    if (detailView === 'reused') { listItems = analysis?.reused || reused; title = 'Reused'; }
    if (detailView === '2fa') { listItems = analysis?.twoFaMissing || twoFaMissing; title = '2FA Missing'; }
    
    return (
      <DetailListScreen
        title={title}
        items={listItems}
        onBack={() => setDetailView(null)}
      />
    );
  }

  // ── Checking state ───────────────────────────────────────────────────
  if (dashState === 'checking') {
    return (
      <div className="min-h-screen bg-[#1a1a2e] flex flex-col">
        <div className="sticky top-0 z-10 bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-white/5 pt-[max(env(safe-area-inset-top),_12px)]">
          <div className="flex items-center gap-3 px-4 py-3">
            <button onClick={() => navigate('/')} className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-white text-lg font-semibold">Security Check</h2>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-8 gap-6">
          {/* Shield + magnifier icon */}
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-[#16213e] flex items-center justify-center">
              <Shield className="w-12 h-12 text-cyan-400" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-10 h-10 rounded-full bg-[#16213e] border-2 border-[#1a1a2e] flex items-center justify-center">
              <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          <div className="text-center">
            <p className="text-white text-xl font-semibold mb-1">Checking passwords…</p>
            <p className="text-gray-500 text-sm">
              {progress.checked} / {progress.total}
            </p>
          </div>

          {/* Progress bar */}
          <div className="w-full max-w-xs bg-[#16213e] rounded-full h-2">
            <div
              className="h-2 rounded-full bg-cyan-500 transition-all duration-300"
              style={{
                width:
                  progress.total > 0
                    ? `${(progress.checked / progress.total) * 100}%`
                    : '0%',
              }}
            />
          </div>

          <p className="text-gray-600 text-xs text-center max-w-xs leading-relaxed">
            🔒 Privacy-preserving check using k-Anonymity (HIBP API). Only the
            first 5 characters of the SHA-1 hash are sent — your full passwords
            never leave your device.
          </p>
        </div>
      </div>
    );
  }

  // ── Idle / Done state ────────────────────────────────────────────────
  const compromisedCount = analysis?.compromised.length ?? 0;
  const displayWeak = analysis?.weak.length ?? weak.length;
  const displayReused = analysis?.reused.length ?? reused.length;
  const display2FA = analysis?.twoFaMissing.length ?? twoFaMissing.length;

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-white/5 pt-[max(env(safe-area-inset-top),_12px)]">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => navigate('/')} className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-white text-lg font-semibold">Security</h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-6 pb-[calc(max(env(safe-area-inset-bottom),_16px)_+_80px)]">
        {/* Gauge */}
        <ScoreGauge
          total={total}
          weak={displayWeak}
          reused={displayReused}
          compromised={compromisedCount}
          twoFaMissing={display2FA}
        />

        {/* Last checked */}
        <p className="text-center text-gray-500 text-sm mt-2">
          {lastChecked ? `Last checked: ${lastChecked}` : 'Never checked'}
        </p>

        {/* Compromised result banner */}
        {dashState === 'done' && compromisedCount > 0 && (
          <button
            onClick={() => setDetailView('compromised')}
            className="w-full mt-4 bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-center gap-3"
          >
            <ShieldAlert className="w-7 h-7 text-red-400 shrink-0" />
            <div className="text-left">
              <p className="text-red-400 font-semibold">
                Compromised passwords found: {compromisedCount}
              </p>
              <p className="text-gray-500 text-xs mt-0.5">Tap to view affected accounts</p>
            </div>
          </button>
        )}
        {dashState === 'done' && (analysis?.unavailable.length ?? 0) > 0 && (
          <div className="w-full mt-3 bg-[#16213e] border border-white/10 rounded-2xl p-4 flex items-center gap-3">
            <WifiOff className="w-5 h-5 text-gray-500 shrink-0" />
            <p className="text-gray-500 text-sm">
              {analysis!.unavailable.length} password{analysis!.unavailable.length !== 1 ? 's' : ''} could not be checked (offline/timeout). Results cached for next check.
            </p>
          </div>
        )}
        {dashState === 'done' && compromisedCount === 0 && (analysis?.unavailable.length ?? 0) === 0 && (
          <div className="w-full mt-4 bg-green-500/10 border border-green-500/30 rounded-2xl p-4 flex items-center gap-3">
            <ShieldCheck className="w-7 h-7 text-green-400 shrink-0" />
            <p className="text-green-400 font-semibold">No compromised passwords found</p>
          </div>
        )}

        {/* Security check button */}
        <button
          onClick={runSecurityCheck}
          className="w-full mt-5 bg-white text-black font-semibold py-3.5 rounded-2xl hover:bg-gray-100 active:scale-[0.98] transition-all shadow-lg"
        >
          {dashState === 'done' ? 'Run again' : 'Security check'}
        </button>

        {/* 2×2 metric grid */}
        <div className="grid grid-cols-2 gap-3 mt-5">
          <MetricCard
            count={compromisedCount}
            label="Compromised"
            dotColor="bg-red-500"
            onClick={() => analysis && setDetailView('compromised')}
          />
          <MetricCard
            count={display2FA}
            label="2FA missing"
            dotColor="bg-cyan-500"
            onClick={() => setDetailView('2fa')}
          />
          <MetricCard
            count={displayReused}
            label="Reused"
            dotColor="bg-yellow-500"
            onClick={() => setDetailView('reused')}
          />
          <MetricCard
            count={displayWeak}
            label="Weak"
            dotColor="bg-amber-500"
            onClick={() => setDetailView('weak')}
          />
        </div>

        <p className="text-center text-gray-600 text-xs mt-5">Showing all passwords</p>
      </div>

      <BottomNav
        active="security"
        onChange={(tab) => {
          if (tab === 'safe') navigate('/');
          else if (tab === 'tools') navigate('/generator');
        }}
      />
    </div>
  );
}
