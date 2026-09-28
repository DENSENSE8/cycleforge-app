/**
 * The chat order FIELD CONTRACT — phone orders (`HANDOFF-manual-phone-order.md`
 * "Field contract") and every other sales channel the org sells on. One
 * schema, three readers:
 *
 *  - the assistant's `draft_manual_order` tool builds it from a conversation,
 *  - the chat's order card renders it and deep-links it into the intake form
 *    (`/orders/new?prefill=<base64url json>`),
 *  - the intake form reads the same `prefill` back into its draft.
 *
 * What an order needs depends on its channel ({@link orderChannelKind}): a
 * phone / walk-in order gets a generated `<prefix>000123` number and needs a
 * reachable customer and priced catalog lines; a marketplace order carries the
 * marketplace's own order number, the listing it sold from (item number), the
 * buyer, the ship-to and how it ships (tracking, or buy a label) — the same
 * facts the release gates check.
 *
 * Client-safe: no server imports. Money is integer cents; the order rows store
 * `sale_amount` as the LINE total in dollars (unit × qty).
 */

import { z } from 'zod';
import { CONDITION_GRADES } from '@/lib/conditions';
import type { CanonicalOrderIntake } from '@/lib/orders/canonical-order-intake';

/** The standalone new-sales-order page (header `+`, `C`). */
export const NEW_SALES_ORDER_PATH = '/orders/new';
/** Query param the intake form reads a prefilled new order from. */
export const ORDER_PREFILL_PARAM = 'prefill';
/** `orders.account_source` for a phone order. */
export const PHONE_ORDER_CHANNEL = 'Phone';
/** Generated phone order numbers: `PH-000123`. */
export const PHONE_ORDER_PREFIX = 'PH-';

/** `<prefix>000123` — the generated number for a channel's sequence. */
export function formatManualOrderNumber(prefix: string, sequence: number): string {
  return `${prefix}${String(Math.max(1, Math.trunc(sequence))).padStart(6, '0')}`;
}

/** Is this number one generated under `prefix` (so a taken one may be re-generated)? */
export function isGeneratedOrderNumber(prefix: string, orderNumber: string): boolean {
  return orderNumber.startsWith(prefix) && /^\d{1,9}$/.test(orderNumber.slice(prefix.length));
}

/**
 * The generated order-number prefix a channel carries: Phone → `PH-`, any
 * other manual account → its initials (`walk-in` → `WI-`). Marketplaces
 * bring their own numbers, so this is only offered for them — never forced.
 */
export function orderNumberPrefix(channel: string): string {
  if (channel.trim().toLowerCase() === PHONE_ORDER_CHANNEL.toLowerCase()) return PHONE_ORDER_PREFIX;
  const words = channel.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  const initials = words.length > 1 ? words.map((w) => w[0]).join('') : (words[0] ?? 'MN');
  return `${initials.slice(0, 2).padEnd(2, 'X')}-`;
}

/** Platforms whose orders are taken by hand (no marketplace order number, listing or buyer account). */
const MANUAL_PLATFORM_SLUGS: Record<string, true> = {
  phone: true, other: true, manual: true, trade_in: true, repair: true, walk_in: true, 'walk-in': true,
};

export type OrderChannelKind = 'phone' | 'manual' | 'marketplace';

/** Which field set the draft's channel needs — by the platform the channel belongs to. */
export function orderChannelKind(draft: Pick<ManualOrderDraft, 'channel' | 'channelPlatform'>): OrderChannelKind {
  if (draft.channel.trim().toLowerCase() === PHONE_ORDER_CHANNEL.toLowerCase()) return 'phone';
  const platform = draft.channelPlatform.trim().toLowerCase();
  return platform && !Object.hasOwn(MANUAL_PLATFORM_SLUGS, platform) ? 'marketplace' : 'manual';
}

const text = (max: number) => z.string().trim().max(max);
const positiveOrNull = z.number().positive().max(100_000).nullable();

export const manualOrderAddressSchema = z.object({
  address1: text(200),
  address2: text(200),
  city: text(100),
  state: text(60),
  postalCode: text(20),
  country: text(60),
});
export type ManualOrderAddress = z.infer<typeof manualOrderAddressSchema>;

export const manualOrderCustomerSchema = z.object({
  /** An existing `customers` row (same org) — `null` = create one on submit. */
  id: z.number().int().positive().nullable(),
  name: text(200),
  phone: text(40),
  email: text(200),
  shipTo: manualOrderAddressSchema,
});
export type ManualOrderCustomer = z.infer<typeof manualOrderCustomerSchema>;

export const manualOrderLineSchema = z.object({
  skuCatalogId: z.number().int().positive().nullable(),
  sku: text(100),
  /** Identity title (`resolveSkuIdentityTitle` — the Zoho item governs); the listing's title before pairing. */
  title: text(300),
  quantity: z.number().int().min(1).max(9999),
  condition: z.enum(CONDITION_GRADES).nullable(),
  unitPriceCents: z.number().int().min(0).max(100_000_000).nullable(),
  /** The marketplace listing's item number (`orders.item_number`) — from a listing link or as said. */
  itemNumber: text(60).default(''),
});
export type ManualOrderLine = z.infer<typeof manualOrderLineSchema>;

export const manualOrderParcelSchema = z.object({
  weightOz: positiveOrNull,
  lengthIn: positiveOrNull,
  widthIn: positiveOrNull,
  heightIn: positiveOrNull,
});

export const manualOrderDraftSchema = z.object({
  orderNumber: text(120),
  /** The number was generated (not typed): a fresh one is assigned if it was taken meanwhile. */
  orderNumberGenerated: z.boolean(),
  /** `orders.account_source` — `Phone`, or one of the org's platform / account slugs. */
  channel: text(80),
  /** The platform slug the channel belongs to (`ebay` for the `USAV` account) — '' for Phone. */
  channelPlatform: text(40).default(''),
  /** The label the org's channel picker shows (`eBay · USAV`). */
  channelLabel: text(120).default(''),
  customer: manualOrderCustomerSchema,
  lines: z.array(manualOrderLineSchema).max(20),
  /** Civil date `YYYY-MM-DD` → the order's ship-by deadline. */
  shipBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  isUrgent: z.boolean(),
  buyerNote: text(1000),
  parcel: manualOrderParcelSchema.nullable(),
  currency: z.string().trim().length(3),
  /** The listing link the order sold from, as given. */
  listingUrl: text(500).default(''),
  /** Carrier tracking already bought elsewhere — linked as the order's shipment on create. */
  trackingNumber: text(80).default(''),
  /** No tracking yet: the label is bought in the intake form after create. */
  buyLabel: z.boolean().default(false),
});
export type ManualOrderDraft = z.infer<typeof manualOrderDraftSchema>;

export function emptyManualOrderDraft(): ManualOrderDraft {
  return {
    orderNumber: '',
    orderNumberGenerated: false,
    channel: PHONE_ORDER_CHANNEL,
    channelPlatform: '',
    channelLabel: PHONE_ORDER_CHANNEL,
    customer: {
      id: null,
      name: '',
      phone: '',
      email: '',
      shipTo: { address1: '', address2: '', city: '', state: '', postalCode: '', country: 'US' },
    },
    lines: [],
    shipBy: null,
    isUrgent: false,
    buyerNote: '',
    parcel: null,
    currency: 'USD',
    listingUrl: '',
    trackingNumber: '',
    buyLabel: false,
  };
}

export interface ManualOrderTotals {
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  /** Every line carries a unit price. */
  priced: boolean;
}

/** Shipping and tax are not captured at intake yet — they are 0 until a label / tax rule sets them. */
export function manualOrderTotals(lines: readonly Pick<ManualOrderLine, 'quantity' | 'unitPriceCents'>[]): ManualOrderTotals {
  let subtotalCents = 0;
  let priced = lines.length > 0;
  for (const line of lines) {
    if (line.unitPriceCents == null) priced = false;
    else subtotalCents += line.unitPriceCents * line.quantity;
  }
  return { subtotalCents, shippingCents: 0, taxCents: 0, totalCents: subtotalCents, priced };
}

export function formatCents(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

/** What is still needed before this order can be created — short noun phrases, in form order, per channel. */
export function manualOrderMissing(draft: ManualOrderDraft): string[] {
  const missing: string[] = [];
  const kind = orderChannelKind(draft);
  const marketplace = kind === 'marketplace';
  if (!draft.channel.trim()) missing.push('Sales channel');
  if (marketplace && (!draft.orderNumber || draft.orderNumberGenerated)) missing.push('Marketplace order number');
  const c = draft.customer;
  if (c.id == null) {
    if (!c.name) missing.push(marketplace ? 'Buyer name' : 'Customer name');
    if (kind === 'phone' && !c.phone) missing.push('Phone number');
  }
  const s = c.shipTo;
  if (!s.address1) missing.push('Street address');
  if (!s.city) missing.push('City');
  if (!s.state) missing.push('State');
  if (!s.postalCode) missing.push('ZIP');
  if (draft.lines.length === 0) missing.push(marketplace ? 'Listing link or item number' : 'A product');
  draft.lines.forEach((line, i) => {
    if (marketplace) {
      if (!line.itemNumber) missing.push(`Listing link or item number for line ${i + 1}`);
      return;
    }
    if (line.skuCatalogId == null) missing.push(`A catalog product for line ${i + 1}`);
    if (line.unitPriceCents == null) missing.push(`Price for line ${i + 1}`);
  });
  if (!marketplace && !draft.orderNumber) missing.push('Order number');
  if (marketplace && !draft.trackingNumber && !draft.buyLabel) missing.push('Tracking number, or buy a label');
  return missing;
}

// ─── prefill transport (URL-safe base64 of the JSON contract) ────────────────

function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(raw: string): string {
  const b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeOrderPrefill(draft: ManualOrderDraft): string {
  return toBase64Url(JSON.stringify(draft));
}

/** `null` for anything that is not a valid contract — a hand-edited URL never half-fills the form. */
export function decodeOrderPrefill(raw: string | null | undefined): ManualOrderDraft | null {
  if (!raw) return null;
  try {
    const parsed = manualOrderDraftSchema.safeParse(JSON.parse(fromBase64Url(raw)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The intake form, opened on a new order prefilled with this draft. */
export function orderPrefillHref(draft: ManualOrderDraft): string {
  return `${NEW_SALES_ORDER_PATH}?${ORDER_PREFILL_PARAM}=${encodeOrderPrefill(draft)}`;
}

/**
 * The draft projected onto the form's canonical intake: the first line fills
 * the single-line identity fields; the whole contract rides as `phoneOrder`
 * so the create call carries every line, the customer and the ship-by.
 */
export function manualOrderDraftToIntake(draft: ManualOrderDraft): Partial<CanonicalOrderIntake> {
  const first = draft.lines[0];
  const parcel = draft.parcel;
  return {
    orderNumber: draft.orderNumber,
    platformChosen: draft.channel,
    importOrigin: 'manual',
    sku: first?.sku ?? '',
    itemNumber: first?.itemNumber ?? '',
    productTitle: first?.title ?? '',
    quantity: String(first?.quantity ?? 1),
    condition: first?.condition ?? '',
    trackingNumbers: draft.trackingNumber ? [draft.trackingNumber] : [],
    weightOz: parcel?.weightOz ?? null,
    dimL: parcel?.lengthIn ?? null,
    dimW: parcel?.widthIn ?? null,
    dimH: parcel?.heightIn ?? null,
    phoneOrder: draft,
  };
}

// ─── same-tab hand-off (the desk rewrites its URL and drops unknown params) ──

const PREFILL_STASH_KEY = 'cf:order-prefill';
/** A stashed prefill older than this is a stale click, not this session. */
const PREFILL_STASH_TTL_MS = 5 * 60_000;

/** Called by "Open in form" right before navigating — the overlay reads it back. */
export function stashOrderPrefill(draft: ManualOrderDraft): void {
  try {
    sessionStorage.setItem(PREFILL_STASH_KEY, JSON.stringify({ at: Date.now(), raw: encodeOrderPrefill(draft) }));
  } catch {
    /* storage blocked — the URL param still carries it */
  }
}

/** The stashed prefill (raw, URL-param encoded), or null. Not consumed here — {@link clearStashedOrderPrefill} ends it. */
export function readStashedOrderPrefill(): string | null {
  try {
    const stash = JSON.parse(sessionStorage.getItem(PREFILL_STASH_KEY) ?? 'null') as { at?: number; raw?: string } | null;
    return stash?.raw && Date.now() - Number(stash.at) < PREFILL_STASH_TTL_MS ? stash.raw : null;
  } catch {
    return null;
  }
}

export function clearStashedOrderPrefill(): void {
  try {
    sessionStorage.removeItem(PREFILL_STASH_KEY);
  } catch {
    /* nothing to clear */
  }
}
