/**
 * Inbound order import — THE column registry and THE import engine
 * (client + server safe). Every bulk file (a purchase-order sheet, an Amazon
 * returns report, an FBA customer returns report, an eBay returns export, a
 * ShopGoodwill order list) is read by this one table.
 *
 * One table says, for every canonical field: where it lands (the
 * `InboundOrderDraft` header / line / tracking key and the DB column the
 * writer persists it in — the upload check reads it back through
 * `target.column`), whether the order cannot land without it, the header
 * words that name it, and the value shape that gives it away when the header
 * is unfamiliar.
 *
 * A preset is a known export format: its own header words (tried first), the
 * order type and platform it stamps, the rows it skips, and how a row's line
 * key and listing link are built. `detectPoPreset` picks one from the header
 * row; the operator can override it.
 *
 * `identifyColumns` binds a file's columns to fields in a fixed ladder:
 *   1. preset header aliases (the platform's own export words),
 *   2. registry header aliases,
 *   3. value shape (tracking numbers, money, dates, URLs, ids, titles, small
 *      integers) — so a file with headers nobody has seen still yields order #,
 *      title, price and tracking. A verified preset (a published report
 *      format) skips this step: its every column is named by its spec, and a
 *      guess would bind report columns that are not ours (label cost, refunds).
 * The LLM mapping (`proposeColumnMapping`, server) is an explicit fallback
 * the operator asks for only when required fields stay unmapped.
 *
 * `poRowToDeskRow` turns one mapped row into the desk import row the one
 * inbound writer groups (`draftsFromDeskRows` → `ingestInboundOrder`),
 * returning every problem with the exact field — a row is never silently
 * dropped and a blank quantity is never guessed.
 */

import { detectCarrier, extractCanonicalTracking } from '@/lib/tracking-format';
import { conditionGradeFromListing } from '@/lib/conditions';
import type { DeskImportRow } from '@/lib/inbound/desk-csv';
import { inboundSourcePlatformForRaw, inboundSourceTypeForPlatform } from '@/lib/inbound/desk-csv';

// ─── fields ──────────────────────────────────────────────────────────────────

export const PO_FIELDS = [
  'order_number',
  'order_type',
  'platform',
  'vendor',
  'order_date',
  'expected_date',
  'item_title',
  'sku',
  'item_id',
  'listing_url',
  'quantity',
  'unit_cost',
  'line_total',
  'shipping',
  'tracking',
  'carrier',
  'condition',
  'listing_serials',
  'return_reason',
  'rma',
  'return_request_date',
  'fnsku',
  'license_plate',
  'disposition',
  'customer_comment',
  'notes',
  'priority',
] as const;
export type PoField = (typeof PO_FIELDS)[number];

/** Value shapes the detector recognises. `null` = header-only field. */
export type PoValueShape = 'tracking' | 'url' | 'carrier' | 'condition' | 'date' | 'money' | 'id' | 'title' | 'integer';

export interface PoColumnTarget {
  /** Which part of the draft the value lands on. */
  level: 'order' | 'line' | 'tracking';
  /** `InboundOrderDraft` (or line / tracking entry) key. */
  draftKey: string;
  /** The DB column the writer persists it in — the upload check reads it back from here. */
  column: string;
}

export interface PoColumnSpec {
  field: PoField;
  label: string;
  target: PoColumnTarget;
  /**
   * `always` — the order cannot land without it; `identity` — every line needs
   * a title OR a SKU (`inboundOrderMissing` line_identity); `unless_preset` —
   * required unless the platform preset supplies it (quantity, platform).
   */
  required: 'always' | 'identity' | 'unless_preset' | false;
  aliases: readonly string[];
  shape: PoValueShape | null;
}

export const PO_COLUMNS: Record<PoField, PoColumnSpec> = {
  order_number: {
    field: 'order_number',
    label: 'Order #',
    target: { level: 'order', draftKey: 'orderNumber', column: 'inbound_order.order_number' },
    required: 'always',
    aliases: ['order number', 'order #', 'order no', 'order id', 'order', 'po', 'po number', 'po #', 'purchase order', 'purchase order number', 'source order id', 'order ref'],
    shape: 'id',
  },
  order_type: {
    field: 'order_type',
    label: 'Order type',
    target: { level: 'order', draftKey: 'type', column: 'inbound_order.receiving_type' },
    required: false,
    aliases: ['order type', 'type', 'kind', 'intake', 'intake type', 'receiving type'],
    shape: null,
  },
  platform: {
    field: 'platform',
    label: 'Platform',
    target: { level: 'order', draftKey: 'platform', column: 'inbound_order.source_platform' },
    required: 'unless_preset',
    aliases: ['platform', 'source', 'source type', 'channel', 'marketplace', 'site'],
    shape: null,
  },
  vendor: {
    field: 'vendor',
    label: 'Vendor / seller',
    target: { level: 'order', draftKey: 'vendor', column: 'inbound_order.vendor_name' },
    required: false,
    aliases: ['vendor', 'vendor name', 'seller', 'seller name', 'supplier', 'supplier name', 'sold by', 'vendor or seller name', 'store'],
    shape: null,
  },
  order_date: {
    field: 'order_date',
    label: 'Order date',
    target: { level: 'order', draftKey: 'orderDate', column: 'inbound_order.order_date' },
    required: false,
    aliases: ['order date', 'purchase date', 'date ordered', 'ordered', 'ordered on', 'po date', 'date', 'placed', 'placed on', 'purchased'],
    shape: 'date',
  },
  expected_date: {
    field: 'expected_date',
    label: 'Expected date',
    target: { level: 'order', draftKey: 'expectedDate', column: 'inbound_order.expected_date' },
    required: false,
    aliases: ['expected date', 'expected', 'eta', 'expected delivery', 'expected delivery date', 'estimated delivery', 'delivery date', 'arrives', 'due date'],
    shape: 'date',
  },
  item_title: {
    field: 'item_title',
    label: 'Item title',
    target: { level: 'line', draftKey: 'title', column: 'receiving_line.item_name' },
    required: 'identity',
    aliases: ['title', 'item title', 'item name', 'item', 'name', 'product', 'product name', 'product title', 'description', 'item description', 'listing title'],
    shape: 'title',
  },
  sku: {
    field: 'sku',
    label: 'SKU',
    target: { level: 'line', draftKey: 'sku', column: 'receiving_line.sku' },
    required: 'identity',
    aliases: ['sku', 'our sku', 'catalog sku', 'item sku', 'merchant sku', 'product sku', 'custom label', 'custom label sku'],
    shape: null,
  },
  item_id: {
    field: 'item_id',
    label: 'Item / listing #',
    target: { level: 'line', draftKey: 'itemNumber', column: 'inbound_purchase_order_mirror.line_items[].itemNumber' },
    required: false,
    aliases: ['item id', 'item #', 'item number', 'item no', 'listing id', 'listing #', 'listing number', 'lot', 'lot #', 'lot number', 'line id', 'line item id', 'asin'],
    shape: 'id',
  },
  listing_url: {
    field: 'listing_url',
    label: 'Listing URL',
    target: { level: 'line', draftKey: 'listingUrl', column: 'receiving_line.listing_url' },
    required: false,
    aliases: ['listing url', 'listing', 'listing link', 'url', 'link', 'item url', 'item link'],
    shape: 'url',
  },
  quantity: {
    field: 'quantity',
    label: 'Quantity',
    target: { level: 'line', draftKey: 'quantity', column: 'receiving_line.quantity_expected' },
    required: 'unless_preset',
    aliases: ['qty', 'quantity', 'quantity expected', 'qty ordered', 'quantity ordered', 'units', 'count', 'return quantity', 'qty returned', 'quantity returned'],
    shape: 'integer',
  },
  unit_cost: {
    field: 'unit_cost',
    label: 'Unit cost',
    target: { level: 'line', draftKey: 'unitCostCents', column: 'receiving_line.unit_cost_cents' },
    required: false,
    aliases: ['unit cost', 'unit price', 'price', 'cost', 'item price', 'item cost', 'each', 'price each', 'rate'],
    shape: 'money',
  },
  line_total: {
    field: 'line_total',
    label: 'Line total',
    target: { level: 'line', draftKey: 'unitCostCents (÷ quantity, when no unit cost)', column: 'receiving_line.unit_cost_cents × quantity_expected' },
    required: false,
    aliases: ['line total', 'total', 'item total', 'extended price', 'total price', 'amount', 'subtotal'],
    shape: 'money',
  },
  shipping: {
    field: 'shipping',
    label: 'Shipping',
    target: { level: 'order', draftKey: 'notes', column: 'inbound_order.notes' },
    required: false,
    aliases: ['shipping', 'shipping cost', 'ship cost', 'shipping and handling', 's&h', 'postage', 'freight'],
    shape: null,
  },
  tracking: {
    field: 'tracking',
    label: 'Tracking #',
    target: { level: 'tracking', draftKey: 'tracking[].number', column: 'shipping_tracking_numbers.tracking_number_normalized' },
    required: false,
    aliases: ['tracking', 'tracking number', 'tracking #', 'tracking no', 'tracking id', 'tracking code', 'return tracking number', 'return tracking id', 'return tracking'],
    shape: 'tracking',
  },
  carrier: {
    field: 'carrier',
    label: 'Carrier',
    target: { level: 'tracking', draftKey: 'tracking[].carrier', column: 'shipping_tracking_numbers.carrier' },
    required: false,
    aliases: ['carrier', 'shipping carrier', 'carrier code', 'ship via', 'shipped via', 'shipper', 'return carrier'],
    shape: 'carrier',
  },
  condition: {
    field: 'condition',
    label: 'Condition',
    target: { level: 'line', draftKey: 'conditionGrade', column: 'receiving_line.purchase_condition_grade' },
    required: false,
    aliases: ['condition', 'item condition', 'grade', 'listing condition', 'condition bought'],
    shape: 'condition',
  },
  listing_serials: {
    field: 'listing_serials',
    label: 'Listing serials',
    target: { level: 'line', draftKey: 'listingSerials', column: 'receiving_line_listing_serial.serial' },
    required: false,
    aliases: ['serial', 'serials', 'serial number', 'serial numbers', 'serial #', 'listing serial', 'listing serials'],
    shape: null,
  },
  return_reason: {
    field: 'return_reason',
    label: 'Return reason',
    target: { level: 'line', draftKey: 'returnReason (order: first row)', column: 'receiving_line_return.return_reason' },
    required: false,
    aliases: ['return reason', 'reason', 'reason for return', 'return reason code'],
    shape: null,
  },
  rma: {
    field: 'rma',
    label: 'RMA',
    target: { level: 'line', draftKey: 'rmaId (order: first row)', column: 'receiving_line_return.rma_ref' },
    required: false,
    aliases: ['rma', 'rma id', 'rma #', 'rma no', 'rma ref', 'return id', 'return #', 'return number', 'return authorization'],
    shape: null,
  },
  return_request_date: {
    field: 'return_request_date',
    label: 'Return request date',
    target: { level: 'line', draftKey: 'returnRequestDate (order: first row)', column: 'receiving_line_return.return_requested_on' },
    required: false,
    aliases: ['return request date', 'return date', 'return requested', 'return opened', 'return opened date', 'request date', 'return created', 'return created date'],
    shape: null,
  },
  fnsku: {
    field: 'fnsku',
    label: 'FNSKU',
    target: { level: 'line', draftKey: 'fnsku', column: 'receiving_line_return.fnsku' },
    required: false,
    aliases: ['fnsku'],
    shape: null,
  },
  license_plate: {
    field: 'license_plate',
    label: 'License plate #',
    target: { level: 'line', draftKey: 'licensePlateNumber', column: 'receiving_line_return.license_plate_number' },
    required: false,
    aliases: ['license plate number', 'license plate', 'lpn'],
    shape: null,
  },
  disposition: {
    field: 'disposition',
    label: 'Disposition',
    target: { level: 'line', draftKey: 'disposition', column: 'receiving_line_return.disposition' },
    required: false,
    aliases: ['disposition', 'detailed disposition'],
    shape: null,
  },
  customer_comment: {
    field: 'customer_comment',
    label: 'Customer comments',
    target: { level: 'line', draftKey: 'customerComment', column: 'receiving_line_return.customer_comment' },
    required: false,
    aliases: ['customer comments', 'customer comment', 'buyer comments', 'buyer comment', 'buyer note', 'buyer notes'],
    shape: null,
  },
  notes: {
    field: 'notes',
    label: 'Notes',
    target: { level: 'order', draftKey: 'notes', column: 'inbound_order.notes' },
    required: false,
    aliases: ['notes', 'note', 'comments', 'comment', 'memo', 'remarks'],
    shape: null,
  },
  priority: {
    field: 'priority',
    label: 'Priority tier',
    target: { level: 'order', draftKey: 'priority', column: 'inbound_order.priority_tier' },
    required: false,
    aliases: ['priority', 'priority tier', 'urgency', 'tier'],
    shape: null,
  },
};

// ─── presets ─────────────────────────────────────────────────────────────────

export const PO_PRESET_IDS = ['amazon_returns', 'amazon_fba_returns', 'ebay_returns', 'goodwill', 'generic'] as const;
export type PoPresetId = (typeof PO_PRESET_IDS)[number];

/** The mapped values a preset builds a line key / listing link from. */
export interface PoPresetRowFacts {
  itemId: string;
  rma: string;
  licensePlate: string;
}

export interface PoPlatformPreset {
  id: PoPresetId;
  label: string;
  /** Order type every row lands as unless an order-type column says otherwise. */
  orderType: 'PO' | 'RETURN';
  /** Platform stamp when the file has no platform column ('' = operator picks). */
  platform: string;
  /**
   * True when the header words come from the platform's published report
   * spec (`spec`); false = guessed — the operator checks the column matches.
   */
  verified: boolean;
  /** Where the export format is documented. */
  spec: string | null;
  /** Urgency tier (0 = most urgent … 3) when a row names none; null = Auto. */
  defaultTier: 0 | 1 | 2 | 3 | null;
  /** Vendor when the file has no vendor column / the cell is blank. */
  vendor: string;
  /** Quantity per row when the file has NO quantity column; null = required. */
  quantityWhenAbsent: number | null;
  /** The platform's own export words, tried before the registry aliases. */
  headerAliases: Partial<Record<PoField, readonly string[]>>;
  /** Normalized headers that together identify the format (`detectPoPreset`); any one set matching wins. */
  signatures: ReadonlyArray<readonly string[]>;
  /** Row gate read from a column the import does not save: the header words and the cell values that skip a row. */
  skip?: { headers: readonly string[]; values: RegExp; reason: string };
  /** The line key a row lands with; '' = the item #. */
  lineKey?: (facts: PoPresetRowFacts) => string;
  /** The listing link built from the item # when the file has none. */
  listingUrlFromItemId?: (itemId: string) => string;
  /** Look the line's catalog item up by SKU, then by item # (Amazon: the ASIN is the catalog SKU). */
  catalogByItemId: boolean;
  /**
   * Bind unnamed columns by value shape. Off for a published report format:
   * its every column is named by its spec, and a guess would bind report
   * columns that are not ours (label cost, refunds).
   */
  guessByShape: boolean;
}

export function amazonListingUrlForAsin(asin: string): string {
  return `https://www.amazon.com/dp/${asin.trim().toUpperCase()}`;
}

function ebayListingUrlForItem(itemId: string): string {
  return `https://www.ebay.com/itm/${itemId.trim()}`;
}

const SPEC_AMAZON_RETURNS = 'https://developer-docs.amazon/sp-api/docs/report-type-values-returns';
const SPEC_AMAZON_FBA = 'https://developer-docs.amazon/sp-api/docs/report-type-values-fba';

export const PO_PRESETS: Record<PoPresetId, PoPlatformPreset> = {
  // GET_FLAT_FILE_RETURNS_DATA_BY_RETURN_DATE (seller-fulfilled Manage Returns), TAB-delimited, and the
  // Prime CSV variant with hyphenated headers (Order-ID, Return-request-date, …) — both normalize the same.
  // Order Amount / Order quantity / Label cost / Refunded Amount are the BUYER's order money, not what the
  // unit cost us: never mapped (the pre-2026-10-06 returns import never mapped them either).
  amazon_returns: {
    id: 'amazon_returns',
    label: 'Amazon returns (Manage Returns report)',
    orderType: 'RETURN',
    platform: 'amazon',
    verified: true,
    spec: SPEC_AMAZON_RETURNS,
    defaultTier: null,
    vendor: '',
    quantityWhenAbsent: 1,
    headerAliases: {
      order_number: ['order id'],
      order_date: ['order date'],
      return_request_date: ['return request date'],
      rma: ['amazon rma id'],
      carrier: ['return carrier'],
      tracking: ['tracking id'],
      item_id: ['asin'],
      sku: ['merchant sku'],
      item_title: ['item name'],
      quantity: ['return quantity'],
      return_reason: ['return reason'],
    },
    signatures: [
      ['orderid', 'asin', 'amazonrmaid'],
      ['orderid', 'asin', 'returnrequestdate'],
    ],
    skip: { headers: ['return request status'], values: /^cancell?ed$/i, reason: 'Return request cancelled — skipped' },
    lineKey: ({ itemId, rma }) => (itemId && rma ? `${rma}:${itemId}` : itemId || rma),
    listingUrlFromItemId: amazonListingUrlForAsin,
    catalogByItemId: true,
    guessByShape: false,
  },
  // GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA. No tracking: FBA returns go back to an Amazon warehouse,
  // so a CSV return lands without one (returnClaim false).
  amazon_fba_returns: {
    id: 'amazon_fba_returns',
    label: 'Amazon FBA customer returns',
    orderType: 'RETURN',
    platform: 'amazon',
    verified: true,
    spec: SPEC_AMAZON_FBA,
    defaultTier: null,
    vendor: '',
    quantityWhenAbsent: 1,
    headerAliases: {
      order_number: ['order id'],
      return_request_date: ['return date'],
      sku: ['sku'],
      item_id: ['asin'],
      fnsku: ['fnsku'],
      item_title: ['product name'],
      quantity: ['quantity'],
      disposition: ['detailed disposition'],
      return_reason: ['reason'],
      license_plate: ['license plate number'],
      customer_comment: ['customer comments'],
    },
    signatures: [
      ['orderid', 'fnsku', 'licenseplateno'],
      ['orderid', 'fnsku', 'detaileddisposition'],
    ],
    lineKey: ({ itemId, licensePlate }) => licensePlate || itemId,
    listingUrlFromItemId: amazonListingUrlForAsin,
    catalogByItemId: true,
    guessByShape: false,
  },
  // eBay publishes no returns-report column spec: these are the Seller Hub returns words as we know
  // them, UNVERIFIED — the operator checks the column matches before importing.
  ebay_returns: {
    id: 'ebay_returns',
    label: 'eBay returns',
    orderType: 'RETURN',
    platform: 'ebay',
    verified: false,
    spec: null,
    defaultTier: null,
    vendor: '',
    quantityWhenAbsent: 1,
    headerAliases: {
      rma: ['return id', 'return number'],
      order_number: ['order number', 'order id', 'sales record number'],
      item_id: ['item id', 'item number'],
      item_title: ['item title'],
      sku: ['custom label', 'custom label sku'],
      quantity: ['quantity', 'return quantity'],
      return_reason: ['return reason', 'reason for return'],
      customer_comment: ['buyer comments', 'buyer comment', 'comments from buyer'],
      tracking: ['return tracking number', 'tracking number'],
      return_request_date: ['return opened', 'return opened date', 'request date', 'return request date', 'return created'],
    },
    signatures: [
      ['returnid', 'itemid'],
      ['returnid', 'itemno'],
    ],
    lineKey: ({ itemId, rma }) => (itemId && rma ? `${rma}:${itemId}` : itemId || rma),
    listingUrlFromItemId: ebayListingUrlForItem,
    catalogByItemId: false,
    guessByShape: true,
  },
  goodwill: {
    id: 'goodwill',
    label: 'Goodwill',
    orderType: 'PO',
    platform: 'goodwill',
    // UNVERIFIED: guessed from the ShopGoodwill order-history / won-items pages,
    // not from a real export — re-check against an actual ShopGoodwill CSV. The
    // value-shape pass must (and does — see po-columns.test.ts) identify order #,
    // title, price and tracking without any of these.
    verified: false,
    spec: null,
    // Goodwill buys are cheap parts lots — the bottom shelf unless a row says otherwise.
    defaultTier: 3,
    vendor: 'Goodwill',
    // One won item per row is how ShopGoodwill lists an order.
    quantityWhenAbsent: 1,
    headerAliases: {
      order_number: ['shopgoodwill order', 'sgw order', 'goodwill order', 'order id #'],
      item_id: ['item id', 'item #', 'sgw item', 'auction id', 'listing id'],
      item_title: ['item title', 'auction title'],
      unit_cost: ['winning bid', 'final bid', 'bid amount', 'high bid', 'final price', 'sold price'],
      shipping: ['shipping & handling', 'shipping/handling', 'handling', 'shipping fee'],
      vendor: ['seller', 'seller store', 'store name', 'goodwill store'],
      order_date: ['won date', 'end date', 'auction end', 'ended', 'paid date', 'payment date'],
      tracking: ['tracking #', 'tracking number'],
    },
    // Goodwill is detected by its words in the headers or cells, not a header set.
    signatures: [],
    catalogByItemId: false,
    guessByShape: true,
  },
  generic: {
    id: 'generic',
    label: 'Other platform',
    orderType: 'PO',
    platform: '',
    verified: true,
    spec: null,
    defaultTier: null,
    vendor: '',
    quantityWhenAbsent: null,
    headerAliases: {},
    signatures: [],
    catalogByItemId: false,
    guessByShape: true,
  },
};

/**
 * The preset a file looks like: a known report's header set, else Goodwill
 * words anywhere in headers or cells, else the generic template.
 */
export function detectPoPreset(headers: readonly string[], rows: ReadonlyArray<Record<string, string>>): PoPresetId {
  const have = new Set(headers.map(normalizePoHeader));
  for (const id of PO_PRESET_IDS) {
    if (PO_PRESETS[id].signatures.some((sig) => sig.every((h) => have.has(h)))) return id;
  }
  const hay = [...headers, ...rows.slice(0, 50).flatMap((r) => Object.values(r))];
  return hay.some((v) => /goodwill/i.test(v)) ? 'goodwill' : 'generic';
}

/** The platform the import stamps: the preset's own, else the operator's pick. */
export function poPresetPlatform(preset: PoPlatformPreset, pick: string | null | undefined): string {
  return preset.platform || String(pick ?? '').trim().toLowerCase();
}

// ─── header normalization ────────────────────────────────────────────────────

/** "Order #", "Order No.", "order_number" → "orderno". */
export function normalizePoHeader(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[_\-./]+/g, ' ')
    .replace(/#/g, ' no ')
    .replace(/\bnumber\b|\bnum\b|\bnbr\b/g, ' no ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]/g, '');
}

// ─── value shapes ────────────────────────────────────────────────────────────

const CARRIER_WORDS: Record<string, true> = {
  ups: true, usps: true, fedex: true, dhl: true, ontrac: true, lasership: true, amazon: true, amzl: true,
  gls: true, uniuni: true, veho: true, gso: true, 'spee-dee': true, speedee: true, osm: true,
  'pitney bowes': true, 'usps ground advantage': true, 'usps priority mail': true, 'fedex ground': true, 'ups ground': true,
};
const CONDITION_RE = /^(brand new|new|new other|like new|open box|very good|good|acceptable|fair|poor|used|pre-?owned|refurbished|for parts|parts|parts only|untested|as[- ]?is|salvage)\b/i;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function civil(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || m < 1 || m > 12 || d < 1) return null;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > days) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** ISO (2026-09-14[T…]), US (9/14/2026, 9/14/26 [time]) or "Sep 14, 2026" → YYYY-MM-DD. */
export function parsePoDate(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(s);
  if (m) return civil(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:[\s,].*)?$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return civil(y, Number(m[1]), Number(m[2]));
  }
  m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})(?:[\s,].*)?$/.exec(s);
  if (m) {
    const month = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    if (month >= 0) return civil(Number(m[3]), month + 1, Number(m[2]));
  }
  return null;
}

/** "$1,234.50", "12.5", "USD 3" → cents. Negative / unparseable → null. */
export function parsePoMoneyCents(raw: string): number | null {
  const s = raw.trim().replace(/^(usd|us\$)\s*/i, '').replace(/\s*usd$/i, '').replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s) && !/^\.\d{1,2}$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

/** A money cell with a currency mark or cents — bare integers are quantities or ids. */
function looksLikeMoney(raw: string): boolean {
  const s = raw.trim();
  if (parsePoMoneyCents(s) == null) return false;
  return /[$]|usd/i.test(s) || /\.\d{2}$/.test(s);
}

function looksLikeTracking(raw: string): boolean {
  const canon = extractCanonicalTracking(raw.trim());
  // DHL Express (10–11 bare digits) collides with order / item ids, so value
  // shape needs ≥12 characters; a DHL column still binds by its header.
  return canon.length >= 12 && detectCarrier(canon) !== 'Unknown';
}

function looksLikeId(raw: string): boolean {
  const s = raw.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{4,29}$/.test(s)) return false;
  if ((s.match(/\d/g) ?? []).length < 4) return false;
  return parsePoDate(s) == null;
}

const SHAPE_TESTS: Record<PoValueShape, (v: string) => boolean> = {
  tracking: looksLikeTracking,
  url: (v) => /^https?:\/\/\S+$/i.test(v.trim()),
  carrier: (v) => CARRIER_WORDS[v.trim().toLowerCase()] === true,
  condition: (v) => CONDITION_RE.test(v.trim()) && v.trim().length <= 40,
  date: (v) => parsePoDate(v) != null,
  money: looksLikeMoney,
  id: looksLikeId,
  title: (v) => /[A-Za-z]{2,}/.test(v) && /\s/.test(v.trim()) && !/^https?:\/\//i.test(v.trim()),
  integer: (v) => /^\d{1,4}$/.test(v.trim()) && Number(v) <= 1000,
};

/** Share of a column's non-blank sample cells that fit the shape. */
const SHAPE_THRESHOLD = 0.8;

// ─── identification ──────────────────────────────────────────────────────────

/** `operator` = picked by hand in the mapping list. */
export type PoColumnReason = 'preset' | 'header' | 'values' | 'ai' | 'operator';

export interface PoIdentifiedColumn {
  header: string;
  field: PoField | null;
  /** 0..1 — header words 1, preset words .95, value shape ≤ .8, AI as proposed. */
  confidence: number;
  reason: PoColumnReason | null;
  /** Operator-readable why (or why not). */
  note: string;
  /** First non-blank cell, for the mapping list. */
  sample: string;
}

export interface PoDefaultApplied {
  field: PoField;
  value: string;
  reason: 'preset';
}

export interface PoColumnIdentification {
  columns: PoIdentifiedColumn[];
  /** field → header (the staging-store orientation). */
  mapping: Partial<Record<PoField, string>>;
  unmapped: string[];
  defaults: PoDefaultApplied[];
  /** Required fields with no column and no preset default. */
  missingRequired: PoField[];
}

const SAMPLE_ROWS = 50;

function columnSamples(header: string, rows: ReadonlyArray<Record<string, string>>): string[] {
  const out: string[] = [];
  for (const row of rows.slice(0, SAMPLE_ROWS)) {
    const v = (row[header] ?? '').trim();
    if (v) out.push(v);
  }
  return out;
}

function shapeShare(values: readonly string[], shape: PoValueShape): number {
  if (values.length === 0) return 0;
  return values.filter(SHAPE_TESTS[shape]).length / values.length;
}

/**
 * Which required fields still have no source. `platform` is satisfied by the
 * operator's platform pick, `quantity` by the preset's one-per-row default.
 */
export function poMissingRequired(
  mapping: Partial<Record<PoField, string>>,
  preset: PoPlatformPreset,
  platform: string,
): PoField[] {
  const missing: PoField[] = [];
  if (!mapping.order_number) missing.push('order_number');
  if (!mapping.item_title && !mapping.sku) missing.push('item_title');
  if (!mapping.quantity && preset.quantityWhenAbsent == null) missing.push('quantity');
  if (!mapping.platform && !platform.trim()) missing.push('platform');
  return missing;
}

export function identifyColumns(
  headers: readonly string[],
  sampleRows: ReadonlyArray<Record<string, string>>,
  opts: { preset?: PoPlatformPreset; platform?: string } = {},
): PoColumnIdentification {
  const preset = opts.preset ?? PO_PRESETS.generic;
  const platform = opts.platform ?? preset.platform;
  const samples = new Map(headers.map((h) => [h, columnSamples(h, sampleRows)]));
  const columns: PoIdentifiedColumn[] = headers.map((header) => ({
    header,
    field: null,
    confidence: 0,
    reason: null,
    note: '',
    sample: samples.get(header)?.[0] ?? '',
  }));
  const taken = new Set<PoField>();
  const bind = (col: PoIdentifiedColumn, field: PoField, reason: PoColumnReason, confidence: number, note: string) => {
    col.field = field;
    col.reason = reason;
    col.confidence = confidence;
    col.note = note;
    taken.add(field);
  };

  // 1–2. Header words: the preset's own first, then the registry's.
  const presetIndex = new Map<string, PoField>();
  for (const field of PO_FIELDS) {
    for (const alias of preset.headerAliases[field] ?? []) presetIndex.set(normalizePoHeader(alias), field);
  }
  const registryIndex = new Map<string, PoField>();
  for (const field of PO_FIELDS) {
    for (const alias of PO_COLUMNS[field].aliases) {
      const key = normalizePoHeader(alias);
      if (!registryIndex.has(key)) registryIndex.set(key, field);
    }
  }
  for (const col of columns) {
    const key = normalizePoHeader(col.header);
    if (!key) continue;
    const viaPreset = presetIndex.get(key);
    if (viaPreset && !taken.has(viaPreset)) {
      bind(col, viaPreset, 'preset', 0.95, `${preset.label} export header`);
      continue;
    }
    const viaHeader = registryIndex.get(key);
    if (viaHeader && !taken.has(viaHeader)) {
      bind(col, viaHeader, 'header', 1, `Header names ${PO_COLUMNS[viaHeader].label.toLowerCase()}`);
    } else if (viaHeader || viaPreset) {
      col.note = `Another column already holds ${PO_COLUMNS[(viaHeader ?? viaPreset)!].label.toLowerCase()}`;
    }
  }

  // 3. Value shape, most distinctive shapes first — only for a preset that guesses (no published spec).
  const free = () =>
    preset.guessByShape ? columns.filter((c) => c.field == null && (samples.get(c.header)?.length ?? 0) > 0) : [];
  const best = (shape: PoValueShape) =>
    free()
      .map((c) => ({ c, share: shapeShare(samples.get(c.header)!, shape) }))
      .filter((x) => x.share >= SHAPE_THRESHOLD);
  const bindByShape = (field: PoField, shape: PoValueShape, note: string) => {
    if (taken.has(field)) return;
    const hit = best(shape).sort((a, b) => b.share - a.share)[0];
    if (hit) bind(hit.c, field, 'values', Math.round(hit.share * 80) / 100, note);
  };

  bindByShape('tracking', 'tracking', 'Values are carrier tracking numbers');
  bindByShape('listing_url', 'url', 'Values are web links');
  bindByShape('carrier', 'carrier', 'Values are carrier names');
  bindByShape('condition', 'condition', 'Values are item conditions');

  // Dates: the first unclaimed date column is the order date; others stay unbound.
  if (!taken.has('order_date')) {
    const hit = best('date')[0];
    if (hit) bind(hit.c, 'order_date', 'values', Math.round(hit.share * 70) / 100, 'Values are dates (first date column)');
  }

  // Small whole numbers → quantity (ids are ≥5 chars, so they never fit).
  bindByShape('quantity', 'integer', 'Values are small whole numbers');

  // Money: when a second money column equals first × quantity it is the line
  // total; otherwise only the first is the unit cost — shipping, tax and
  // totals are never guessed from shape alone.
  const money = best('money').map((x) => x.c);
  if (!taken.has('unit_cost') && money.length > 0) {
    const qtyHeader = columns.find((c) => c.field === 'quantity')?.header;
    let unit = money[0];
    let total: PoIdentifiedColumn | null = null;
    if (qtyHeader && money.length > 1 && !taken.has('line_total')) {
      for (const a of money) {
        for (const b of money) {
          if (a === b || total) continue;
          const rows = sampleRows.slice(0, SAMPLE_ROWS).filter((r) => (r[a.header] ?? '').trim() && (r[b.header] ?? '').trim());
          const fits = rows.length > 0 && rows.every((r) => {
            const q = Number((r[qtyHeader] ?? '').trim());
            const ua = parsePoMoneyCents(r[a.header] ?? '');
            const tb = parsePoMoneyCents(r[b.header] ?? '');
            return Number.isInteger(q) && q > 0 && ua != null && tb != null && Math.abs(ua * q - tb) <= 1;
          });
          if (fits && rows.some((r) => Number(r[qtyHeader]) > 1)) {
            unit = a;
            total = b;
          }
        }
      }
    }
    bind(unit, 'unit_cost', 'values', 0.6, money.length > 1 && !total ? 'First money column (others left for you)' : 'Values are prices');
    if (total) bind(total, 'line_total', 'values', 0.7, 'Values equal unit cost × quantity');
  }

  // Ids: the order # repeats across an order's lines (or is the leftmost id);
  // an all-distinct id beside it is the item / listing #.
  const ids = best('id').map((x) => x.c);
  if (ids.length > 0) {
    const distinctRatio = (c: PoIdentifiedColumn) => {
      const v = samples.get(c.header)!;
      return new Set(v).size / v.length;
    };
    if (!taken.has('order_number')) {
      const order = [...ids].sort((a, b) => distinctRatio(a) - distinctRatio(b) || columns.indexOf(a) - columns.indexOf(b))[0];
      bind(order, 'order_number', 'values', 0.7, distinctRatio(order) < 1 ? 'Id values repeat across rows (one order, many lines)' : 'Leftmost id column');
    }
    if (!taken.has('item_id')) {
      const item = ids.find((c) => c.field == null && distinctRatio(c) === 1);
      if (item) bind(item, 'item_id', 'values', 0.6, 'Distinct id per row');
    }
  }

  // Title: the longest free text column.
  if (!taken.has('item_title')) {
    const avg = (c: PoIdentifiedColumn) => {
      const v = samples.get(c.header)!;
      return v.reduce((n, s) => n + s.length, 0) / v.length;
    };
    const hit = best('title').filter((x) => avg(x.c) >= 10).sort((a, b) => avg(b.c) - avg(a.c))[0];
    if (hit) bind(hit.c, 'item_title', 'values', Math.round(hit.share * 70) / 100, 'Longest text column');
  }

  for (const col of columns) {
    if (col.field == null && !col.note) {
      col.note = (samples.get(col.header)?.length ?? 0) === 0 ? 'Column is empty' : 'Not saved — no field reads it';
    }
  }

  return finishIdentification(columns, preset, platform);
}

function finishIdentification(
  columns: PoIdentifiedColumn[],
  preset: PoPlatformPreset,
  platform: string,
): PoColumnIdentification {
  const mapping: Partial<Record<PoField, string>> = {};
  for (const col of columns) if (col.field) mapping[col.field] = col.header;

  const defaults: PoDefaultApplied[] = [];
  if (!mapping.platform && platform) defaults.push({ field: 'platform', value: platform, reason: 'preset' });
  if (!mapping.quantity && preset.quantityWhenAbsent != null) {
    defaults.push({ field: 'quantity', value: String(preset.quantityWhenAbsent), reason: 'preset' });
  }
  if (preset.vendor) defaults.push({ field: 'vendor', value: preset.vendor, reason: 'preset' });
  if (preset.defaultTier != null) defaults.push({ field: 'priority', value: String(preset.defaultTier), reason: 'preset' });

  return {
    columns,
    mapping,
    unmapped: columns.filter((c) => c.field == null).map((c) => c.header),
    defaults,
    missingRequired: poMissingRequired(mapping, preset, platform),
  };
}

/**
 * Re-bind under a mapping someone chose (the operator's picks, an AI
 * proposal). Columns whose binding did not change keep their original reason;
 * a header the file does not have, or a second field on one column, is ignored.
 */
export function withPoMapping(
  base: PoColumnIdentification,
  mapping: Partial<Record<PoField, string>>,
  opts: {
    preset: PoPlatformPreset;
    platform: string;
    reason?: PoColumnReason;
    /** Per-field why + confidence (AI proposals). */
    detail?: Partial<Record<PoField, { note: string; confidence: number }>>;
  },
): PoColumnIdentification {
  const fieldByHeader = new Map<string, PoField>();
  for (const field of PO_FIELDS) {
    const header = mapping[field];
    if (header && !fieldByHeader.has(header) && base.columns.some((c) => c.header === header)) fieldByHeader.set(header, field);
  }
  const columns = base.columns.map((col): PoIdentifiedColumn => {
    const field = fieldByHeader.get(col.header) ?? null;
    if (field === col.field) return col;
    if (field == null) return { ...col, field: null, reason: null, confidence: 0, note: 'Left out' };
    const detail = opts.detail?.[field];
    return {
      ...col,
      field,
      reason: opts.reason ?? 'operator',
      confidence: detail?.confidence ?? 1,
      note: detail?.note ?? 'Chosen by you',
    };
  });
  return finishIdentification(columns, opts.preset, opts.platform);
}

// ─── row → desk row ──────────────────────────────────────────────────────────

/** A blocking problem on one CSV row, naming the exact field. */
export interface PoRowProblem {
  /** 0-based index into the file's data rows. */
  row: number;
  field: PoField;
  message: string;
}

export interface PoRowContext {
  mapping: Partial<Record<PoField, string>>;
  preset: PoPlatformPreset;
  /** The operator's platform pick (a platform column cell wins). */
  platform: string;
}

const BLANK_TRACKING_RE = /^(n\/?a|none|null|unknown|not\s*available|pending|not shipped|-+)$/i;

/** The cell under the first of `words` the row has as a header (normalized match), trimmed. */
function cellByHeaderWords(row: Record<string, string>, words: readonly string[]): string {
  const wanted = new Set(words.map(normalizePoHeader));
  for (const [header, value] of Object.entries(row)) {
    if (wanted.has(normalizePoHeader(header))) return (value ?? '').trim();
  }
  return '';
}

/** "return", "returns" → RETURN; "po", "purchase", "purchase order" → PO; else null. */
function orderTypeFromCell(raw: string): 'PO' | 'RETURN' | null {
  const v = raw.trim().toLowerCase();
  if (/^returns?$/.test(v)) return 'RETURN';
  if (/^(po|purchases?|purchase order)$/.test(v)) return 'PO';
  return null;
}

/**
 * One mapped row → the desk import row the inbound writer groups, plus
 * every problem on it. A row with a problem still comes back (when it has an
 * order number) so its order is held as a whole — landing the other lines
 * alone would shift positional line keys under a later fix. A row the preset
 * skips (a cancelled return request) comes back with `skipReason` and no
 * problems.
 */
export function poRowToDeskRow(
  row: Record<string, string>,
  index: number,
  ctx: PoRowContext,
): { deskRow: DeskImportRow | null; problems: PoRowProblem[] } {
  const { mapping, preset } = ctx;
  const get = (field: PoField): string => {
    const header = mapping[field];
    return header ? (row[header] ?? '').trim() : '';
  };
  const problems: PoRowProblem[] = [];
  const flag = (field: PoField, message: string) => problems.push({ row: index, field, message });

  const orderNumber = get('order_number');
  const skipReason = preset.skip && preset.skip.values.test(cellByHeaderWords(row, preset.skip.headers)) ? preset.skip.reason : null;
  if (!orderNumber) flag('order_number', mapping.order_number ? `${PO_COLUMNS.order_number.label} is blank` : 'No order # column');

  const platformRaw = get('platform') || poPresetPlatform(preset, ctx.platform);
  if (!platformRaw) flag('platform', 'No platform — pick one or map a platform column');
  else if (inboundSourceTypeForPlatform(platformRaw) === 'zoho') flag('platform', 'Zoho orders arrive by sync, not by CSV');

  let orderType = preset.orderType;
  const typeRaw = get('order_type');
  if (typeRaw) {
    const parsed = orderTypeFromCell(typeRaw);
    if (parsed) orderType = parsed;
    else flag('order_type', `Order type "${typeRaw}" is not a purchase order or a return`);
  }

  const title = get('item_title');
  const sku = get('sku');
  if (!title && !sku) flag('item_title', 'Item title and SKU are both blank');

  let quantity: number | null;
  if (mapping.quantity) {
    const raw = get('quantity');
    if (!raw) {
      quantity = null;
      flag('quantity', 'Quantity is blank');
    } else if (/^\d+$/.test(raw) && Number(raw) >= 1 && Number(raw) <= 10_000) {
      quantity = Number(raw);
    } else {
      quantity = null;
      flag('quantity', `Quantity "${raw}" is not a whole number from 1 to 10000`);
    }
  } else if (preset.quantityWhenAbsent != null) {
    quantity = preset.quantityWhenAbsent;
  } else {
    quantity = null;
    flag('quantity', 'No quantity column');
  }

  let unitCostCents: number | null = null;
  const unitRaw = get('unit_cost');
  if (unitRaw) {
    unitCostCents = parsePoMoneyCents(unitRaw);
    if (unitCostCents == null) flag('unit_cost', `Unit cost "${unitRaw}" is not a price`);
  }
  const totalRaw = get('line_total');
  if (totalRaw) {
    const totalCents = parsePoMoneyCents(totalRaw);
    if (totalCents == null) flag('line_total', `Line total "${totalRaw}" is not a price`);
    else if (unitCostCents == null && !unitRaw && quantity != null) unitCostCents = Math.round(totalCents / quantity);
  }

  const date = (field: 'order_date' | 'expected_date' | 'return_request_date'): string | null => {
    const raw = get(field);
    if (!raw) return null;
    const parsed = parsePoDate(raw);
    if (!parsed) flag(field, `${PO_COLUMNS[field].label} "${raw}" is not a date`);
    return parsed;
  };
  const orderDate = date('order_date');
  const expectedDate = date('expected_date');
  const returnRequestDate = date('return_request_date');

  let priorityTier: number | null = preset.defaultTier;
  const priorityRaw = get('priority');
  if (priorityRaw && priorityRaw.toLowerCase() !== 'auto') {
    if (/^[0-3]$/.test(priorityRaw)) priorityTier = Number(priorityRaw);
    else flag('priority', `Priority "${priorityRaw}" is not a tier 0–3 or auto`);
  } else if (priorityRaw.toLowerCase() === 'auto') {
    priorityTier = null;
  }

  let trackingNumber: string | null = null;
  const trackingRaw = get('tracking');
  if (trackingRaw && !BLANK_TRACKING_RE.test(trackingRaw)) {
    const canon = extractCanonicalTracking(trackingRaw);
    if (canon.length < 8) flag('tracking', `Tracking "${trackingRaw}" is too short to be a tracking number`);
    else trackingNumber = canon;
  }

  const itemId = get('item_id');
  let listingUrl = get('listing_url');
  if (listingUrl && !/^https?:\/\//i.test(listingUrl)) flag('listing_url', `Listing URL "${listingUrl}" is not an http(s) link`);
  if (!listingUrl && itemId && preset.listingUrlFromItemId) listingUrl = preset.listingUrlFromItemId(itemId);

  const conditionRaw = get('condition');
  const conditionGrade = conditionGradeFromListing(conditionRaw);
  if (conditionRaw && !conditionGrade) {
    flag('condition', `Condition "${conditionRaw}" names no grade (new, like new, refurbished, used A/B/C, parts)`);
  }
  const listingSerials = [...new Set(get('listing_serials').split(/[,;|\n]+/).map((s) => s.trim()).filter(Boolean))];

  const notes: string[] = [];
  const shippingRaw = get('shipping');
  if (shippingRaw) {
    const cents = parsePoMoneyCents(shippingRaw);
    if (cents == null) flag('shipping', `Shipping "${shippingRaw}" is not a price`);
    else if (cents > 0) notes.push(`Shipping $${(cents / 100).toFixed(2)}`);
  }
  const note = get('notes');
  if (note) notes.push(note);

  if (!orderNumber && !skipReason) return { deskRow: null, problems };

  const rma = get('rma');
  const licensePlate = get('license_plate');
  const lineKey = preset.lineKey ? preset.lineKey({ itemId, rma, licensePlate }) : itemId;
  return {
    deskRow: {
      sourceType: inboundSourceTypeForPlatform(platformRaw || 'manual'),
      sourcePlatform: inboundSourcePlatformForRaw(platformRaw),
      receivingType: orderType,
      priorityTier,
      orderId: orderNumber,
      lineItemId: lineKey || null,
      itemNumber: itemId || null,
      sku: sku || null,
      itemName: title || null,
      quantity,
      unitCostCents,
      trackingNumber,
      carrierCode: trackingNumber ? get('carrier') || null : null,
      seller: get('vendor') || preset.vendor || null,
      listingUrl: listingUrl || null,
      orderDate,
      expectedDate,
      notes: notes.join('\n') || null,
      returnReason: get('return_reason') || null,
      rmaId: rma || null,
      returnRequestDate,
      conditionGrade,
      listingSerials,
      fnsku: get('fnsku') || null,
      licensePlateNumber: licensePlate || null,
      disposition: get('disposition') || null,
      customerComment: get('customer_comment') || null,
      catalogLookup: preset.catalogByItemId ? [sku, itemId].filter(Boolean) : [],
      skipReason,
      rawPayload: row,
    },
    problems: skipReason ? [] : problems,
  };
}
