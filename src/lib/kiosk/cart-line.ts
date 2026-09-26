/** Polymorphic kiosk cart line — session-root ledger item for `/kiosk/v2`. */

import type { CounterPriceAdjustment } from '@/lib/counter/counter-transaction-types';

export const KIOSK_LINE_TYPES = ['RETAIL', 'REPAIR', 'BUYBACK'] as const;
export type KioskLineType = (typeof KIOSK_LINE_TYPES)[number];

/** The PIN-authorized price on a line, plus who authorized it — the card shows `~~$5.59~~ 1 · $4.00`, History shows `Adjusted from $5.59 ·… */
export interface LinePriceAdjustment extends CounterPriceAdjustment {
  /** Display name of the authorizing staffer, for the editor's "by …" line. */
  staffName?: string | null;
  approval: string;
}

/** Square's per-line verbs every money line shares. */
export interface LineExtras {
  priceAdjustment?: LinePriceAdjustment | null;
}

export interface RetailPayload extends LineExtras {
  variationId: string | null;
  sku: string;
  /** A keypad amount (Square "Keypad"): no catalog item behind it. */
  custom?: boolean;
  /** Item note — the receipt, the staged Square order and History print it. */
  note?: string | null;
}

export interface RepairPayload extends LineExtras {
  /** A device typed in from the keypad, not picked from the catalog. */
  custom?: boolean;
  productType?: string | null;
  productModel: string;
  sourceSku?: string | null;
  repairReasons?: string[];
  repairNotes?: string | null;
  serialNumber: string;
  /** Lock-screen / device passcode — nested, never on the base line. */
  passcode?: string | null;
  /** Device IMEI when captured during repair intake. */
  imei?: string | null;
  notes?: string | null;
  /** Display quote string — mirrors `repair_service.price` text column. */
  price: string;
  signatureDataUrl?: string | null;
  signatureStrokes?: unknown;
  /** `repair_service.id` of an EXISTING repair brought into this visit (an Ecwid drop-off or desk ticket that never went through a tablet cart). */
  linkedRepairId?: number | null;
  /** The linked ticket's RS number, for the card chip — `Linked · RS-1234`. */
  linkedTicketNumber?: string | null;
}

export interface BuybackPayload {
  imei: string;
  grade?: string | null;
  notes?: string | null;
}

export type KioskLinePayload = RetailPayload | RepairPayload | BuybackPayload;

export interface KioskCartLine {
  id: string;
  type: KioskLineType;
  title: string;
  quantity: number;
  /**
   * Unit amount in cents. BUYBACK is negative (credit against the visit total).
   * RETAIL / REPAIR are ≥ 0.
   */
  unitAmountCents: number;
  payload: KioskLinePayload;
}

export function isRepairPayload(p: KioskLinePayload): p is RepairPayload {
  return 'productModel' in p;
}

export function isBuybackPayload(p: KioskLinePayload): p is BuybackPayload {
  return 'imei' in p && !('productModel' in p);
}

export function isRetailPayload(p: KioskLinePayload): p is RetailPayload {
  return !isRepairPayload(p) && !isBuybackPayload(p);
}

/** Line total including sign (buyback credits subtract). */
function lineTotalCents(line: KioskCartLine): number {
  const qty = Number.isFinite(line.quantity) ? Math.max(0, Math.trunc(line.quantity)) : 0;
  const unit = Number.isFinite(line.unitAmountCents) ? Math.trunc(line.unitAmountCents) : 0;
  return qty * unit;
}

/**
 * Cart ledger totals. Subtotal = sum of all line totals (retail +, buyback −,
 * repair +). Unlike `computeCounterTotals`, this does not clamp units to ≥0 —
 * trade-in credits must subtract.
 */
export function computeKioskCartTotals(lines: readonly KioskCartLine[]): {
  subtotalCents: number;
  totalCents: number;
} {
  const totalCents = lines.reduce((sum, line) => sum + lineTotalCents(line), 0);
  return { subtotalCents: totalCents, totalCents };
}

export function cartHasRepairLine(lines: readonly KioskCartLine[]): boolean {
  return lines.some((l) => l.type === 'REPAIR');
}

/** A REPAIR line that points at an existing `repair_service` row rather than describing a new drop-off. */
export function isLinkedRepairLine(line: KioskCartLine): boolean {
  return (
    line.type === 'REPAIR' &&
    isRepairPayload(line.payload) &&
    typeof line.payload.linkedRepairId === 'number' &&
    line.payload.linkedRepairId > 0
  );
}

export function cartIsEmpty(lines: readonly KioskCartLine[]): boolean {
  return lines.length === 0;
}

/** The most a line may carry — `RetailLineSchema.quantity.max` on the intake route. */
export const KIOSK_LINE_MAX_QUANTITY = 999;

/**
 * Whole units on each catalog id in the cart: the `×N` a Sales tile wears.
 * Several lines can share an id (one adjusted, one not); the tile counts them all.
 */
export function retailQuantitiesByVariation(
  lines: readonly KioskCartLine[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const line of lines) {
    if (line.type !== 'RETAIL' || !isRetailPayload(line.payload)) continue;
    const id = line.payload.variationId;
    if (!id) continue;
    const qty = Number.isFinite(line.quantity) ? Math.max(0, Math.trunc(line.quantity)) : 0;
    out.set(id, (out.get(id) ?? 0) + qty);
  }
  return out;
}

/** The line a repeat tap of a catalog item adds one to (Square "Consolidate identical items"), or null to start a new line. */
export function findConsolidatableRetailLine(
  lines: readonly KioskCartLine[],
  variationId: string,
  unitAmountCents: number,
): KioskCartLine | null {
  return (
    lines.find(
      (line) =>
        line.type === 'RETAIL' &&
        isRetailPayload(line.payload) &&
        line.payload.variationId === variationId &&
        line.unitAmountCents === unitAmountCents &&
        !line.payload.priceAdjustment &&
        !line.payload.note?.trim(),
    ) ?? null
  );
}

/** The PIN-authorized price change on a line, if any. Trade-ins have none. */
export function linePriceAdjustment(line: KioskCartLine): LinePriceAdjustment | null {
  const p = line.payload;
  if (isBuybackPayload(p)) return null;
  return p.priceAdjustment ?? null;
}

/** A keypad line — no catalog item, so no catalog price to return to. */
export function lineIsCustom(line: KioskCartLine): boolean {
  const p = line.payload;
  return !isBuybackPayload(p) && p.custom === true;
}

/**
 * The price the catalog set for this line, or null when none did (a custom
 * amount). Turning a price adjustment OFF returns the line here — Square's
 * "switching Price adjustment off restores the item price".
 */
export function lineCatalogUnitCents(line: KioskCartLine): number | null {
  const adjustment = linePriceAdjustment(line);
  if (adjustment) return adjustment.originalUnitAmountCents;
  return lineIsCustom(line) ? null : line.unitAmountCents;
}
