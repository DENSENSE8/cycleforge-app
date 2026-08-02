import { isLicensedGln } from '@/lib/interop/gs1-keys';

/**
 * Pure config + storage layer for the rack label printer. No React — the
 * per-warehouse counts/GLN are persisted to localStorage so they survive
 * without a rebuild.
 */

export interface PrinterConfig {
  maxAisles: number;
  maxBays: number;
  maxLevels: number;
  gln: string;
}

export const DEFAULT_CONFIG: PrinterConfig = {
  maxAisles: 6,
  maxBays: 12,
  maxLevels: 5,
  // No default GLN — see the bin printer's types.ts for the full note.
  gln: '',
};

const CONFIG_KEY = 'rackPrinter.config.v1';

export type Step = 'zone' | 'aisle' | 'bay' | 'level';

export const STEPS: { id: Step; label: string }[] = [
  { id: 'zone',  label: 'Zone' },
  { id: 'aisle', label: 'Aisle' },
  { id: 'bay',   label: 'Bay' },
  { id: 'level', label: 'Level' },
];

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

/** Clamp a count to a sane integer in [1, 99], falling back when invalid. */
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
      gln: sanitizeStoredGln(parsed?.gln),
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(cfg: PrinterConfig): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)); } catch { /* ignore */ }
}
