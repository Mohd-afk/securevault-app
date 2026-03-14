// ─── SecureVault Structured Logger ───────────────────────────────────
// Provides namespaced, leveled logging for debugging auth, sync, and crypto flows.
// Usage: const log = createLogger('AUTH');  log.info('User signed in', { uid });
// ─────────────────────────────────────────────────────────────────────

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_STYLES: Record<LogLevel, string> = {
  debug: 'color: #6b7280',        // gray
  info: 'color: #06b6d4',         // cyan
  warn: 'color: #f59e0b',         // amber
  error: 'color: #ef4444',        // red
};

const NAMESPACE_COLORS: Record<string, string> = {
  AUTH: 'color: #8b5cf6; font-weight: bold',      // purple
  STORE: 'color: #06b6d4; font-weight: bold',     // cyan
  FIRESTORE: 'color: #f97316; font-weight: bold',  // orange
  CRYPTO: 'color: #10b981; font-weight: bold',    // emerald
  UI: 'color: #ec4899; font-weight: bold',         // pink
  SYNC: 'color: #3b82f6; font-weight: bold',      // blue
  SETTINGS: 'color: #eab308; font-weight: bold',  // yellow
};

// Minimum log level — set to 'debug' for full verbosity during dev
let minLevel: LogLevel = 'debug';

export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

export interface Logger {
  debug: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
}

export function createLogger(namespace: string): Logger {
  const nsStyle = NAMESPACE_COLORS[namespace] || 'color: #9ca3af; font-weight: bold';

  function log(level: LogLevel, message: string, data?: unknown): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[minLevel]) return;

    const timestamp = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
    const prefix = `%c[${timestamp}] %c[${namespace}] %c${level.toUpperCase()}%c`;
    const styles = [
      'color: #6b7280',
      nsStyle,
      LEVEL_STYLES[level],
      'color: inherit',
    ];

    const consoleFn = level === 'error' ? console.error
      : level === 'warn' ? console.warn
        : level === 'debug' ? console.debug
          : console.log;

    if (data !== undefined) {
      consoleFn(`${prefix} ${message}`, ...styles, data);
    } else {
      consoleFn(`${prefix} ${message}`, ...styles);
    }
  }

  return {
    debug: (msg, data?) => log('debug', msg, data),
    info: (msg, data?) => log('info', msg, data),
    warn: (msg, data?) => log('warn', msg, data),
    error: (msg, data?) => log('error', msg, data),
  };
}
