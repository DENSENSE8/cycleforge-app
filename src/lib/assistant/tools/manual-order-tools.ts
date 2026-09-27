/**
 * Orders through the chat — phone orders (`HANDOFF-manual-phone-order.md`,
 * Prompt B) and orders from any of the org's sales channels.
 *
 *  - `draft_manual_order` (GREEN, no writes): turns what the user said into
 *    the field contract (`manualOrderDraftSchema`) — the channel picked from
 *    the org's own platforms / accounts (`orderPlatformChoices`), customer
 *    matched by phone / email or new, products resolved through the catalog
 *    (titles by `resolveSkuIdentityTitle`) or a listing link / item number, a
 *    generated `<prefix>000123` number for a manual channel or the
 *    marketplace's own, tracking or buy-a-label, ship-by, parcel — and shows
 *    it as an inline order card listing what is still needed for THAT
 *    channel. An order number or tracking the org already has is surfaced as
 *    the existing order instead. It UPDATES this thread's draft: each call
 *    only needs the fields the user just gave.
 *  - `create_manual_order` (YELLOW): the confirm-before-write pattern of
 *    `link_manual_to_sku`. `propose` reads this thread's latest draft card (the
 *    model types nothing), files an `order.create_manual` agent mutation, and
 *    asks; the operator's "yes" on a LATER turn approves it through
 *    `reviewAgentMutation`, which runs the same create as POST /api/orders/add.
 *
 * Label buying stays in the intake form; payment is `request_payment`.
 */

import { z } from 'zod';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { askOnlyRefusal } from '@/lib/assistant/access-mode';
import { applyAgentMutation, reviewAgentMutation } from '@/lib/assistant/mutations/apply-agent-mutation';
import { brandReportEnvelope } from '@/lib/assistant/tool-artifact';
import type { ArtifactOrderDraft } from '@/lib/assistant/ui-artifacts';
import { wouldExceedPlanCeiling } from '@/lib/billing/plan-ceilings';
import { CONDITION_GRADES, resolveConditionGrade, type ConditionGrade } from '@/lib/conditions';
import { CUSTOMER_BY_CONTACT_SQL } from '@/lib/neon/customer-queries';
import {
  announceOrderCreated,
  nextManualOrderNumber,
  readOrderLines,
  type ManualOrderCreated,
} from '@/lib/orders/create-order';
import {
  PHONE_ORDER_CHANNEL,
  emptyManualOrderDraft,
  formatCents,
  isGeneratedOrderNumber,
  manualOrderDraftSchema,
  manualOrderMissing,
  manualOrderTotals,
  orderChannelKind,
  orderNumberPrefix,
  type ManualOrderDraft,
  type ManualOrderLine,
} from '@/lib/orders/manual-order-draft';
import { inferMarketplaceFromOrderId, normalizeMarketplaceOrderId } from '@/lib/marketplace-order-id';
import type { PlatformAccountRow, PlatformRow } from '@/lib/neon/catalog-queries';
import type { StoreLinkRow } from '@/lib/catalog/integration-store-links';
import { orderPlatformChoices } from '@/lib/platform-display';
import { listingUrlItemId, listingUrlPlatform } from '@/lib/receiving/listing-links';
import { normalizeListingHref } from '@/lib/receiving/listing-href';
import { extractCanonicalTracking } from '@/lib/tracking-format';
import { escapeLike } from '@/lib/sql-like';
import { resolveSkuIdentityTitle } from '@/lib/sku/sku-identity-law';
import { STAFF_SCHEDULE_TIMEZONE } from '@/lib/staff-schedule';
import type { AssistantToolCtx, AssistantToolDef, AssistantToolDeps } from './types';

export const DRAFT_MANUAL_ORDER_TOOL_NAME = 'draft_manual_order';
export const CREATE_MANUAL_ORDER_TOOL_NAME = 'create_manual_order';
const KIND = 'order.create_manual' as const;

type Rows = Array<Record<string, unknown>>;
type Query = (orgId: OrgId, text: string, params: ReadonlyArray<unknown>) => Promise<{ rows: Rows }>;

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

// ─── ship-by: what a caller says → a civil date ──────────────────────────────

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * "Friday", "tomorrow", "10/2", "Oct 2", "2026-10-02" → `YYYY-MM-DD` in the
 * warehouse's time zone; `null` when it is not a date. A weekday is the next
 * one on or after today ("by Friday" on a Friday is today); "next Friday" skips today.
 */
export function resolveShipBy(raw: string, now: Date = new Date()): string | null {
  const t = raw.trim().toLowerCase().replace(/^(by|on|ship by)\s+/, '').replace(/[.,]/g, '').trim();
  if (!t) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: STAFF_SCHEDULE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const today = new Date(Date.UTC(part('year'), part('month') - 1, part('day')));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const plusDays = (n: number) => new Date(today.getTime() + n * 86_400_000);
  const valid = (y: number, m: number, d: number) => {
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
  };
  /** A month/day with no year: this year, or next year once it has passed. */
  const upcoming = (m: number, d: number) => {
    const date = valid(today.getUTCFullYear(), m, d);
    if (!date) return null;
    return date < today ? valid(today.getUTCFullYear() + 1, m, d) : date;
  };

  let m: RegExpMatchArray | null;
  if ((m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    const date = valid(Number(m[1]), Number(m[2]), Number(m[3]));
    return date ? iso(date) : null;
  }
  if (t === 'today') return iso(today);
  if (t === 'tomorrow') return iso(plusDays(1));
  if ((m = t.match(/^(next |this )?([a-z]+)$/))) {
    const idx = WEEKDAYS.findIndex((w) => w === m![2] || w.slice(0, 3) === m![2]);
    if (idx >= 0) {
      let delta = (idx - today.getUTCDay() + 7) % 7;
      if (m[1] === 'next ' && delta === 0) delta = 7;
      return iso(plusDays(delta));
    }
  }
  if ((m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/))) {
    if (m[3]) {
      const y = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
      const date = valid(y, Number(m[1]), Number(m[2]));
      return date ? iso(date) : null;
    }
    const date = upcoming(Number(m[1]), Number(m[2]));
    return date ? iso(date) : null;
  }
  if ((m = t.match(/^([a-z]+) (\d{1,2})(?:st|nd|rd|th)?$/))) {
    const month = MONTHS.indexOf(m[1].slice(0, 3));
    if (month >= 0) {
      const date = upcoming(month + 1, Number(m[2]));
      return date ? iso(date) : null;
    }
  }
  return null;
}

// ─── catalog: product words / SKU → one catalog product, or the choices ──────

interface CatalogHit {
  skuCatalogId: number;
  sku: string;
  title: string;
}

/** Exact catalog SKU, punctuation-insensitive (the paperwork SKU key). */
const EXACT_SKU_SQL = `SELECT sc.id, sc.sku, i.name AS zoho_item_title, sc.product_title AS catalog_product_title
  FROM sku_catalog sc
  LEFT JOIN items i ON i.zoho_item_id = sc.provider_item_id
                   AND i.organization_id = sc.organization_id AND i.status = 'active'
 WHERE sc.organization_id = $1
   AND regexp_replace(UPPER(TRIM(sc.sku)), '[^A-Z0-9]', '', 'g') = regexp_replace(UPPER(TRIM($2::text)), '[^A-Z0-9]', '', 'g')
 ORDER BY sc.is_active DESC, sc.id
 LIMIT 1`;

/** Every word must appear in the SKU, the catalog title or the Zoho item name; stocked + active first. */
const WORDS_SQL = `SELECT sc.id, sc.sku, i.name AS zoho_item_title, sc.product_title AS catalog_product_title,
       (SELECT COALESCE(sum(bc.qty), 0) FROM bin_contents bc
         WHERE bc.organization_id = $1 AND bc.sku = sc.sku AND bc.qty > 0) AS on_hand
  FROM sku_catalog sc
  LEFT JOIN items i ON i.zoho_item_id = sc.provider_item_id
                   AND i.organization_id = sc.organization_id AND i.status = 'active'
 WHERE sc.organization_id = $1
   AND (sc.is_active OR EXISTS (SELECT 1 FROM bin_contents b2
         WHERE b2.organization_id = $1 AND b2.sku = sc.sku AND b2.qty > 0))
   AND NOT EXISTS (
     SELECT 1 FROM unnest($2::text[]) AS w(word)
      WHERE concat_ws(' ', sc.sku, sc.product_title, i.name) NOT ILIKE '%' || w.word || '%' ESCAPE '\\')
 ORDER BY on_hand DESC, sc.sku
 LIMIT 6`;

const FILLER_WORDS: Record<string, true> = {
  a: true, an: true, the: true, of: true, for: true, and: true, with: true, to: true, in: true,
  each: true, pcs: true, piece: true, pieces: true, unit: true, units: true, qty: true,
};

/** "two Bose 151 brackets, black" → ['bose', '151', 'bracket', 'black']. */
export function productWords(query: string): string[] {
  const words = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0 && !Object.hasOwn(FILLER_WORDS, w))
    // "brackets" → "bracket" so a plural matches a singular title; short words keep their s.
    .map((w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
  return [...new Set(words)].slice(0, 8);
}

function catalogHit(row: Record<string, unknown>): CatalogHit {
  const sku = str(row.sku);
  return {
    skuCatalogId: Number(row.id),
    sku,
    title:
      resolveSkuIdentityTitle({
        zoho_item_title: str(row.zoho_item_title),
        catalog_product_title: str(row.catalog_product_title),
        sku,
      }) || sku,
  };
}

async function findProducts(query: Query, orgId: OrgId, text: string): Promise<CatalogHit[]> {
  const exact = (await query(orgId, EXACT_SKU_SQL, [orgId, text])).rows[0];
  if (exact) return [catalogHit(exact)];
  const words = productWords(text);
  if (words.length === 0) return [];
  const { rows } = await query(orgId, WORDS_SQL, [orgId, words.map((w) => escapeLike(w))]);
  return rows.map(catalogHit);
}

// ─── this thread's draft (the order card the tools persisted) ────────────────

/** The newest order card in a thread from either tool — a `created` one means the draft was used. */
const LATEST_CARD_SQL = `SELECT a.value->>'producedBy' AS produced_by, a.value->'artifact' AS artifact
  FROM ai_chat_messages m
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(m.analysis->'artifacts') = 'array' THEN m.analysis->'artifacts' ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS a(value, ord)
 WHERE m.organization_id = $1 AND m.session_id = $2 AND m.role = 'assistant' AND m.superseded_at IS NULL
   AND a.value->'artifact'->>'kind' = 'order_draft'
   AND a.value->>'producedBy' IN ('${DRAFT_MANUAL_ORDER_TOOL_NAME}', '${CREATE_MANUAL_ORDER_TOOL_NAME}')
 ORDER BY m.id DESC, a.ord DESC
 LIMIT 1`;

const cardSchema = z.object({
  status: z.enum(['draft', 'created']),
  draft: manualOrderDraftSchema,
  customerMatch: z.enum(['existing', 'new']),
  unresolved: z.array(
    z.object({
      query: z.string(),
      quantity: z.number().int().min(1),
      unitPriceCents: z.number().int().nullable(),
      condition: z.enum(CONDITION_GRADES).nullable(),
      candidates: z.array(z.object({ skuCatalogId: z.number(), sku: z.string(), title: z.string() })),
    }),
  ),
  channelChoices: z.array(z.object({ value: z.string(), label: z.string() })).default([]),
});
type DraftCard = z.infer<typeof cardSchema>;

/** The thread's open draft; `null` when there is none (or the newest card is an order already created). */
async function openDraft(query: Query, orgId: OrgId, sessionId: string | null | undefined): Promise<DraftCard | null> {
  if (!sessionId) return null;
  const row = (await query(orgId, LATEST_CARD_SQL, [orgId, sessionId])).rows[0];
  if (!row || row.produced_by !== DRAFT_MANUAL_ORDER_TOOL_NAME) return null;
  const parsed = cardSchema.safeParse(row.artifact);
  return parsed.success && parsed.data.status === 'draft' ? parsed.data : null;
}

// ─── channel: what was said → one of the org's own sales channels ────────────

export interface ChannelChoice {
  /** `orders.account_source` — the platform slug or the account slug. */
  value: string;
  label: string;
  /** The platform the channel belongs to — '' for Phone. */
  platform: string;
}

const PLATFORMS_SQL = `SELECT id, slug, label, is_active FROM platforms WHERE organization_id = $1 ORDER BY sort_order, id`;
const ACCOUNTS_SQL = `SELECT id, platform_id, slug, label, is_active FROM platform_accounts WHERE organization_id = $1 ORDER BY id`;
const STORE_LINKS_SQL = `SELECT platform_account_id FROM integration_store_links WHERE organization_id = $1`;

/** Phone, then the same choices the intake form's channel picker lists. */
async function channelChoices(query: Query, orgId: OrgId): Promise<ChannelChoice[]> {
  const [platforms, accounts, links] = await Promise.all([
    query(orgId, PLATFORMS_SQL, [orgId]),
    query(orgId, ACCOUNTS_SQL, [orgId]),
    query(orgId, STORE_LINKS_SQL, [orgId]),
  ]);
  const platformRows = platforms.rows as unknown as PlatformRow[];
  const accountRows = accounts.rows as unknown as PlatformAccountRow[];
  const slugById = new Map(platformRows.map((p) => [String(p.id), str(p.slug).toLowerCase()]));
  const platformOf = (value: string): string => {
    const v = value.toLowerCase();
    if (platformRows.some((p) => str(p.slug).toLowerCase() === v)) return v;
    const account = accountRows.find((a) => str(a.slug).toLowerCase() === v);
    return account ? (slugById.get(String(account.platform_id)) ?? '') : '';
  };
  const choices = orderPlatformChoices(platformRows, accountRows, links.rows as unknown as StoreLinkRow[])
    .filter((c) => c.value.toLowerCase() !== PHONE_ORDER_CHANNEL.toLowerCase())
    .map((c) => ({ ...c, platform: platformOf(c.value) }));
  return [{ value: PHONE_ORDER_CHANNEL, label: PHONE_ORDER_CHANNEL, platform: '' }, ...choices];
}

const CHANNEL_FILLER: Record<string, true> = {
  store: true, account: true, shop: true, order: true, orders: true, our: true, the: true, on: true, from: true, via: true, channel: true,
};
const channelWords = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** The choices a said channel names: an exact value / label, else every word in one choice. */
export function matchChannel(said: string, choices: readonly ChannelChoice[]): ChannelChoice[] {
  const q = channelWords(said).join(' ');
  if (!q) return [];
  const exact = choices.filter((c) => channelWords(c.value).join(' ') === q || channelWords(c.label).join(' ') === q);
  if (exact.length > 0) return exact.slice(0, 1);
  const words = channelWords(said).filter((w) => !Object.hasOwn(CHANNEL_FILLER, w));
  if (words.length === 0) return [];
  // "eBay" alone names every linked eBay account — the user picks one.
  return choices.filter((c) => {
    const have = new Set(channelWords(`${c.label} ${c.value} ${c.platform}`));
    return words.every((w) => have.has(w));
  });
}

// ─── listing: a link or item number → the line it sold ───────────────────────

/** The listing's item number → its paired catalog product (when paired) and title. */
const LISTING_SQL = `SELECT spi.listing_title, sc.id, sc.sku, i.name AS zoho_item_title, sc.product_title AS catalog_product_title
  FROM sku_platform_ids spi
  LEFT JOIN sku_catalog sc ON sc.id = spi.sku_catalog_id AND sc.organization_id = spi.organization_id
  LEFT JOIN items i ON i.zoho_item_id = sc.provider_item_id
                   AND i.organization_id = sc.organization_id AND i.status = 'active'
 WHERE spi.organization_id = $1 AND spi.platform_item_id = $2
 ORDER BY (sc.id IS NOT NULL) DESC, spi.is_active DESC, spi.id DESC
 LIMIT 1`;

async function listingLine(query: Query, orgId: OrgId, itemNumber: string, platformLabel: string): Promise<ManualOrderLine> {
  const row = (await query(orgId, LISTING_SQL, [orgId, itemNumber])).rows[0];
  const fields = { quantity: 1, condition: null, unitPriceCents: null, itemNumber };
  if (row?.id != null) return { ...catalogHit(row), ...fields };
  const title = str(row?.listing_title) || `${platformLabel || 'Marketplace'} listing ${itemNumber}`;
  return { skuCatalogId: null, sku: '', title: title.slice(0, 300), ...fields };
}

// ─── duplicates: an order number or tracking this org already has ───────────

export interface DuplicateOrder {
  orderPk: number;
  orderNumber: string;
  matchedOn: 'order number' | 'tracking';
}

const DUP_ORDER_NUMBER_SQL = `SELECT id, order_id FROM orders
 WHERE organization_id = $1 AND order_id = ANY($2::text[])
 ORDER BY id LIMIT 1`;
const DUP_TRACKING_SQL = `SELECT o.id, o.order_id FROM orders o
  JOIN shipping_tracking_numbers s ON s.id = o.shipment_id AND s.organization_id = o.organization_id
 WHERE o.organization_id = $1 AND s.tracking_number_normalized = $2
 ORDER BY o.id LIMIT 1`;

/** The existing order this draft would duplicate — by a typed order number, then by tracking. */
export async function findDuplicateOrder(query: Query, orgId: OrgId, draft: ManualOrderDraft): Promise<DuplicateOrder | null> {
  const number = draft.orderNumber.trim();
  if (number && !draft.orderNumberGenerated) {
    const forms = [...new Set([number, normalizeMarketplaceOrderId(number)])];
    const hit = (await query(orgId, DUP_ORDER_NUMBER_SQL, [orgId, forms])).rows[0];
    if (hit) return { orderPk: Number(hit.id), orderNumber: str(hit.order_id), matchedOn: 'order number' };
  }
  const tracking = extractCanonicalTracking(draft.trackingNumber);
  if (tracking.length >= 8) {
    const hit = (await query(orgId, DUP_TRACKING_SQL, [orgId, tracking])).rows[0];
    if (hit) return { orderPk: Number(hit.id), orderNumber: str(hit.order_id), matchedOn: 'tracking' };
  }
  return null;
}

/**
 * The identifiers this turn's message itself carries — a marketplace order #
 * (eBay 2-5-5 / Amazon 3-7-7), a listing link, a tracking number said as one.
 * They fill what the model left out, so an identifier is never lost or retyped.
 */
export function identifiersFromMessage(message: string): { orderNumber: string | null; listingUrl: string | null; trackingNumber: string | null } {
  const orderNumber = (message.match(/\b\d{2,3}-\d{5,7}-\d{5,7}\b/g) ?? []).find((t) => inferMarketplaceFromOrderId(t)) ?? null;
  const listingUrl = (message.match(/\bhttps?:\/\/\S+|\bwww\.\S+/gi) ?? []).map((u) => u.replace(/[.,;)]+$/, '')).find((u) => listingUrlItemId(u)) ?? null;
  const tracking = message.match(/\b[Tt]racking(?:\s+(?:[Nn]umber|[Nn]o\.?|#))?\s*(?:is|:|=)?\s*([0-9A-Z]{2,}(?: [0-9A-Z]{2,})*)/)?.[1] ?? null;
  return { orderNumber, listingUrl, trackingNumber: tracking && extractCanonicalTracking(tracking).length >= 10 ? tracking.trim() : null };
}

/** Capitalized words that label a name rather than belong to it ("Customer Jane Doe"). */
const NAME_LABELS: Record<string, true> = {
  customer: true, buyer: true, client: true, name: true, named: true, order: true, phone: true, new: true,
  ship: true, bill: true, for: true, from: true, hi: true, hello: true, please: true,
};
const NAME_WORD = /^\p{Lu}[\p{L}\p{M}'’.-]*$/u;
const isNameWord = (w: string) => NAME_WORD.test(w) && !NAME_LABELS[w.toLowerCase().replace(/[.'’-]+$/, '')];
/** Clause edges a name never crosses: , ; : ( ) newline, and sentence ends. */
const NAME_CLAUSE_EDGE = /[,;:()\n!?]|\.\s/;

/**
 * The customer name as the user typed it, when the model passed only part of
 * it: "Phone order: Eval Caller mukeblst, …" drafted as "mukeblst" (or "Jane"
 * for "Jane Doe") widens over the capitalized words next to it in the same
 * clause. A name the message does not contain is kept as passed.
 */
export function nameAsSaid(said: string, message: string): string {
  const name = said.trim();
  if (!name) return said;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const hit = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu').exec(message);
  if (!hit) return said;
  const before = message.slice(0, hit.index);
  if (before && !/\s$/.test(before) && !NAME_CLAUSE_EDGE.test(before.slice(-1))) return said;
  const left = (before.split(NAME_CLAUSE_EDGE).pop() ?? '').trim().split(/\s+/).filter(Boolean);
  const right = (message.slice(hit.index + hit[0].length).split(NAME_CLAUSE_EDGE)[0] ?? '').trim().split(/\s+/).filter(Boolean);
  const words = [hit[0].trim()];
  for (let i = left.length - 1; i >= 0 && isNameWord(left[i]); i--) words.unshift(left[i]);
  for (let i = 0; i < right.length && isNameWord(right[i]); i++) words.push(right[i]);
  return words.length > 6 ? said : words.join(' ');
}

const duplicateSentence = (d: DuplicateOrder) =>
  `Order ${d.orderNumber} already exists${d.matchedOn === 'tracking' ? ' with this tracking number' : ''}`;

// ─── draft_manual_order ──────────────────────────────────────────────────────

const optionalText = (max: number) => z.string().trim().max(max).nullish();
const optionalNumber = z.coerce.number().positive().max(100_000).nullish();

const draftInput = z.object({
  newOrder: z.boolean().nullish().describe('true ONLY when the user starts a second, different order; default updates this conversation\'s draft.'),
  channel: optionalText(80).describe('Where the order was sold, as said: "phone", "eBay USAV", "Walmart", "Ecwid"… Omit for a phone order.'),
  customerName: optionalText(200).describe('Customer / buyer name.'),
  phone: optionalText(40),
  email: optionalText(200),
  address1: optionalText(200).describe('Street line of the ship-to address.'),
  address2: optionalText(200),
  city: optionalText(100),
  state: optionalText(60),
  zip: optionalText(20),
  country: optionalText(60),
  items: z
    .array(
      // Small models name the fields their own way ("sku", "qty", "price") — fold the aliases in.
      z.preprocess((raw) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
        const r = raw as Record<string, unknown>;
        return {
          product: r.product ?? r.sku ?? r.name ?? r.title ?? r.query ?? r.item,
          quantity: r.quantity ?? r.qty ?? r.count,
          unitPrice: r.unitPrice ?? r.unit_price ?? r.price ?? r.priceEach ?? r.price_each,
          condition: r.condition,
        };
      }, z.object({
        product: z.string().trim().min(1).max(200).describe('A SKU, or the product words the caller used, e.g. "Bose 151 bracket black".'),
        quantity: z.coerce.number().int().min(1).max(9999).nullish(),
        unitPrice: z
          .preprocess((v) => (typeof v === 'string' ? v.replace(/[^0-9.]/g, '') || undefined : v), z.coerce.number().min(0).max(1_000_000).nullish())
          .describe('Agreed price EACH, in dollars, e.g. 39.'),
        condition: z.string().trim().max(40).nullish().describe('new, like new, refurbished, used…'),
      })),
    )
    .max(20)
    .nullish()
    .describe('ALL products on the order — replaces the item list. Omit when only other fields changed.'),
  pick: z
    .array(z.object({ line: z.coerce.number().int().min(1).max(40), sku: z.string().trim().min(1).max(100) }))
    .max(20)
    .nullish()
    .describe('The user chose a product for a line from the card, e.g. [{"line":1,"sku":"00960-Bk"}].'),
  orderNumber: optionalText(120).describe('The order number as given (a marketplace order #, e.g. "12-34567-89012") — omit for a phone order, a number is generated.'),
  listingUrl: optionalText(500).describe('The listing link the item sold from, exactly as pasted.'),
  itemNumber: optionalText(60).describe('The listing\'s item number when given without a link.'),
  trackingNumber: optionalText(80).describe('Carrier tracking number, exactly as given.'),
  buyLabel: z.boolean().nullish().describe('true when the user says there is no tracking yet and a label will be bought.'),
  shipBy: optionalText(40).describe('As said: "Friday", "tomorrow", "10/2" or YYYY-MM-DD.'),
  urgent: z.boolean().nullish(),
  note: optionalText(1000),
  weightOz: optionalNumber,
  lengthIn: optionalNumber,
  widthIn: optionalNumber,
  heightIn: optionalNumber,
});

const toCents = (dollars: number | null | undefined) => (dollars == null ? null : Math.round(dollars * 100));
function toGrade(raw: string | null | undefined): ConditionGrade | null {
  const grade = resolveConditionGrade(raw ?? '');
  return (CONDITION_GRADES as readonly string[]).includes(grade) ? (grade as ConditionGrade) : null;
}

function lineSentence(l: Pick<ManualOrderLine, 'quantity' | 'title' | 'sku' | 'unitPriceCents'>, currency: string): string {
  const price = l.unitPriceCents == null ? '' : ` ${formatCents(l.unitPriceCents, currency)} each`;
  return `${l.quantity} × ${l.title}${l.sku ? ` (${l.sku})` : ''}${price}`;
}

export const draftManualOrder: AssistantToolDef<typeof draftInput, unknown> = {
  name: DRAFT_MANUAL_ORDER_TOOL_NAME,
  description:
    'Take an ORDER from the chat — a phone order (a caller buying by phone) or an order sold on any of the org\'s channels (eBay, Amazon, Walmart, a store account…): build or update this conversation\'s order draft card — channel, marketplace order number, listing link / item number, customer or buyer name, phone, email, ship-to address, products with quantity / price each / condition, tracking number (or buy a label), ship-by date, parcel. Pass only what the user just said; earlier details are kept. The card shows the user what is resolved and what is still needed for that channel. Never invent a price, address, order number, tracking or product. Do NOT call this when the user says create / place the order — that is create_manual_order with {"action":"propose"}.',
  permission: 'orders.view',
  inputSchema: draftInput,
  run: async (input, ctx: AssistantToolCtx, deps: AssistantToolDeps) => {
    const org = ctx.organizationId;
    const query: Query = (orgId, text, params) => deps.query(orgId, text, params);
    const inMessage = identifiersFromMessage(str(ctx.userMessage));
    input = {
      ...input,
      orderNumber: input.orderNumber || inMessage.orderNumber,
      listingUrl: input.listingUrl || inMessage.listingUrl,
      trackingNumber: input.trackingNumber || inMessage.trackingNumber,
    };
    const openCard = await openDraft(query, org, ctx.sessionId);
    // Small models flag every call "new": the same order number is still this draft.
    const sameOrder = openCard != null && input.orderNumber != null && normalizeMarketplaceOrderId(input.orderNumber) === normalizeMarketplaceOrderId(openCard.draft.orderNumber);
    const base = input.newOrder && !sameOrder ? null : openCard;
    const draft: ManualOrderDraft = base ? structuredClone(base.draft) : emptyManualOrderDraft();
    let unresolved: DraftCard['unresolved'] = base ? structuredClone(base.unresolved) : [];
    const notes: string[] = [];

    // ── customer: what was said, then the existing row it identifies ──
    const c = draft.customer;
    const contactChanged =
      (input.phone != null && input.phone !== c.phone) || (input.email != null && input.email !== c.email);
    if (input.customerName != null) c.name = nameAsSaid(input.customerName, str(ctx.userMessage));
    if (input.phone != null) c.phone = input.phone;
    if (input.email != null) c.email = input.email;
    const said = { address1: input.address1, address2: input.address2, city: input.city, state: input.state, postalCode: input.zip, country: input.country };
    for (const [key, value] of Object.entries(said) as Array<[keyof typeof c.shipTo, string | null | undefined]>) {
      if (value != null) c.shipTo[key] = value;
    }
    if (contactChanged) c.id = null;
    let customerMatch: 'existing' | 'new' = c.id != null ? 'existing' : 'new';
    if (c.id == null && (c.phone || c.email)) {
      const phoneDigits = c.phone.replace(/\D/g, '').slice(-10);
      const found = (await query(org, CUSTOMER_BY_CONTACT_SQL, [org, phoneDigits.length >= 7 ? phoneDigits : '', c.email.toLowerCase()])).rows[0];
      if (found) {
        c.id = Number(found.id);
        customerMatch = 'existing';
        // The stored record fills what the caller did not repeat; what they said wins.
        c.name = c.name || str(found.name);
        c.phone = c.phone || str(found.phone);
        c.email = c.email || str(found.email);
        const stored = {
          address1: str(found.shipping_address_1),
          address2: str(found.shipping_address_2),
          city: str(found.shipping_city),
          state: str(found.shipping_state),
          postalCode: str(found.shipping_postal_code),
          country: str(found.shipping_country),
        };
        for (const key of Object.keys(stored) as Array<keyof typeof stored>) c.shipTo[key] = c.shipTo[key] || stored[key];
      }
    }

    // ── products: the list the caller gave, each through the catalog ──
    if (input.items) {
      draft.lines = [];
      unresolved = [];
      for (const item of input.items) {
        const hits = await findProducts(query, org, item.product);
        const fields = {
          quantity: item.quantity ?? 1,
          unitPriceCents: toCents(item.unitPrice),
          condition: toGrade(item.condition),
        };
        if (hits.length === 1) draft.lines.push({ ...hits[0], ...fields, itemNumber: '' });
        else unresolved.push({ query: item.product, ...fields, candidates: hits.slice(0, 5) });
      }
    }
    // ── picks: "line N is SKU X" — N counts resolved lines, then the open ones ──
    if (input.pick?.length) {
      const resolvedCount = draft.lines.length;
      const promoted: number[] = [];
      for (const choice of input.pick) {
        const hit = (await query(org, EXACT_SKU_SQL, [org, choice.sku])).rows[0];
        if (!hit) {
          notes.push(`SKU ${choice.sku} is not in the catalog`);
          continue;
        }
        const product = catalogHit(hit);
        const i = choice.line - 1;
        if (i < resolvedCount) {
          draft.lines[i] = { ...draft.lines[i], ...product };
        } else if (unresolved[i - resolvedCount]) {
          const open = unresolved[i - resolvedCount];
          draft.lines.push({ ...product, quantity: open.quantity, unitPriceCents: open.unitPriceCents, condition: open.condition, itemNumber: '' });
          promoted.push(i - resolvedCount);
        }
      }
      unresolved = unresolved.filter((_, idx) => !promoted.includes(idx));
    }

    // ── channel: said, else implied by the listing link / order-number shape ──
    const listingHref = input.listingUrl ? normalizeListingHref(input.listingUrl) : null;
    let channelChoicesShown: DraftCard['channelChoices'] = base ? base.channelChoices : [];
    const impliedPlatform =
      (listingHref ? listingUrlPlatform(listingHref) : '') || (input.orderNumber ? (inferMarketplaceFromOrderId(input.orderNumber) ?? '') : '');
    const stillPhoneByDefault = !base || (draft.channel === PHONE_ORDER_CHANNEL && draft.orderNumberGenerated && !input.channel);
    if (input.channel || (impliedPlatform && stillPhoneByDefault)) {
      const choices = await channelChoices(query, org);
      const hits = input.channel
        ? matchChannel(input.channel, choices)
        : choices.filter((ch) => ch.platform === impliedPlatform);
      if (hits.length === 1) {
        draft.channel = hits[0].value;
        draft.channelPlatform = hits[0].platform;
        draft.channelLabel = hits[0].label;
        channelChoicesShown = [];
      } else if (hits.length > 1) {
        // One platform, several accounts: the order waits for the account; its fields are the platform's.
        draft.channel = '';
        draft.channelPlatform = hits.every((h) => h.platform === hits[0].platform) ? hits[0].platform : '';
        draft.channelLabel = '';
        channelChoicesShown = hits.slice(0, 8).map((h) => ({ value: h.value, label: h.label }));
      } else if (input.channel) {
        notes.push(`"${input.channel}" is not one of this workspace's sales channels`);
        channelChoicesShown = choices.slice(0, 12).map((h) => ({ value: h.value, label: h.label }));
      }
    }
    const kind = orderChannelKind(draft);

    // ── listing: link or item number → the sold line ──
    const itemNumber = (listingHref ? listingUrlItemId(listingHref) : '') || str(input.itemNumber);
    if (input.listingUrl) {
      draft.listingUrl = listingHref ?? input.listingUrl;
      if (!itemNumber) notes.push('That listing link carries no item number — paste the item number');
    }
    if (itemNumber) {
      const sold = await listingLine(query, org, itemNumber, draft.channelLabel.split(' · ')[0] ?? '');
      const same = draft.lines.findIndex((l) => (sold.skuCatalogId != null && l.skuCatalogId === sold.skuCatalogId) || l.itemNumber === itemNumber);
      const open = draft.lines.length === 1 && !draft.lines[0].itemNumber ? 0 : -1;
      const at = same >= 0 ? same : open;
      if (at >= 0) {
        const keep = draft.lines[at];
        draft.lines[at] = keep.skuCatalogId != null ? { ...keep, itemNumber } : { ...sold, quantity: keep.quantity, unitPriceCents: keep.unitPriceCents, condition: keep.condition };
      } else {
        draft.lines.push(sold);
      }
    }

    // ── order number: the marketplace's own, or generated under the channel's prefix ──
    if (input.orderNumber) {
      draft.orderNumber = kind === 'marketplace' ? normalizeMarketplaceOrderId(input.orderNumber) : input.orderNumber;
      draft.orderNumberGenerated = false;
    } else if (kind === 'marketplace') {
      if (draft.orderNumberGenerated) {
        draft.orderNumber = '';
        draft.orderNumberGenerated = false;
      }
    } else if (!draft.orderNumber || (draft.orderNumberGenerated && !isGeneratedOrderNumber(orderNumberPrefix(draft.channel), draft.orderNumber))) {
      draft.orderNumber = await nextManualOrderNumber(org, orderNumberPrefix(draft.channel), query);
      draft.orderNumberGenerated = true;
    }
    if (input.trackingNumber) {
      draft.trackingNumber = input.trackingNumber;
      draft.buyLabel = false;
    }
    if (input.buyLabel != null) draft.buyLabel = input.buyLabel && !draft.trackingNumber;
    if (input.shipBy != null) {
      const date = resolveShipBy(input.shipBy);
      if (date) draft.shipBy = date;
      else notes.push(`Ship-by "${input.shipBy}" is not a date`);
    }
    if (input.urgent != null) draft.isUrgent = input.urgent;
    if (input.note != null) draft.buyerNote = input.note;
    const parcelSaid = [input.weightOz, input.lengthIn, input.widthIn, input.heightIn].some((v) => v != null);
    if (parcelSaid) {
      const prev = draft.parcel ?? { weightOz: null, lengthIn: null, widthIn: null, heightIn: null };
      draft.parcel = {
        weightOz: input.weightOz ?? prev.weightOz,
        lengthIn: input.lengthIn ?? prev.lengthIn,
        widthIn: input.widthIn ?? prev.widthIn,
        heightIn: input.heightIn ?? prev.heightIn,
      };
    }

    const valid = manualOrderDraftSchema.safeParse(draft);
    if (!valid.success) {
      return { ok: false, error: `That order could not be drafted: ${valid.error.issues[0]?.message ?? 'invalid field'}.` };
    }
    const duplicate = await findDuplicateOrder(query, org, valid.data);

    const missing = [
      ...(channelChoicesShown.length > 1 && !valid.data.channel
        ? [`Which ${valid.data.channelPlatform ? 'account' : 'channel'}: ${channelChoicesShown.map((ch) => ch.label).join(', ')}`]
        : []),
      ...manualOrderMissing(valid.data).filter((m) => !(m === 'Sales channel' && channelChoicesShown.length > 1)),
      ...unresolved.map((u) =>
        u.candidates.length > 1
          ? `${u.candidates.length} products match "${u.query}" — pick one`
          : `No product matches "${u.query}"`,
      ),
      ...notes,
    ];
    // "A product" is noise while a line waits for its pick.
    const shownMissing = unresolved.length > 0 ? missing.filter((m) => m !== 'A product') : missing;
    const totals = manualOrderTotals(valid.data.lines);
    const name = valid.data.customer.name;
    const channelName = kind === 'phone' ? 'Phone' : valid.data.channelLabel || valid.data.channelPlatform || 'New';
    const artifact: ArtifactOrderDraft = {
      kind: 'order_draft',
      title: `${channelName} order${valid.data.orderNumber ? ` ${valid.data.orderNumber}` : ''}${name ? ` · ${name}` : ''}`.slice(0, 120),
      status: 'draft',
      draft: valid.data,
      customerMatch,
      unresolved,
      channelChoices: channelChoicesShown,
      duplicate,
      missing: shownMissing.slice(0, 40),
      created: null,
    };

    const lines = valid.data.lines.map((l) => `${lineSentence(l, valid.data.currency)}${l.itemNumber ? ` item #${l.itemNumber}` : ''}`);
    const who = kind === 'marketplace' ? 'buyer' : 'customer';
    const summary = [
      `Draft ${channelName} order ${valid.data.orderNumber || '(no order number yet)'} for ${name || `an unnamed ${who}`} (${customerMatch === 'existing' ? `existing ${who}` : `new ${who}`}).`,
      duplicate
        ? `DUPLICATE: ${duplicateSentence(duplicate)} — it is linked on the card (/shipping/orders?triage=${duplicate.orderPk}). Tell the user it is already in the system and do NOT create another.`
        : '',
      lines.length ? `Lines: ${lines.join('; ')}.` : 'No products resolved yet.',
      unresolved.length
        ? `Needs a pick: ${unresolved.map((u) => `"${u.query}" → ${u.candidates.map((x) => `${x.sku} ${x.title}`).join(' | ') || 'no match'}`).join('; ')}.`
        : '',
      valid.data.trackingNumber ? `Tracking ${valid.data.trackingNumber}.` : valid.data.buyLabel ? 'Label to be bought after create.' : '',
      valid.data.shipBy ? `Ship by ${valid.data.shipBy}.` : '',
      totals.priced ? `Total ${formatCents(totals.totalCents, valid.data.currency)}.` : '',
      duplicate
        ? ''
        : shownMissing.length
          ? `Still needed: ${shownMissing.join('; ')}. The card is on screen — ask the user one short question for ONLY what is still needed, ending with a question mark.`
          : 'Nothing is missing. The card is on screen — tell the user to press Create (or say "create it"). Do not create it yourself.',
    ]
      .filter(Boolean)
      .join(' ');
    return brandReportEnvelope({ artifact, summary }, DRAFT_MANUAL_ORDER_TOOL_NAME);
  },
};

// ─── create_manual_order ─────────────────────────────────────────────────────

export interface ManualOrderToolDeps {
  query: Query;
  apply: typeof applyAgentMutation;
  review: typeof reviewAgentMutation;
  planCeilingExceeded: (orgId: OrgId) => Promise<boolean>;
  /** Views / audit / enrichment for the committed rows. */
  announce: typeof announceOrderCreated;
}

const realDeps: ManualOrderToolDeps = {
  query: async (orgId, text, params) => ({ rows: (await tenantQuery(orgId, text, [...params])).rows as Rows }),
  apply: applyAgentMutation,
  review: reviewAgentMutation,
  planCeilingExceeded: (orgId) => wouldExceedPlanCeiling(orgId, 'maxMonthlyOrders'),
  announce: announceOrderCreated,
};

const PENDING_SQL = `SELECT id, payload, created_at
  FROM agent_mutations
 WHERE organization_id = $1 AND ai_chat_session_id = $2
   AND mutation_kind = '${KIND}' AND status = 'proposed'
 ORDER BY id DESC`;

/** "eBay · USAV order 12-34567-89012 for Jane Doe" — how the order is named back to the user. */
function orderLabel(draft: ManualOrderDraft, orderNumber = draft.orderNumber): string {
  const channel = orderChannelKind(draft) === 'phone' ? 'phone' : draft.channelLabel || draft.channel;
  return `${channel} order ${orderNumber} for ${draft.customer.name || 'the customer'}`;
}

/**
 * The prompt line for an order awaiting the operator's answer in this
 * thread — without it a "yes" on the next turn has nothing to attach to.
 */
export async function pendingManualOrderNote(
  orgId: OrgId,
  sessionId: string,
  query: Query = realDeps.query,
): Promise<string | null> {
  const pending = (await query(orgId, PENDING_SQL, [orgId, sessionId])).rows[0];
  if (!pending) return null;
  const draft = manualOrderDraftSchema.safeParse((pending.payload as { draft?: unknown } | null)?.draft);
  const label = draft.success ? orderLabel(draft.data) : 'an order';
  return `PENDING CONFIRMATION: you proposed creating ${label} and asked the user to confirm. If this message says yes / confirm / create it, call ${CREATE_MANUAL_ORDER_TOOL_NAME} with {"action":"confirm"} (no other arguments — the order is remembered). If it says no / cancel, call it with {"action":"cancel"}.`;
}

const createInput = z.object({
  action: z
    .enum(['propose', 'confirm', 'cancel'])
    .default('propose')
    .describe('propose (default) files this conversation\'s order draft for confirmation; confirm / cancel answer the pending one on a LATER turn.'),
});

/** The created order as the payment rail and the chat card read it. */
function createdContract(orderNumber: string, rows: Rows, customerCreated: boolean): ManualOrderCreated {
  const lines = rows.map((r) => {
    const qty = Math.max(1, Number.parseInt(String(r.quantity ?? '1'), 10) || 1);
    const lineCents = r.sale_amount == null ? null : Math.round(Number(r.sale_amount) * 100);
    const sku = str(r.sku);
    return {
      sku,
      title:
        resolveSkuIdentityTitle({
          zoho_item_title: str(r.zoho_item_title),
          catalog_product_title: str(r.catalog_product_title),
          sku,
        }) || str(r.product_title) || sku,
      qty,
      unitPriceCents: lineCents == null ? null : Math.round(lineCents / qty),
    };
  });
  const totals = manualOrderTotals(
    lines.map((l) => ({ quantity: l.qty, unitPriceCents: l.unitPriceCents })),
  );
  return {
    orderNumber,
    orderIds: rows.map((r) => Number(r.id)),
    customerId: rows[0]?.customer_id == null ? null : Number(rows[0].customer_id),
    customerCreated,
    lines,
    currency: str(rows[0]?.currency) || 'USD',
    ...totals,
  };
}

export function buildCreateManualOrderTool(
  sessionId: string | null,
  /** When this turn began — a proposal at or after it is unconfirmable this turn. */
  turnStartedAt: Date,
  deps: ManualOrderToolDeps = realDeps,
): AssistantToolDef<typeof createInput, unknown> {
  const fail = (error: string) => ({ ok: false as const, error });

  const propose = async (ctx: AssistantToolCtx) => {
    if (!sessionId) return fail('No conversation to create from.');
    const card = await openDraft(deps.query, ctx.organizationId, sessionId);
    if (!card) {
      return fail(`There is no open order draft in this conversation. Draft one first with ${DRAFT_MANUAL_ORDER_TOOL_NAME}. Nothing was created.`);
    }
    const duplicate = await findDuplicateOrder(deps.query, ctx.organizationId, card.draft);
    if (duplicate) {
      return fail(`${duplicateSentence(duplicate)} (/shipping/orders?triage=${duplicate.orderPk}) — tell the user it is already in the system. Nothing was created.`);
    }
    const missing = [...manualOrderMissing(card.draft), ...card.unresolved.map((u) => `a product for "${u.query}"`)];
    if (missing.length > 0) return fail(`Not ready to create — still needed: ${missing.join('; ')}. Nothing was created.`);
    if (await deps.planCeilingExceeded(ctx.organizationId)) {
      return fail('This workspace is at its monthly order limit. Nothing was created.');
    }
    // One open proposal per thread: an older one is superseded by this draft.
    for (const old of (await deps.query(ctx.organizationId, PENDING_SQL, [ctx.organizationId, sessionId])).rows) {
      await deps.review({
        organizationId: ctx.organizationId,
        mutationId: Number(old.id),
        decision: 'reject',
        actorStaffId: ctx.staffId,
        actorPermissions: ctx.permissions,
        notes: 'Superseded by a newer draft in the same conversation.',
        kinds: [KIND],
      });
    }
    const filed = await deps.apply({
      organizationId: ctx.organizationId,
      mutationKind: KIND,
      payload: { draft: card.draft },
      proposedByStaffId: ctx.staffId,
      aiChatSessionId: sessionId,
    });
    if (!filed.ok) return fail(filed.error);
    const d = card.draft;
    const totals = manualOrderTotals(d.lines);
    return {
      ok: true as const,
      status: 'needs_confirmation',
      mutationId: filed.mutationId,
      summary: `Not created yet — waiting for the user's yes. Reply with exactly this question and nothing else: "Create ${orderLabel(d)} — ${d.lines.length} line${d.lines.length === 1 ? '' : 's'}${totals.priced ? `, ${formatCents(totals.totalCents, d.currency)}` : ''}, held for triage? Reply yes or no."`,
    };
  };

  const decide = async (ctx: AssistantToolCtx, decision: 'approve' | 'reject') => {
    if (!sessionId) return fail('No conversation to confirm in.');
    const pending = (await deps.query(ctx.organizationId, PENDING_SQL, [ctx.organizationId, sessionId])).rows[0];
    if (!pending) return fail('There is no order waiting for confirmation in this conversation. Propose one first.');
    const mutationId = Number(pending.id);
    if (new Date(String(pending.created_at)).getTime() >= turnStartedAt.getTime()) {
      return fail('The user has not confirmed yet — this order was proposed in this same turn. Ask them to confirm and wait for their reply. Nothing was created.');
    }
    const proposed = manualOrderDraftSchema.safeParse((pending.payload as { draft?: unknown } | null)?.draft);
    if (decision === 'approve' && (await deps.planCeilingExceeded(ctx.organizationId))) {
      return fail('This workspace is at its monthly order limit. Nothing was created.');
    }
    const result = await deps.review({
      organizationId: ctx.organizationId,
      mutationId,
      decision,
      actorStaffId: ctx.staffId,
      actorPermissions: ctx.permissions,
      kinds: [KIND],
    });
    if (!result.ok) return fail(`${result.error}. Nothing was created.`);
    if (decision === 'reject') {
      return { ok: true as const, status: 'cancelled', mutationId, summary: 'Cancelled — the order was not created.' };
    }

    const orderNumber = String(result.targetRef ?? '');
    const rows = await readOrderLines(ctx.organizationId, orderNumber, deps.query);
    const draft = proposed.success ? proposed.data : null;
    const order = createdContract(orderNumber, rows, draft != null && draft.customer.id == null);
    try {
      await deps.announce({
        actor: { organizationId: ctx.organizationId, staffId: ctx.staffId, source: 'assistant.manual_order' },
        orderPks: order.orderIds,
        rows,
        skuCatalogIds: draft?.lines.map((l) => l.skuCatalogId) ?? [],
        shipmentId: rows[0]?.shipment_id == null ? null : Number(rows[0].shipment_id),
        status: 'unassigned',
        customerId: order.customerId,
        customerCreated: order.customerCreated,
      });
    } catch (err) {
      console.warn('[create_manual_order] after-commit announce failed (order exists):', err);
    }

    const base = draft ?? emptyManualOrderDraft();
    const createdDraft: ManualOrderDraft = {
      ...base,
      orderNumber,
      orderNumberGenerated: false,
      customer: { ...base.customer, id: order.customerId },
      lines: order.lines.map((l, i) => ({
        skuCatalogId: base.lines[i]?.skuCatalogId ?? null,
        sku: l.sku,
        title: l.title,
        quantity: l.qty,
        condition: base.lines[i]?.condition ?? null,
        unitPriceCents: l.unitPriceCents,
        itemNumber: base.lines[i]?.itemNumber ?? '',
      })),
    };
    const artifact: ArtifactOrderDraft = {
      kind: 'order_draft',
      title: `${orderChannelKind(base) === 'phone' ? 'Phone' : base.channelLabel || base.channel} order ${orderNumber}${base.customer.name ? ` · ${base.customer.name}` : ''}`.slice(0, 120),
      status: 'created',
      draft: createdDraft,
      customerMatch: base.customer.id != null ? 'existing' : 'new',
      unresolved: [],
      channelChoices: [],
      duplicate: null,
      missing: [],
      created: { orderIds: order.orderIds, customerId: order.customerId },
    };
    const summary = `Created ${orderLabel(base, orderNumber)} — ${order.lines.length} line${order.lines.length === 1 ? '' : 's'}${order.priced ? `, total ${formatCents(order.totalCents, order.currency)}` : ''}${base.trackingNumber ? `, tracking ${base.trackingNumber} linked` : ''}. It is held in the cage for triage (label and release happen in the intake form). Next: ${orderChannelKind(base) === 'marketplace' ? 'open it in the intake form' : 'take payment, or open it in the intake form'}.`;
    return Object.assign(brandReportEnvelope({ artifact, summary }, CREATE_MANUAL_ORDER_TOOL_NAME), { order });
  };

  return {
    name: CREATE_MANUAL_ORDER_TOOL_NAME,
    description:
      'Create the order drafted in this conversation (the order card — phone or any sales channel). Two steps: action "propose" (no other arguments — the draft card is used as is) returns needs_confirmation — then ASK the user to confirm and stop. On their next message, "confirm" (yes) or "cancel" (no). Never confirm in the same turn you proposed. Label buying and release stay in the intake form.',
    permission: 'orders.create',
    inputSchema: createInput,
    run: async (input, ctx) => {
      if (ctx.accessMode === 'ask') return fail(askOnlyRefusal(CREATE_MANUAL_ORDER_TOOL_NAME));
      if (input.action === 'propose') return propose(ctx);
      return decide(ctx, input.action === 'confirm' ? 'approve' : 'reject');
    },
  };
}
