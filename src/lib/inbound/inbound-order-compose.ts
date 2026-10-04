/**
 * The inbound-order form's shared editing model — every face of the one form
 * (the desk `/incoming/new`, the phone `/m/receiving/order`) edits an
 * `InboundOrderDraft` through these helpers, so the two faces cannot drift on
 * what a typed quantity means, what a catalog pick writes, or how a cost
 * totals. Validation stays `inboundOrderMissing` (inbound-order-draft.ts).
 *
 * Client-safe and pure: no React, no server imports. Money is integer cents.
 */

import {
  emptyInboundOrderLine,
  filledInboundLines,
  INBOUND_PRIORITY_AUTO,
  INBOUND_RETURN_REASONS,
  type InboundOrderDraft,
  type InboundOrderLine,
  type InboundOrderType,
} from '@/lib/inbound/inbound-order-draft';
import { priorityOverrideTiersForPicker } from '@/lib/receiving/priority-override';
import { formatCurrency } from '@/utils/_number';

export interface InboundOrderChoice {
  value: string;
  label: string;
  /** One quiet line under the label, when a face has room for it. */
  hint?: string;
}

/** Auto (the platform's default tier) first, then the manual override tiers (same 0..3 as `priority_tier`). */
export function inboundPriorityChoices(): InboundOrderChoice[] {
  return [
    { value: INBOUND_PRIORITY_AUTO, label: 'Auto — follows platform' },
    ...priorityOverrideTiersForPicker().map((tier) => ({ value: String(tier.value), label: tier.label, hint: tier.title })),
  ];
}

/** The order-number caption: a PO's own number, a return's original sale, else the platform's words. */
export function orderNumberLabel(type: InboundOrderType, platform: string): string {
  if (type === 'PO') return 'PO / order number';
  if (type === 'RETURN') return 'Original order #';
  if (platform === 'ebay') return 'eBay order #';
  if (platform === 'amazon' || platform === 'fba') return 'Amazon order #';
  if (platform === 'goodwill') return 'Goodwill order / PO #';
  return 'Order / PO #';
}

export const RETURN_REASON_CHOICES: InboundOrderChoice[] = INBOUND_RETURN_REASONS.map((reason) => ({ value: reason, label: reason }));

/** Money in the order's currency; unknown stays a dash, never a guessed number. */
export function formatInboundMoney(cents: number | null, currency: string): string {
  // Intl throws on a half-typed code — fall back to USD until the field holds three letters.
  const code = /^[A-Z]{3}$/.test(currency) ? currency : 'USD';
  if (cents != null) return formatCurrency(cents / 100, code);
  return `${formatCurrency(0, code).replace(/[\d.,\s]/g, '')}—`;
}

/** qty × unit cost; null while either is unsaid. */
export function inboundLineTotalCents(line: Pick<InboundOrderLine, 'quantity' | 'unitCostCents'>): number | null {
  return line.quantity == null || line.unitCostCents == null ? null : line.quantity * line.unitCostCents;
}

/** Subtotal of the lines whose cost is known, and how many filled lines lack one. */
export function inboundOrderCostTotal(draft: Pick<InboundOrderDraft, 'lines'>): { subtotalCents: number; missingCost: number } {
  let subtotalCents = 0;
  let missingCost = 0;
  for (const line of filledInboundLines(draft)) {
    const total = inboundLineTotalCents(line);
    if (total == null) missingCost += 1;
    else subtotalCents += total;
  }
  return { subtotalCents, missingCost };
}

/** A typed listing link safe to open — http(s) only, so a pasted `javascript:` never becomes an href. */
export function openableListingUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

// ─── typed input → draft values ──────────────────────────────────────────────

/** A typed quantity: a whole 1..10 000, else null ("not said yet" — never assumed). */
export function parseInboundQuantityInput(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : null;
}

// ─── line edits ──────────────────────────────────────────────────────────────

/** The catalog row a picker hands back (`/api/sku-catalog` search). */
export interface InboundCatalogPick {
  id: number;
  sku: string;
  product_title: string;
}

/** Picking a catalog item names the line: its id, SKU and the catalog's own title. */
export function inboundLineCatalogPatch(line: InboundOrderLine, pick: InboundCatalogPick | null): Partial<InboundOrderLine> {
  if (!pick) return { skuCatalogId: null };
  return { skuCatalogId: pick.id, sku: pick.sku || line.sku, title: pick.product_title || line.title };
}

/** A typed SKU that differs from the picked item's SKU unpairs the line from the catalog row. */
export function inboundLineSkuPatch(line: InboundOrderLine, sku: string): Partial<InboundOrderLine> {
  return { sku, skuCatalogId: sku === line.sku ? line.skuCatalogId : null };
}

export function patchInboundLine(draft: InboundOrderDraft, index: number, patch: Partial<InboundOrderLine>): InboundOrderDraft {
  return { ...draft, lines: draft.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)) };
}

/** Removes a line; the form always keeps one (blank) line to type into. */
export function removeInboundLine(draft: InboundOrderDraft, index: number): InboundOrderDraft {
  const lines = draft.lines.filter((_, i) => i !== index);
  return { ...draft, lines: lines.length ? lines : [emptyInboundOrderLine()] };
}

/**
 * Adds a line. A form's lone blank starter line is replaced rather than kept
 * as an empty row above the new one. Returns the new line's index.
 */
export function appendInboundLine(draft: InboundOrderDraft, line: InboundOrderLine): { draft: InboundOrderDraft; index: number } {
  const lines = filledInboundLines(draft).length === 0 ? [line] : [...draft.lines, line];
  return { draft: { ...draft, lines }, index: lines.length - 1 };
}

/** What a line is called on a compact row — the typed / picked title, else its SKU. */
export function inboundLineName(line: Pick<InboundOrderLine, 'title' | 'sku'>): string {
  return line.title.trim() || line.sku.trim() || 'Untitled item';
}

// ─── tracking ────────────────────────────────────────────────────────────────

/** Puts a scanned / typed number in the first empty tracking slot (or a new one, up to the schema's 10). */
export function addInboundTracking(draft: InboundOrderDraft, number: string): InboundOrderDraft {
  const value = number.trim();
  if (!value || draft.tracking.some((t) => t.number.trim() === value)) return draft;
  const blank = draft.tracking.findIndex((t) => !t.number.trim());
  if (blank >= 0) return { ...draft, tracking: draft.tracking.map((t, i) => (i === blank ? { ...t, number: value } : t)) };
  if (draft.tracking.length >= 10) return draft;
  return { ...draft, tracking: [...draft.tracking, { number: value, carrier: '' }] };
}

/** Drops one tracking number; the form always keeps one slot. */
export function removeInboundTracking(draft: InboundOrderDraft, index: number): InboundOrderDraft {
  const tracking = draft.tracking.filter((_, i) => i !== index);
  return { ...draft, tracking: tracking.length ? tracking : [{ number: '', carrier: '' }] };
}
