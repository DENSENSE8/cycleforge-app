/**
 * The inbound-order form's shared editing model — every face of the one form
 * (the desk `/purchasing/new`, the phone `/m/receiving/order`) edits an
 * `InboundOrderDraft` through these helpers, so the two faces cannot drift on
 * what a typed quantity means, what a catalog pick writes, how a pasted list
 * of tracking numbers or serials splits, or how a cost totals. Validation
 * stays `inboundOrderMissing` (inbound-order-draft.ts).
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
  type InboundOrderTracking,
  type InboundOrderType,
} from '@/lib/inbound/inbound-order-draft';
import { RECEIVING_PATHS } from '@/lib/nav/route-tree';
import { defaultInboundTierForPlatform } from '@/lib/receiving/display/precedence';
import { priorityOverrideTier, priorityOverrideTiersForPicker } from '@/lib/receiving/priority-override';
import { detectCarrier, extractCanonicalTracking } from '@/lib/tracking-format';
import { formatCurrency } from '@/utils/_number';

/** `inboundOrderDraftSchema` caps: tracking numbers per order, listing serials per line. */
const TRACKING_LIMIT = 500;
const LISTING_SERIALS_LIMIT = 200;

// ─── the form's URL ──────────────────────────────────────────────────────────

/** The types the form adds — trade-ins and pickups land from the kiosk and the phone pickup door. */
export const INBOUND_FORM_TYPES = ['PO', 'RETURN'] as const satisfies readonly InboundOrderType[];
export type InboundFormType = (typeof INBOUND_FORM_TYPES)[number];
/** `?type=` — the type a new order opens on. */
export const INBOUND_FORM_TYPE_PARAM = 'type';
/** `?id=` — the landed inbound order the form reopens to fix. */
export const INBOUND_FORM_ID_PARAM = 'id';

/** `?type=` → the form type; anything else (missing, unknown) opens a PO. */
export function parseInboundFormType(raw: string | null | undefined): InboundFormType {
  return raw?.trim().toUpperCase() === 'RETURN' ? 'RETURN' : 'PO';
}

/** `?id=` → a landed inbound order id; null when absent or not an id. */
export function parseInboundFormOrderId(raw: string | null | undefined): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * The form's href on a face (desk `/purchasing/new`, phone `/m/receiving/order`):
 * `id` reopens a landed order; else `type` (PO is the default, never written).
 */
export function inboundOrderFormHref(face: 'desk' | 'phone', opts: { type?: InboundFormType; id?: number } = {}): string {
  const base = face === 'desk' ? RECEIVING_PATHS.purchaseNew : RECEIVING_PATHS.purchaseNewMobile;
  if (opts.id != null) return `${base}?${INBOUND_FORM_ID_PARAM}=${opts.id}`;
  return opts.type && opts.type !== 'PO' ? `${base}?${INBOUND_FORM_TYPE_PARAM}=${opts.type}` : base;
}

export interface InboundOrderChoice {
  value: string;
  label: string;
  /** One quiet line under the label, when a face has room for it. */
  hint?: string;
}

/**
 * What Auto resolves to for the picked platform — the platform's default tier
 * (`defaultInboundTierForPlatform`): "Auto — Goodwill: tier 3 Low".
 */
export function inboundAutoPriorityLabel(platform: string, platformLabel: string | null): string {
  if (!platform.trim()) return 'Auto — follows platform';
  const tier = defaultInboundTierForPlatform(platform);
  return `Auto — ${platformLabel || platform}: tier ${tier} ${priorityOverrideTier(tier)?.label ?? ''}`.trimEnd();
}

/** Auto (labelled with what it resolves to) first, then the manual override tiers (same 0..3 as `priority_tier`). */
export function inboundPriorityChoices(autoLabel = 'Auto — follows platform'): InboundOrderChoice[] {
  return [
    { value: INBOUND_PRIORITY_AUTO, label: autoLabel },
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

// ─── pasted lists ────────────────────────────────────────────────────────────

/** A pasted / typed list → its entries: split on newlines, commas, semicolons and spaces; blanks and repeats dropped. */
export function splitPastedList(text: string): string[] {
  return [...new Set(text.split(/[\s,;]+/).map((part) => part.trim()).filter(Boolean))];
}

// ─── tracking ────────────────────────────────────────────────────────────────

/** The comparable form of a typed tracking number (canonical when it parses, else as typed). */
function trackingKey(raw: string): string {
  const value = raw.trim();
  return extractCanonicalTracking(value) || value;
}

/**
 * Adds scanned / pasted numbers (canonical): each fills the first empty slot,
 * else a new one, up to the schema's cap; a number already on the order is
 * skipped. Unchanged draft (same object) when nothing new was added.
 */
export function addInboundTracking(draft: InboundOrderDraft, numbers: readonly string[]): InboundOrderDraft {
  const tracking = [...draft.tracking];
  const seen = new Set(tracking.map((t) => trackingKey(t.number)).filter(Boolean));
  let changed = false;
  for (const raw of numbers) {
    const number = trackingKey(raw);
    if (!number || seen.has(number)) continue;
    const blank = tracking.findIndex((t) => !t.number.trim());
    if (blank >= 0) tracking[blank] = { ...tracking[blank], number };
    else if (tracking.length < TRACKING_LIMIT) tracking.push({ number, carrier: '' });
    else break;
    seen.add(number);
    changed = true;
  }
  return changed ? { ...draft, tracking } : draft;
}

/** Drops one tracking number; the form always keeps one slot. */
export function removeInboundTracking(draft: InboundOrderDraft, index: number): InboundOrderDraft {
  const tracking = draft.tracking.filter((_, i) => i !== index);
  return { ...draft, tracking: tracking.length ? tracking : [{ number: '', carrier: '' }] };
}

/** The carrier a row names: the typed one, else detected from the number; null while unknown. */
export function inboundTrackingCarrier(tracking: InboundOrderTracking): string | null {
  if (tracking.carrier.trim()) return tracking.carrier.trim();
  const number = extractCanonicalTracking(tracking.number.trim());
  if (number.length < 8) return null;
  const carrier = String(detectCarrier(number));
  return carrier === 'Unknown' ? null : carrier;
}

// ─── listing serials ─────────────────────────────────────────────────────────

/**
 * Adds serials the listing shows to a line (paste many at once); a serial
 * already on the line — compared without spaces, case-blind — is skipped.
 */
export function addInboundLineSerials(line: Pick<InboundOrderLine, 'listingSerials'>, serials: readonly string[]): Partial<InboundOrderLine> {
  const listingSerials = [...(line.listingSerials ?? [])];
  const key = (serial: string) => serial.replace(/\s+/g, '').toUpperCase();
  const seen = new Set(listingSerials.map(key));
  for (const raw of serials) {
    const serial = raw.trim();
    if (!serial || seen.has(key(serial)) || listingSerials.length >= LISTING_SERIALS_LIMIT) continue;
    seen.add(key(serial));
    listingSerials.push(serial);
  }
  return { listingSerials };
}
