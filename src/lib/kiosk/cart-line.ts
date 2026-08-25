/**
 * Polymorphic kiosk cart line — session-root ledger item for `/kiosk/v2`.
 *
 * Universal base fields (price, title, qty) + type enum; type-specific data
 * lives in `payload`. Maps to `CounterTransactionInput` via `cart-to-counter.ts`
 * (D1: UI is polymorphic; persist stays header + linked repair/sale rows).
 */

export const KIOSK_LINE_TYPES = ['RETAIL', 'REPAIR', 'BUYBACK'] as const;
export type KioskLineType = (typeof KIOSK_LINE_TYPES)[number];

export interface RetailPayload {
  variationId: string | null;
  sku: string;
}

export interface RepairPayload {
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

export function cartIsEmpty(lines: readonly KioskCartLine[]): boolean {
  return lines.length === 0;
}
