/** Pure types, constants, and helpers for the header goal chip. No React. */

export type StationKey = 'TECH' | 'PACK' | 'UNBOX' | 'SALES' | 'FBA';
export type GoalMode = 'scans' | 'recurring' | 'todo';
/** UI row shape consumed by TaskList (server rows map onto this). */
export type Todo = { id: string; text: string; done: boolean };
/** Legacy v1 localStorage shape — read only by the one-time import. */
export type LegacyRecurringState = { intervalMs: number; anchor: number; items: Todo[] };

export type StationGoal = {
  station: StationKey;
  isPrimary: boolean;
  target: number;
  scanCount: number;
};

/**
 * The panel shell for the header's pace-and-next button.
 *
 * **Flush-square, not a rounded card.** Ops chrome is zero-radius industrial
 * (`kinetic-ledger.md`), and this panel is the last soft `rounded-2xl` surface
 * hanging off the top beam. Declared once because two things render it: the
 * goal panel, and the work-order-only panel shown on a day with no goal set.
 */
export const GOAL_PANEL_SHELL_CLASS =
  'w-[290px] origin-top-right overflow-hidden rounded-none border border-border-soft bg-surface-card shadow-[0_12px_40px_rgba(20,30,55,0.16)]';

export const STATIONS: StationKey[] = ['TECH', 'PACK', 'UNBOX', 'SALES', 'FBA'];
export const STATION_LABEL: Record<StationKey, string> = {
  TECH: 'Tech',
  PACK: 'Packing',
  UNBOX: 'Unboxing',
  SALES: 'Sales',
  FBA: 'FBA',
};

const HOUR_MS = 60 * 60_000;
export const RECUR_INTERVALS = [
  { label: '1h', ms: HOUR_MS },
  { label: '2h', ms: 2 * HOUR_MS },
  { label: '4h', ms: 4 * HOUR_MS },
  { label: '8h', ms: 8 * HOUR_MS },
  { label: 'Daily', ms: 24 * HOUR_MS },
] as const;
export const DEFAULT_INTERVAL_MS = 4 * HOUR_MS;

export const TONES = [
  { min: 100, ring: '#059669', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-500/20', label: 'Hit goal' },
  { min: 85, ring: '#059669', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-500/20', label: 'On track' },
  { min: 60, ring: '#D97706', chip: 'bg-amber-50 text-amber-700 ring-amber-500/20', label: 'Close' },
  { min: 0, ring: '#E11D48', chip: 'bg-rose-50 text-rose-700 ring-rose-500/20', label: 'Behind' },
] as const;

/** Zero progress at day start — calm, not "behind". */
export const IDLE_TONE = {
  ring: '#94A3B8',
  chip: 'bg-surface-sunken text-text-muted ring-border-soft/50',
  label: 'Not started',
} as const;

/**
 * Progress tone for the header goal chip.
 * Pass `progressValue` (scans done / tasks done) so 0/N reads as idle, not behind.
 */
export function toneFor(percent: number, progressValue?: number) {
  if (progressValue !== undefined && progressValue <= 0 && percent < 100) {
    return IDLE_TONE;
  }
  return TONES.find((t) => percent >= t.min) ?? TONES[TONES.length - 1];
}

export function asStation(v: string | null | undefined): StationKey | null {
  const up = String(v ?? '').toUpperCase();
  return (STATIONS as string[]).includes(up) ? (up as StationKey) : null;
}

/** Accept whatever the mode key holds (incl. the legacy 'checklist' value). */
export function asMode(v: string | null | undefined): GoalMode {
  if (v === 'recurring' || v === 'todo' || v === 'scans') return v;
  if (v === 'checklist') return 'todo'; // legacy v1 single-checklist → general to-do
  return 'scans';
}

/* ── localStorage helpers (browser-only; v1 persistence) ───────────────────── */

export function readLS<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function writeLS<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode — non-fatal */
  }
}
export function removeLS(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* non-fatal */
  }
}

export const activeKey = (staffId: number) => `cf.hgoal.active.${staffId}`;
export const modeKey = (staffId: number, st: StationKey) => `cf.hgoal.mode.${staffId}.${st}`;
// Legacy v1 list keys — only read (then removed) by the one-time server import.
export const todoKey = (staffId: number, st: StationKey) => `cf.hgoal.todo.${staffId}.${st}`;
export const recurKey = (staffId: number, st: StationKey) => `cf.hgoal.recurring.${staffId}.${st}`;
