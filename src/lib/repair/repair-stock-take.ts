/** Take-from-stock on the bench log is tied to ONE bin (operator 2026-09-24: */

/** One installed part per `replaced` entry. */
export const REPAIR_STOCK_TAKE_QTY = 1;

type BinTakePlan =
  | { ok: true; after: number }
  | { ok: false; available: number; message: string };

/** Can `qty` come out of a bin holding `binQty` (null = the SKU has no row in that bin)? */
export function planBinTake(input: { binQty: number | null; qty: number; sku: string; binLabel: string }): BinTakePlan {
  const available = Math.max(0, input.binQty ?? 0);
  if (!Number.isInteger(input.qty) || input.qty <= 0) {
    return { ok: false, available, message: 'Nothing to take — the quantity must be at least 1.' };
  }
  if (available < input.qty) {
    return {
      ok: false,
      available,
      message:
        available === 0
          ? `${input.binLabel} holds no ${input.sku}. Pick another bin, or count this one first.`
          : `${input.binLabel} holds only ${available} × ${input.sku} — not ${input.qty}. Pick another bin, or count this one first.`,
    };
  }
  return { ok: true, after: available - input.qty };
}

/** The bin count after deleting the action puts its part back (a vanished row starts from 0). */
export function planBinReturn(input: { binQty: number | null; qty: number }): number {
  return Math.max(0, input.binQty ?? 0) + input.qty;
}

export interface StockBinOption {
  locationId: number;
  label: string;
  qty: number;
}

/** Picker order: bins that can cover the take, most stock first; ties by label. Empty bins are dropped. */
export function binsMostStockFirst<T extends StockBinOption>(bins: readonly T[]): T[] {
  return bins
    .filter((b) => b.qty > 0)
    .sort((a, b) => b.qty - a.qty || a.label.localeCompare(b.label, undefined, { numeric: true }));
}

/** The operator's handle for a bin: its name, else its barcode, else the id. */
export function stockBinLabel(bin: { name?: string | null; barcode?: string | null; id: number }): string {
  return bin.name?.trim() || bin.barcode?.trim() || `Bin ${bin.id}`;
}
