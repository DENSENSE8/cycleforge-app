/**
 * Pure config + storage layer for the rack label printer. No React — the
 * per-warehouse counts are persisted to localStorage so they survive without a
 * rebuild.
 *
 * **No `gln` here, deliberately.** It lived in this config (and the bin
 * printer's twin) until 2026-08-02, which made a per-TENANT legal identifier a
 * per-BROWSER preference that could silently disagree with
 * `organizations.settings.gs1.gln` — the value the print ladder, the interop
 * projections and Settings all read. The GLN now comes from `useOrgGs1()`.
 */

export interface PrinterConfig {
  maxAisles: number;
  maxBays: number;
  maxLevels: number;
}

export const DEFAULT_CONFIG: PrinterConfig = {
  maxAisles: 6,
  maxBays: 12,
  maxLevels: 5,
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
 * Configs written before 2026-08-02 also contain a `gln` — often
 * `0614141000005`, GS1's documentation GLN, which used to be this printer's
 * default. `loadConfig` does not read that key, so the stale value is inert:
 * it stays in localStorage as dead JSON and can never reach a label.
 */

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
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(cfg: PrinterConfig): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)); } catch { /* ignore */ }
}
