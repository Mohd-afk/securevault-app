import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Copy, Check, RefreshCw, ShieldCheck, Timer } from 'lucide-react';
import { toast } from 'sonner';

// ── Character sets ────────────────────────────────────────────────────
const LOWER      = 'abcdefghijklmnopqrstuvwxyz';
const UPPER      = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS     = '0123456789';
const SYMBOLS    = '!@#$%^&*()_+-=[]{}|;:,.<>?';
const SIMILAR    = new Set(['i', 'l', '1', 'L', 'o', '0', 'O', 'I']);

// ── Crypto-secure random index ────────────────────────────────────────
/**
 * Returns a cryptographically random integer in [0, max).
 * Uses window.crypto.getRandomValues exclusively — Math.random() is NOT used.
 */
function secureRandInt(max: number): number {
  // Use rejection sampling to avoid modulo bias
  const range = 2 ** 32;
  const limit = range - (range % max);
  const buf = new Uint32Array(1);
  do {
    window.crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return buf[0] % max;
}

// ── Generator core ────────────────────────────────────────────────────
interface GeneratorOptions {
  length: number;
  useLower: boolean;
  useUpper: boolean;
  useDigits: boolean;
  useSymbols: boolean;
  excludeSimilar: boolean;
}

function generatePassword(opts: GeneratorOptions): string {
  let pool = '';
  const required: string[] = [];

  const filterSimilar = (s: string) =>
    opts.excludeSimilar ? s.split('').filter((c) => !SIMILAR.has(c)).join('') : s;

  if (opts.useLower)    { const s = filterSimilar(LOWER);    if (s) { pool += s; required.push(s[secureRandInt(s.length)]); } }
  if (opts.useUpper)    { const s = filterSimilar(UPPER);    if (s) { pool += s; required.push(s[secureRandInt(s.length)]); } }
  if (opts.useDigits)   { const s = filterSimilar(DIGITS);   if (s) { pool += s; required.push(s[secureRandInt(s.length)]); } }
  if (opts.useSymbols)  { const s = filterSimilar(SYMBOLS);  if (s) { pool += s; required.push(s[secureRandInt(s.length)]); } }

  if (!pool) return '';

  // Fill remaining positions
  const remaining = opts.length - required.length;
  const extra: string[] = [];
  for (let i = 0; i < Math.max(remaining, 0); i++) {
    extra.push(pool[secureRandInt(pool.length)]);
  }

  // Shuffle all chars together using Fisher-Yates with crypto random
  const all = [...required, ...extra];
  for (let i = all.length - 1; i > 0; i--) {
    const j = secureRandInt(i + 1);
    [all[i], all[j]] = [all[j], all[i]];
  }

  return all.slice(0, opts.length).join('');
}

// ── Strength assessment ───────────────────────────────────────────────
function getStrength(password: string, opts: GeneratorOptions): {
  label: string;
  color: string;
  bg: string;
  entropyBits: number;
} {
  if (!password) return { label: 'None', color: 'text-gray-500', bg: 'bg-gray-500/20', entropyBits: 0 };

  // Calculate pool size for entropy
  let poolSize = 0;
  if (opts.useLower) poolSize += opts.excludeSimilar ? 24 : 26;
  if (opts.useUpper) poolSize += opts.excludeSimilar ? 23 : 26;
  if (opts.useDigits) poolSize += opts.excludeSimilar ? 8 : 10;
  if (opts.useSymbols) poolSize += 30;
  const entropyBits = poolSize > 0 ? Math.floor(password.length * Math.log2(poolSize)) : 0;

  const types = [opts.useLower, opts.useUpper, opts.useDigits, opts.useSymbols].filter(Boolean).length;
  if (password.length >= 20 && types >= 3) return { label: 'Strong', color: 'text-green-400', bg: 'bg-green-500/15', entropyBits };
  if (password.length >= 14 && types >= 2) return { label: 'Good', color: 'text-amber-400', bg: 'bg-amber-500/15', entropyBits };
  if (password.length >= 10) return { label: 'Fair', color: 'text-yellow-500', bg: 'bg-yellow-500/15', entropyBits };
  return { label: 'Weak', color: 'text-red-400', bg: 'bg-red-500/15', entropyBits };
}

// ── Colored password display ──────────────────────────────────────────
function ColoredPassword({ password, opts }: { password: string; opts: GeneratorOptions }) {
  return (
    <div className="font-mono text-2xl tracking-wider break-all leading-relaxed text-center select-all">
      {password.split('').map((ch, i) => {
        let color = 'text-white';
        if (DIGITS.includes(ch)) color = 'text-blue-400';
        else if (SYMBOLS.includes(ch)) color = 'text-cyan-400';
        return (
          <span key={i} className={color}>
            {ch}
          </span>
        );
      })}
    </div>
  );
}

// ── Toggle switch ─────────────────────────────────────────────────────
function Toggle({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3.5 border-b border-white/5 last:border-0">
      <span className={`text-sm font-medium ${disabled ? 'text-gray-600' : 'text-white'}`}>
        {label}
      </span>
      <button
        onClick={() => !disabled && onChange(!value)}
        disabled={disabled}
        className={`relative w-12 h-6 rounded-full transition-all duration-200 ${
          value && !disabled ? 'bg-cyan-500' : 'bg-[#2a3348]'
        } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
        role="switch"
        aria-checked={value}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            value && !disabled ? 'translate-x-6' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────
export function PasswordGenerator() {
  const navigate = useNavigate();

  const [opts, setOpts] = useState<GeneratorOptions>({
    length: 21,
    useLower: true,
    useUpper: true,
    useDigits: true,
    useSymbols: true,
    excludeSimilar: false,
  });
  const [password, setPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const [clipboardCountdown, setClipboardCountdown] = useState<number | null>(null);
  const clipboardTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clipboardClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const generate = useCallback(() => {
    const pw = generatePassword(opts);
    setPassword(pw);
    setCopied(false);
  }, [opts]);

  // Auto-generate on mount and whenever options change
  useEffect(() => {
    generate();
  }, [generate]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (clipboardTimerRef.current) clearInterval(clipboardTimerRef.current);
      if (clipboardClearRef.current) clearTimeout(clipboardClearRef.current);
    };
  }, []);

  const CLIPBOARD_CLEAR_SECONDS = 30;

  const handleCopy = () => {
    if (!password) return;
    // Clear any previous timers
    if (clipboardTimerRef.current) clearInterval(clipboardTimerRef.current);
    if (clipboardClearRef.current) clearTimeout(clipboardClearRef.current);

    navigator.clipboard.writeText(password).then(() => {
      setCopied(true);
      toast.success('Copied! Clipboard will be cleared in 30s', { duration: 4000 });
      setTimeout(() => setCopied(false), 2000);

      // Start countdown
      setClipboardCountdown(CLIPBOARD_CLEAR_SECONDS);
      clipboardTimerRef.current = setInterval(() => {
        setClipboardCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(clipboardTimerRef.current!);
            clipboardTimerRef.current = null;
            return null;
          }
          return prev - 1;
        });
      }, 1000);

      // Wipe clipboard after 30s
      clipboardClearRef.current = setTimeout(() => {
        navigator.clipboard.writeText('').catch(() => {});
        setClipboardCountdown(null);
      }, CLIPBOARD_CLEAR_SECONDS * 1000);
    });
  };

  const set = <K extends keyof GeneratorOptions>(key: K, value: GeneratorOptions[K]) =>
    setOpts((prev) => ({ ...prev, [key]: value }));

  const strength = getStrength(password, opts);

  // Ensure at least one character type is always enabled
  const activeTypes = [opts.useLower, opts.useUpper, opts.useDigits, opts.useSymbols].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-white/5 pt-[max(env(safe-area-inset-top),_12px)]">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-white text-lg font-semibold">Password Generator</h2>
        </div>

        {/* Tab bar: Password / Passphrase */}
        <div className="flex border-b border-white/5 px-4">
          <button className="text-cyan-400 border-b-2 border-cyan-400 pb-2 pr-6 text-sm font-medium">
            Password
          </button>
          <button className="text-gray-500 pb-2 text-sm">Passphrase</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-5 pb-24">
        {/* Password display card */}
        <div className="bg-[#16213e] rounded-2xl p-5 mb-5 min-h-[100px] flex items-center justify-center relative overflow-hidden">
          {/* Ghost rows for depth effect */}
          <div className="absolute inset-x-5 top-3 opacity-10 blur-sm overflow-hidden pointer-events-none select-none">
            <p className="font-mono text-sm text-white break-all leading-loose">{password}</p>
          </div>
          <ColoredPassword password={password} opts={opts} />
        </div>

        {/* Length + Strength row */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-gray-400 text-sm font-medium">
            Characters: <span className="text-white">{opts.length}</span>
          </span>
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full ${strength.bg}`}>
            <ShieldCheck className={`w-3.5 h-3.5 ${strength.color}`} />
            <span className={`text-xs font-semibold ${strength.color}`}>{strength.label}</span>
            {strength.entropyBits > 0 && (
              <span className={`text-xs opacity-70 ${strength.color}`}>· ~{strength.entropyBits}b</span>
            )}
          </div>
        </div>

        {/* Length slider */}
        <input
          type="range"
          min={6}
          max={64}
          value={opts.length}
          onChange={(e) => set('length', Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer mb-6"
          style={{
            background: `linear-gradient(to right, #06b6d4 0%, #06b6d4 ${
              ((opts.length - 6) / (64 - 6)) * 100
            }%, #2a3348 ${((opts.length - 6) / (64 - 6)) * 100}%, #2a3348 100%)`,
            // Thumb styling via CSS
          }}
        />

        {/* Toggle options */}
        <div className="bg-[#16213e] rounded-2xl px-4 mb-5">
          <Toggle
            label="Lowercase"
            value={opts.useLower}
            onChange={(v) => set('useLower', v)}
            disabled={opts.useLower && activeTypes <= 1}
          />
          <Toggle
            label="Uppercase"
            value={opts.useUpper}
            onChange={(v) => set('useUpper', v)}
            disabled={opts.useUpper && activeTypes <= 1}
          />
          <Toggle
            label="Digits"
            value={opts.useDigits}
            onChange={(v) => set('useDigits', v)}
            disabled={opts.useDigits && activeTypes <= 1}
          />
          <Toggle
            label="Symbols"
            value={opts.useSymbols}
            onChange={(v) => set('useSymbols', v)}
            disabled={opts.useSymbols && activeTypes <= 1}
          />
          <Toggle
            label="Exclude similar characters"
            value={opts.excludeSimilar}
            onChange={(v) => set('excludeSimilar', v)}
          />
        </div>

        <p className="text-gray-600 text-xs text-center mb-6">
          Excluded similar: i l 1 L o 0 O I
        </p>
      </div>

      {/* Bottom buttons */}
      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-[#1a1a2e]/95 backdrop-blur-md border-t border-white/5 px-4 py-4 flex gap-3 pb-[max(env(safe-area-inset-bottom),_16px)]">
        <button
          onClick={generate}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-gray-600 text-white hover:bg-white/5 active:scale-[0.98] transition-all font-medium"
        >
          <RefreshCw className="w-4 h-4" />
          Generate
        </button>
        <button
          onClick={handleCopy}
          disabled={!password}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl font-medium transition-all active:scale-[0.98] ${
            copied
              ? 'bg-green-500 text-white'
              : 'bg-white text-black hover:bg-gray-100'
          }`}
        >
          {copied ? (
            <>
              <Check className="w-4 h-4" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              Copy
            </>
          )}
        </button>
      </div>

      {/* Clipboard countdown strip */}
      {clipboardCountdown !== null && (
        <div className="fixed bottom-[72px] left-0 right-0 max-w-md mx-auto flex items-center justify-center gap-1.5 py-2 bg-[#16213e]/95 border-t border-white/5 text-gray-500 text-xs">
          <Timer className="w-3 h-3" />
          <span>Clipboard clears in <span className="text-white font-semibold">{clipboardCountdown}s</span></span>
        </div>
      )}

      {/* Slider thumb style */}
      <style>{`
        input[type='range']::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #06b6d4;
          cursor: pointer;
          border: 2px solid #1a1a2e;
          box-shadow: 0 0 0 2px #06b6d4;
        }
        input[type='range']::-moz-range-thumb {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #06b6d4;
          cursor: pointer;
          border: 2px solid #1a1a2e;
        }
      `}</style>
    </div>
  );
}
