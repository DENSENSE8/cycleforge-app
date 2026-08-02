import { isLicensedGln } from '@/lib/interop/gs1-keys';
import { CONFIG_KEY, DEFAULT_CONFIG, type PrinterConfig } from './types';

/**
 * A stored GLN is kept only when it is genuinely licensed.
 *
 * Every config written before 2026-08-02 carries `0614141000005` — GS1's
 * documentation GLN, which used to be this printer's default. Those values are
 * sitting in operators' localStorage right now, so dropping the default alone
 * would not have stopped the next print. Sanitising on LOAD is what actually
 * retires it: a stale placeholder resolves to "" and the label falls back to
 * the bare location code (`locationLabelPayload`).
 */
export function sanitizeStoredGln(v: unknown): string {
  const s = typeof v === 'string' ? v.trim() : '';
  return isLicensedGln(s) ? s : '';
}

export function clampMax(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(99, Math.max(1, Math.floor(n)));
}

export function loadConfig(): PrinterConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;
  try {
    const raw = window.localStorage.getItem(CONFIG_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      maxAisles: clampMax(parsed?.maxAisles, DEFAULT_CONFIG.maxAisles),
      maxBays: clampMax(parsed?.maxBays, DEFAULT_CONFIG.maxBays),
      maxLevels: clampMax(parsed?.maxLevels, DEFAULT_CONFIG.maxLevels),
      maxPositions: clampMax(parsed?.maxPositions, DEFAULT_CONFIG.maxPositions),
      gln: sanitizeStoredGln(parsed?.gln),
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(cfg: PrinterConfig): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  } catch {
    /* ignore */
  }
}
