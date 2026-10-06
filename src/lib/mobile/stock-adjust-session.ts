/**
 * This phone session's stock adjustments — written by the location record
 * when a burst lands, read by the scan page for its tape rows, Undo and tally.
 * Session storage: scoped to this tab, gone when the shift's tab closes.
 */

const STOCK_ADJUST_STORAGE_KEY = 'cf.mobile.stock-adjusts.v1';
export const STOCK_ADJUST_EVENT = 'mobile-stock-adjust';
const STOCK_ADJUST_LIMIT = 200;

export interface StockAdjustEntry {
  id: string;
  /** Flat location code — the address the write used. */
  code: string;
  /** Dashed face for the row. */
  face: string;
  sku: string;
  title: string | null;
  imageUrl: string | null;
  /** Signed units that landed (put > 0, take < 0, count = new − old). */
  delta: number;
  at: string;
  /** The scan proof the write used; null for a manual count (never undoable here). */
  proof: string | null;
  /** Set once the operator undid this write. */
  undone: boolean;
}

function isStockAdjustEntry(value: unknown): value is StockAdjustEntry {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<StockAdjustEntry>;
  return (
    typeof row.id === 'string'
    && typeof row.code === 'string'
    && typeof row.face === 'string'
    && typeof row.sku === 'string'
    && typeof row.delta === 'number'
    && typeof row.at === 'string'
    && (row.proof == null || typeof row.proof === 'string')
    && typeof row.undone === 'boolean'
  );
}

export function readStockAdjusts(): StockAdjustEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(STOCK_ADJUST_STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isStockAdjustEntry) : [];
  } catch {
    return [];
  }
}

function writeStockAdjusts(entries: readonly StockAdjustEntry[]): void {
  try {
    window.sessionStorage.setItem(STOCK_ADJUST_STORAGE_KEY, JSON.stringify(entries.slice(0, STOCK_ADJUST_LIMIT)));
    window.dispatchEvent(new CustomEvent(STOCK_ADJUST_EVENT));
  } catch {
    // Storage blocked or full: the write itself already landed on the server.
  }
}

/** Newest first. */
export function recordStockAdjust(entry: StockAdjustEntry): void {
  if (typeof window === 'undefined' || entry.delta === 0) return;
  writeStockAdjusts([entry, ...readStockAdjusts().filter((row) => row.id !== entry.id)]);
}

export function markStockAdjustUndone(id: string): void {
  if (typeof window === 'undefined') return;
  writeStockAdjusts(readStockAdjusts().map((row) => (row.id === id ? { ...row, undone: true } : row)));
}

/** "3 locations · 7 units" — distinct locations touched and units moved, undone writes excluded. */
export function stockAdjustTally(entries: readonly StockAdjustEntry[]): { locations: number; units: number } {
  const live = entries.filter((row) => !row.undone);
  return {
    locations: new Set(live.map((row) => row.code)).size,
    units: live.reduce((sum, row) => sum + Math.abs(row.delta), 0),
  };
}

/** One location's net change per SKU this session, in first-touched order: "TMP-1 +3 · ABC −1". */
export function stockAdjustSummary(entries: readonly StockAdjustEntry[], code: string): string | null {
  const net = new Map<string, number>();
  for (const row of [...entries].reverse()) {
    if (row.undone || row.code.toUpperCase() !== code.toUpperCase()) continue;
    net.set(row.sku, (net.get(row.sku) ?? 0) + row.delta);
  }
  const parts = [...net].filter(([, delta]) => delta !== 0).map(([sku, delta]) => `${sku} ${delta > 0 ? '+' : '−'}${Math.abs(delta)}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** The newest scan-backed write at this location that can still be undone. */
export function undoableStockAdjust(entries: readonly StockAdjustEntry[], code: string): StockAdjustEntry | null {
  return entries.find((row) => row.code.toUpperCase() === code.toUpperCase() && !row.undone && row.proof != null) ?? null;
}
