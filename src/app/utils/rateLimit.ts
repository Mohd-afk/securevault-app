import { createLogger } from './logger';

const log = createLogger('RATE_LIMIT');

const LOCKOUT_THRESHOLDS = [
    { fails: 15, durationMs: 5 * 60 * 1000 }, // 5 minutes
    { fails: 10, durationMs: 60 * 1000 },     // 1 minute
    { fails: 5, durationMs: 15 * 1000 },      // 15 seconds
];

const HARD_LOCKOUT_MS = 5 * 60 * 1000; // 5 mins for Firebase backend errors

interface RateLimitState {
    failedAttempts: number;
    lockedUntil: number | null; // Timestamp
}

function getStorageKey(email: string): string {
    return `login_attempts_${email.trim().toLowerCase()}`;
}

export function getRateLimitState(email: string): RateLimitState {
    const key = getStorageKey(email);
    const stored = localStorage.getItem(key);
    if (!stored) {
        return { failedAttempts: 0, lockedUntil: null };
    }
    
    try {
        const state = JSON.parse(stored) as RateLimitState;
        
        // If the lock has expired, we still keep the failed attempts count 
        // to punish further immediate failures quickly, unless they successfully login.
        if (state.lockedUntil && Date.now() > state.lockedUntil) {
            log.info('Lockout expired for email', { email });
            state.lockedUntil = null;
            localStorage.setItem(key, JSON.stringify(state));
        }
        
        return state;
    } catch (e) {
        log.error('Failed to parse rate limit state', e);
        return { failedAttempts: 0, lockedUntil: null };
    }
}

export function recordFailedAttempt(email: string): RateLimitState {
    const state = getRateLimitState(email);
    state.failedAttempts += 1;
    
    // Find the appropriate lockout threshold
    const threshold = LOCKOUT_THRESHOLDS.find(t => state.failedAttempts >= t.fails);
    
    if (threshold) {
        state.lockedUntil = Date.now() + threshold.durationMs;
        log.warn(`Rate limit triggered: ${state.failedAttempts} fails, locked for ${threshold.durationMs / 1000}s`, { email });
    } else {
        log.info(`Recorded failed attempt: ${state.failedAttempts}`, { email });
    }
    
    localStorage.setItem(getStorageKey(email), JSON.stringify(state));
    return state;
}

export function forceHardLockout(email: string): RateLimitState {
    const state = getRateLimitState(email);
    state.lockedUntil = Date.now() + HARD_LOCKOUT_MS;
    log.error('Forced hard lockout due to backend rate limiting', { email, lockoutSecs: HARD_LOCKOUT_MS / 1000 });
    localStorage.setItem(getStorageKey(email), JSON.stringify(state));
    return state;
}

export function clearRateLimit(email: string): void {
    const key = getStorageKey(email);
    if (localStorage.getItem(key)) {
        localStorage.removeItem(key);
        log.info('Cleared rate limit state on successful login', { email });
    }
}
