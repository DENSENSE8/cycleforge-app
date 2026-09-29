/**
 * THE inbound-order contract — every way an order enters Incoming (the triage
 * form, CSV, the AI chat, marketplace / Zoho sync, auto-replenish) parses
 * into this one shape and lands through `ingestInboundOrderInTx`.
 *
 * Identity (owned by CycleForge, never by an external system):
 *   order = (org, source_type, source_platform, normalized order number)
 *   line  = (order, line_key) — the source's own line id, or L1..Ln
 * so a Walmart order 1234 and a Goodwill order 1234 are two orders, and two
 * lines typed without ids are two lines.
 *
 * The order type (PO · Return · Trade-in · Pickup) is a classifier on the
 * order, not a separate form. Returns add their return facts and require a
 * reason, tracking number, catalog item and its listing link (the claim ticket
 * and the unboxer need all four).
 *
 * Client-safe: no server imports. Money is integer cents.
 */

import { z } from 'zod';
import { inboundSourcePlatformForRaw, inboundSourceTypeForPlatform } from '@/lib/inbound/desk-csv';
import { detectCarrier, extractCanonicalTracking } from '@/lib/tracking-format';

const text = (max: number) => z.string().trim().max(max);

export const INBOUND_ORDER_TYPES = ['PO', 'RETURN', 'TRADE_IN', 'PICKUP'] as const;
export type InboundOrderType = (typeof INBOUND_ORDER_TYPES)[number];

export const INBOUND_ORDER_TYPE_LABELS: Record<InboundOrderType, string> = {
  PO: 'Purchase order',
  RETURN: 'Return',
  TRADE_IN: 'Trade-in',
  PICKUP: 'Pickup',
};

export const INBOUND_PRIORITY_AUTO = 'auto';

export const inboundOrderLineSchema = z.object({
  /** The source's own line id. Blank → the ingest assigns L1..Ln by position. */
  lineKey: text(120),
  /** Catalog item when resolved (picker, SKU match); null = by SKU / title text. */
  skuCatalogId: z.number().int().positive().nullable(),
  sku: text(200),
  title: text(500),
  /** Null = not said yet — asked for, never assumed. */
  quantity: z.number().int().min(1).max(10_000).nullable(),
  unitCostCents: z.number().int().min(0).max(1_000_000_000).nullable(),
  listingUrl: text(2000),
  /** Marketplace item number the listing carries (eBay item, ASIN, …). */
  itemNumber: text(64),
  /** Pickup-paperwork facts. Optional on every other inbound type. */
  conditionGrade: z.enum(['BRAND_NEW', 'USED_A', 'USED_B', 'USED_C', 'PARTS']).nullable().optional(),
  partsStatus: z.enum(['COMPLETE', 'MISSING_PARTS']).nullable().optional(),
  missingPartsNote: text(500).optional(),
  conditionNote: text(1000).optional(),
});
export type InboundOrderLine = z.infer<typeof inboundOrderLineSchema>;

export const inboundOrderTrackingSchema = z.object({
  number: text(80),
  /** Display carrier; blank = detect from the number. */
  carrier: text(40),
});
export type InboundOrderTracking = z.infer<typeof inboundOrderTrackingSchema>;

const civilDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

export const inboundOrderDraftSchema = z.object({
  type: z.enum(INBOUND_ORDER_TYPES),
  /** Platform token (amazon · ebay · goodwill · walmart · manual · …). */
  platform: text(40),
  /** PO # / marketplace order # — the order's identity within its source. */
  orderNumber: text(200),
  vendor: text(200),
  /** Buyer / storefront account label (resolves platform_accounts). */
  accountName: text(200),
  priority: z.enum([INBOUND_PRIORITY_AUTO, '0', '1', '2', '3']),
  orderDate: civilDate,
  expectedDate: civilDate,
  currency: z.string().trim().length(3),
  tracking: z.array(inboundOrderTrackingSchema).max(10),
  lines: z.array(inboundOrderLineSchema).min(1).max(200),
  notes: text(2000),
  returnReason: text(500),
  rmaId: text(200),
  /** Money-receipt facts carried by local-pickup paperwork. */
  pickup: z.object({
    paymentMethod: text(40),
    paidCents: z.number().int().min(0).max(1_000_000_000).nullable(),
  }).optional(),
});
export type InboundOrderDraft = z.infer<typeof inboundOrderDraftSchema>;

export function emptyInboundOrderLine(): InboundOrderLine {
  return {
    lineKey: '', skuCatalogId: null, sku: '', title: '', quantity: null,
    unitCostCents: null, listingUrl: '', itemNumber: '', conditionGrade: null,
    partsStatus: null, missingPartsNote: '', conditionNote: '',
  };
}

export function emptyInboundOrderDraft(type: InboundOrderType = 'PO'): InboundOrderDraft {
  return {
    type,
    platform: '',
    orderNumber: '',
    vendor: '',
    accountName: '',
    priority: INBOUND_PRIORITY_AUTO,
    orderDate: null,
    expectedDate: null,
    currency: 'USD',
    tracking: [{ number: '', carrier: '' }],
    lines: [emptyInboundOrderLine()],
    notes: '',
    returnReason: '',
    rmaId: '',
    pickup: { paymentMethod: '', paidCents: null },
  };
}

// ─── the return reason ───────────────────────────────────────────────────────

/** The common reasons a buyer sends an item back — what the unboxer checks for. */
export const INBOUND_RETURN_REASONS = [
  'Damaged in transit',
  "Defective / doesn't work",
  'Not as described',
  'Wrong item sent',
  'Missing parts / accessories',
  'Changed mind / no longer needed',
  'Other',
] as const;
export type InboundReturnReason = (typeof INBOUND_RETURN_REASONS)[number];

const RETURN_REASON_DETAIL_SEPARATOR = ' — ';

/**
 * `draft.returnReason` is one string: `"<reason>"` or `"<reason> — <detail>"`;
 * with no reason picked the detail alone stands.
 */
export function composeInboundReturnReason(reason: InboundReturnReason | null, detail: string): string {
  if (!detail.trim()) return reason ?? '';
  return reason ? `${reason}${RETURN_REASON_DETAIL_SEPARATOR}${detail}` : detail;
}

/** Inverse of `composeInboundReturnReason`; text naming no known reason is all detail. */
export function parseInboundReturnReason(raw: string): { reason: InboundReturnReason | null; detail: string } {
  for (const reason of INBOUND_RETURN_REASONS) {
    if (raw === reason) return { reason, detail: '' };
    if (raw.startsWith(`${reason}${RETURN_REASON_DETAIL_SEPARATOR}`)) {
      return { reason, detail: raw.slice(reason.length + RETURN_REASON_DETAIL_SEPARATOR.length) };
    }
  }
  return { reason: null, detail: raw };
}

// ─── identity ────────────────────────────────────────────────────────────────

/** Mirror of the SQL `inbound_order_number_norm()` — trimmed, no whitespace, upper-case. */
export function normalizeInboundOrderNumber(raw: string): string {
  return raw.trim().replace(/\s+/g, '').toUpperCase();
}

export interface InboundOrderIdentity {
  sourceType: 'amazon' | 'ebay' | 'manual' | 'zoho';
  /** 'none' unless the source is `manual` and the platform names who sold it. */
  sourcePlatform: string;
  /** The platform the Incoming badge paints (null = no paint). */
  paintPlatform: string | null;
  externalOrderId: string;
  externalOrderIdNorm: string;
}

export function inboundOrderIdentity(draft: Pick<InboundOrderDraft, 'platform' | 'orderNumber'>): InboundOrderIdentity {
  const sourceType = inboundSourceTypeForPlatform(draft.platform);
  const paintPlatform = inboundSourcePlatformForRaw(draft.platform);
  return {
    sourceType,
    sourcePlatform: sourceType === 'manual' ? (paintPlatform ?? 'none') : 'none',
    paintPlatform,
    externalOrderId: draft.orderNumber.trim(),
    externalOrderIdNorm: normalizeInboundOrderNumber(draft.orderNumber),
  };
}

/** Lines that carry anything — a blank trailing row is the form's next line, not an order line. */
export function filledInboundLines(draft: Pick<InboundOrderDraft, 'lines'>): InboundOrderLine[] {
  return draft.lines.filter((l) => lineHasIdentity(l) || l.quantity != null || l.unitCostCents != null);
}

export function lineHasIdentity(line: InboundOrderLine): boolean {
  return Boolean(line.skuCatalogId != null || line.sku.trim() || line.title.trim());
}

/**
 * The line keys the order lands with, in line order: the typed key, else the
 * position `L{n}`; a key used twice gets `#2`, `#3` (the backfill's rule), so
 * two lines are never one spine row.
 */
export function assignInboundLineKeys(lines: readonly InboundOrderLine[]): string[] {
  const seen = new Map<string, number>();
  return lines.map((line, index) => {
    const base = line.lineKey.trim() || `L${index + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}#${n}`;
  });
}

/** Tracking entries with a real number, canonical, carrier detected when blank. */
export function canonicalInboundTracking(draft: Pick<InboundOrderDraft, 'tracking'>): InboundOrderTracking[] {
  const out: InboundOrderTracking[] = [];
  for (const t of draft.tracking) {
    const number = extractCanonicalTracking(t.number.trim());
    if (!number || number.length < 8 || out.some((o) => o.number === number)) continue;
    out.push({ number, carrier: t.carrier.trim() || String(detectCarrier(number) ?? '') });
  }
  return out;
}

// ─── the "Still needed" checklist ────────────────────────────────────────────

export type InboundOrderField =
  | 'platform'
  | 'order_number'
  | 'lines'
  | 'line_identity'
  | 'quantity'
  | 'pickup_date'
  | 'tracking'
  | 'return_item'
  | 'return_reason'
  | 'listing_url'
  | 'zoho_source';

export interface InboundOrderNeed {
  field: InboundOrderField;
  label: string;
  /** Line indexes (into draft.lines) the need points at, when line-scoped. */
  lines?: number[];
}

/**
 * What still blocks landing the order, in form order. Empty = ready.
 * `returnClaim` (default on — the form files a claim ticket for a return)
 * requires the return's reason, tracking, catalog item and the listing the
 * buyer bought; a CSV / sync return that files no ticket lands without them.
 */
export function inboundOrderMissing(draft: InboundOrderDraft, opts: { returnClaim?: boolean } = {}): InboundOrderNeed[] {
  const needs: InboundOrderNeed[] = [];
  if (!draft.platform.trim()) needs.push({ field: 'platform', label: 'Platform' });
  else if (inboundSourceTypeForPlatform(draft.platform) === 'zoho') {
    needs.push({ field: 'zoho_source', label: 'Zoho orders arrive by sync, not by hand — pick the seller platform' });
  }
  if (!normalizeInboundOrderNumber(draft.orderNumber)) needs.push({ field: 'order_number', label: 'Order / PO number' });
  if (draft.type === 'PICKUP' && !draft.orderDate) needs.push({ field: 'pickup_date', label: 'Pickup date' });

  const indexed = draft.lines.map((line, index) => ({ line, index }));
  const filled = indexed.filter(({ line }) => lineHasIdentity(line) || line.quantity != null || line.unitCostCents != null);
  if (filled.length === 0) {
    needs.push({ field: 'lines', label: 'At least one item' });
  } else {
    const noIdentity = filled.filter(({ line }) => !lineHasIdentity(line)).map(({ index }) => index);
    if (noIdentity.length) needs.push({ field: 'line_identity', label: 'SKU or title on every item', lines: noIdentity });
    const noQty = filled.filter(({ line }) => line.quantity == null).map(({ index }) => index);
    if (noQty.length) needs.push({ field: 'quantity', label: 'Quantity on every item', lines: noQty });
  }

  if (draft.type === 'RETURN' && opts.returnClaim !== false) {
    if (!draft.returnReason.trim()) needs.push({ field: 'return_reason', label: 'Return reason' });
    if (canonicalInboundTracking(draft).length === 0) needs.push({ field: 'tracking', label: 'Return tracking number' });
    if (filled.length !== 1 || filled[0].line.skuCatalogId == null) {
      needs.push({ field: 'return_item', label: 'One catalog item being returned' });
    }
    // The unboxer opens the listing the buyer bought to check the item against it.
    const returned = filled.length ? filled : indexed.slice(0, 1);
    const noListing = returned.filter(({ line }) => !line.listingUrl.trim()).map(({ index }) => index);
    if (noListing.length) needs.push({ field: 'listing_url', label: 'Listing link on the returned item', lines: noListing });
  }
  return needs;
}

export function inboundOrderMissingSentence(needs: readonly InboundOrderNeed[]): string {
  if (needs.length === 0) return '';
  const parts = needs.map((n) => n.label.charAt(0).toLowerCase() + n.label.slice(1));
  if (parts.length === 1) return `Still need: ${parts[0]}.`;
  return `Still need: ${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}.`;
}

/** Stable content hash input — the ledger's "unchanged" check. Key order is fixed by the schema. */
export function inboundOrderFingerprint(draft: InboundOrderDraft): string {
  const lines = filledInboundLines(draft);
  const keys = assignInboundLineKeys(lines);
  return JSON.stringify({
    ...draft,
    orderNumber: normalizeInboundOrderNumber(draft.orderNumber),
    tracking: canonicalInboundTracking(draft),
    lines: lines.map((l, i) => ({ ...l, lineKey: keys[i] })),
  });
}
