/**
 * The purchase-order IMPORT field contract — what the chat's PO draft card
 * carries and what `import_purchase_order` lands on the Incoming spine through
 * `ingestPurchase` (source `manual`, one spine row per line, the tracking
 * registered and linked to the PO's inbound carton so the arrival scan
 * matches it).
 *
 * Required = what receiving needs to expect and match the box:
 *   PO number (the spine identity), vendor (the card's identity and the
 *   mirror's vendor), at least one item with a quantity (SKU or title — the
 *   spine accepts either), a tracking number (the arrival scan key).
 * Optional: listing link / marketplace item #, unit cost, carrier (detected
 * from the number when not said), expected date, notes.
 *
 * Client-safe: no server imports. Money is integer cents.
 */

import { z } from 'zod';
import { parseListingUrl } from '@/lib/inventory/listing-candidate';
import { detectCarrier, extractCanonicalTracking } from '@/lib/tracking-format';

const text = (max: number) => z.string().trim().max(max);

export const poImportLineSchema = z.object({
  /** Catalog row when the SKU / listing resolved; `null` = imported by title. */
  skuCatalogId: z.number().int().positive().nullable(),
  sku: text(100),
  /** Identity title (`resolveSkuIdentityTitle`) or what the PO called it. */
  title: text(300),
  /** `null` = the PO did not say — asked for, never assumed. */
  quantity: z.number().int().min(1).max(9999).nullable(),
  unitCostCents: z.number().int().min(0).max(100_000_000).nullable(),
  listingUrl: text(600),
  /** Marketplace item # the listing link carries (eBay item, ASIN, …). */
  itemNumber: text(64),
});
export type PoImportLine = z.infer<typeof poImportLineSchema>;

export const poImportTrackingSchema = z.object({
  /** Canonical (`extractCanonicalTracking`) — the arrival scan's key. */
  number: text(60).min(8),
  /** Display carrier; `Unknown` when the number does not say. */
  carrier: text(40),
});
export type PoImportTracking = z.infer<typeof poImportTrackingSchema>;

export const poImportDraftSchema = z.object({
  poNumber: text(120),
  vendor: text(200),
  lines: z.array(poImportLineSchema).max(20),
  tracking: z.array(poImportTrackingSchema).max(10),
  /** Civil date `YYYY-MM-DD`. */
  expectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  notes: text(1000),
  currency: z.string().trim().length(3),
});
export type PoImportDraft = z.infer<typeof poImportDraftSchema>;

export function emptyPoImportDraft(): PoImportDraft {
  return { poNumber: '', vendor: '', lines: [], tracking: [], expectedDate: null, notes: '', currency: 'USD' };
}

// ─── the "Still needed" checklist ────────────────────────────────────────────

export type PoImportField = 'po_number' | 'vendor' | 'items' | 'quantity' | 'tracking';

export interface PoImportNeed {
  field: PoImportField;
  /** Checklist line, sentence case: "Tracking number". */
  label: string;
  /** The one question the assistant asks for it (and the chip seeds). */
  question: string;
  /** Composer seed the chip drops in — the operator types the value after it. */
  prompt: string;
}

/** What still blocks the import, in card order. Empty = ready. */
export function poImportMissing(draft: PoImportDraft): PoImportNeed[] {
  const needs: PoImportNeed[] = [];
  if (!draft.poNumber) {
    needs.push({ field: 'po_number', label: 'PO number', question: 'What is the PO number?', prompt: 'PO number:' });
  }
  if (!draft.vendor) {
    needs.push({ field: 'vendor', label: 'Vendor', question: 'Who is the vendor?', prompt: 'Vendor:' });
  }
  if (draft.lines.length === 0) {
    needs.push({
      field: 'items',
      label: 'Items',
      question: 'Which items are on it (SKU or listing link, and quantity)?',
      prompt: 'Items:',
    });
  }
  draft.lines.forEach((line, i) => {
    if (line.quantity == null) {
      const name = line.sku || line.title || `line ${i + 1}`;
      needs.push({
        field: 'quantity',
        label: `Quantity for ${name}`,
        question: `How many ${name}?`,
        prompt: `Quantity for line ${i + 1}:`,
      });
    }
  });
  if (draft.tracking.length === 0) {
    needs.push({ field: 'tracking', label: 'Tracking number', question: 'What is the tracking number?', prompt: 'Tracking number:' });
  }
  return needs;
}

// ─── extraction: pasted PO text → fields ─────────────────────────────────────

export interface ExtractedPoItem {
  /** SKU when labelled, else the product words. */
  product: string;
  sku: boolean;
  quantity: number | null;
  unitCostCents: number | null;
  listingUrl: string;
}

export interface ExtractedPo {
  poNumber: string | null;
  vendor: string | null;
  tracking: PoImportTracking[];
  /** Listing links not already attached to an item line. */
  listingUrls: string[];
  items: ExtractedPoItem[];
  /** As written ("Oct 3", "Friday") — the tool resolves it to a date. */
  expected: string | null;
  notes: string | null;
  carrier: string | null;
  /** 1-based line → quantity, from "quantity for line 2: 3". */
  lineQuantities: Array<{ line: number; quantity: number }>;
}

const CARRIER_WORDS: Array<[RegExp, string]> = [
  [/\bups\b/i, 'UPS'],
  [/\bfed\s?ex\b/i, 'FedEx'],
  [/\busps\b/i, 'USPS'],
  [/\bdhl\b/i, 'DHL'],
  [/\bontrac\b/i, 'OnTrac'],
  [/\bamazon\s+(?:logistics|shipping)\b/i, 'AMAZON'],
];

/** Numbers carriers print that are safe to lift without a "tracking" label. */
const UNLABELED_TRACKING = /\b(1Z[0-9A-Z]{16}|9[2-5]\d{18,24}|TBA\d{12})\b/gi;
/** "Tracking: X", "tracking # X, Y and Z" — digit groups a label printer spaced out count as one number. */
const LABELED_TRACKING =
  /\b(?:tracking|trk)(?:\s*(?:numbers?|nos?\.?|#))?\s*(?:is\s+|are\s+|[:#=]\s*|\s)\s*((?:(?:\d{4}\s){3,}\d{2,}|[A-Z0-9][A-Z0-9-]{6,44})(?:\s*(?:,|and|&)\s*(?:(?:\d{4}\s){3,}\d{2,}|[A-Z0-9][A-Z0-9-]{6,44}))*)/gi;

/** A canonical tracking entry, or `null` when it is not number-shaped. */
export function trackingEntry(raw: string, carrierSaid?: string | null): PoImportTracking | null {
  const number = extractCanonicalTracking(raw);
  if (number.length < 8 || number.length > 40 || !/\d/.test(number)) return null;
  const detected = detectCarrier(number);
  return { number, carrier: detected !== 'Unknown' ? detected : carrierSaid || 'Unknown' };
}

function cleanValue(raw: string): string {
  return raw.replace(/\s+/g, ' ').replace(/^[\s:#=-]+|[\s.,;]+$/g, '').trim();
}

/**
 * Lift PO fields out of what the operator pasted (an email, a screenshot's
 * text, a vendor confirmation) or typed as a follow-up. Deterministic —
 * nothing is inferred that the text does not say.
 */
export function extractPoFields(input: string): ExtractedPo {
  const raw = String(input ?? '');
  const out: ExtractedPo = {
    poNumber: null,
    vendor: null,
    tracking: [],
    listingUrls: [],
    items: [],
    expected: null,
    notes: null,
    carrier: null,
    lineQuantities: [],
  };
  if (!raw.trim()) return out;

  for (const [re, name] of CARRIER_WORDS) {
    if (re.test(raw)) {
      out.carrier = name;
      break;
    }
  }

  // URLs first — their digits must not read as tracking / PO numbers.
  const urls: string[] = [];
  const noUrls = raw.replace(/\bhttps?:\/\/[^\s<>"')]+|\bwww\.[^\s<>"')]+/gi, (url) => {
    urls.push(url.replace(/[.,;]+$/, ''));
    return ' ';
  });

  const po = noUrls.match(
    /\b(?:p\.?\s?o\.?|purchase\s+order)(?:\s*(?:#|no\.?|number|num))?\s*(?:is\s+|[:#=]\s*|\s)\s*#?\s*([A-Za-z0-9][A-Za-z0-9\-_/]{1,40})/i,
  );
  if (po && /\d/.test(po[1])) out.poNumber = po[1].toUpperCase();

  const vendor = noUrls.match(/\b(?:vendor|supplier|seller|sold\s+by)\s*(?:is\s+|[:=]\s*|-\s*)([^\n,;]{2,120})/i);
  if (vendor) {
    const v = cleanValue(vendor[1].replace(/\b(?:po|tracking|expected|eta|items?|sku|qty)\b.*$/i, ''));
    if (v) out.vendor = v.slice(0, 200);
  }

  const seen = new Set<string>();
  const addTracking = (value: string) => {
    const entry = trackingEntry(value.replace(/\s+/g, ''), out.carrier);
    if (entry && !seen.has(entry.number) && entry.number !== out.poNumber) {
      seen.add(entry.number);
      out.tracking.push(entry);
    }
  };
  for (const m of noUrls.matchAll(LABELED_TRACKING)) {
    for (const token of m[1].split(/\s*(?:,|\band\b|&)\s*/i)) addTracking(token);
  }
  for (const m of noUrls.matchAll(UNLABELED_TRACKING)) addTracking(m[1]);

  const expected = noUrls.match(
    /\b(?:expected(?:\s+(?:date|delivery|arrival))?|eta|arriv(?:es|ing|al)|deliver(?:y|s|ed)?(?:\s+date)?)\s*(?:by|on)?\s*[:=]?\s*([A-Za-z0-9/\- ]{3,30}?)(?=[\n,;.]|$)/i,
  );
  if (expected) out.expected = cleanValue(expected[1]) || null;

  const notes = noUrls.match(/\bnotes?\s*[:=]\s*([^\n]{1,1000})/i);
  if (notes) out.notes = cleanValue(notes[1]) || null;

  for (const m of noUrls.matchAll(/\bquantity\s+(?:for|of)\s+line\s+(\d{1,2})\s*(?:is|[:=])?\s*(\d{1,4})\b/gi)) {
    out.lineQuantities.push({ line: Number(m[1]), quantity: Number(m[2]) });
  }

  // Items: one per line / semicolon segment of the ORIGINAL text, so a
  // segment's listing link stays with its quantity and cost.
  for (const segment of raw.split(/\n|;/)) {
    const seg = segment.trim();
    if (!seg) continue;
    const segUrls = [...seg.matchAll(/\bhttps?:\/\/[^\s<>"')]+|\bwww\.[^\s<>"')]+/gi)].map((m) => m[0].replace(/[.,;]+$/, ''));
    const listing = segUrls.find((u) => parseListingUrl(u).ok) ?? '';
    const body = seg.replace(/\bhttps?:\/\/[^\s<>"')]+|\bwww\.[^\s<>"')]+/gi, ' ');
    if (/\bquantity\s+(?:for|of)\s+line\b/i.test(body)) continue;

    const skuM = body.match(/\bsku\s*(?:is\s+|[:#=]\s*|\s)\s*([A-Za-z0-9][A-Za-z0-9\-_.\/]{1,60}[A-Za-z0-9])/i);
    const lead = body.match(/^\s*(?:items?\s*[:=]\s*)?(?:[-*•]\s*)?(\d{1,4})\s*(?:x|×|pcs?|units?|ea)\s+(.+?)\s*$/i);
    const qtyM =
      body.match(/\b(?:qty|quantity|units?)\s*(?:is\s+|[:=]\s*|\s)\s*(\d{1,4})\b/i) ??
      body.match(/(?:^|\s)[x×]\s*(\d{1,4})\b/i) ??
      body.match(/\b(\d{1,4})\s*[x×]\s/i) ??
      body.match(/\b(\d{1,4})\s+(?:of|units?|pcs)\b/i);
    const costM =
      body.match(/(?:@|\bcost\b|\bprice\b|\bunit\s+cost\b|\beach\b)\s*(?:is\s+|[:=]\s*)?\$?\s*(\d[\d,]*(?:\.\d{1,2})?)/i) ??
      body.match(/\$\s*(\d[\d,]*(?:\.\d{1,2})?)(?:\s*(?:each|ea|\/\s*ea|per))?/i);

    let product = '';
    let isSku = false;
    if (skuM) {
      product = skuM[1];
      isSku = true;
    } else if (lead) {
      product = cleanValue(lead[2].replace(/(?:@|\$).*$/, '').replace(/\b(?:each|ea)\b.*$/i, ''));
    }
    if (!product && !listing) continue;

    const quantity = lead ? Number(lead[1]) : qtyM ? Number(qtyM[1]) : null;
    const cost = costM ? Number(costM[1].replace(/,/g, '')) : NaN;
    out.items.push({
      product,
      sku: isSku,
      quantity: quantity != null && quantity >= 1 ? quantity : null,
      unitCostCents: Number.isFinite(cost) && cost >= 0 ? Math.round(cost * 100) : null,
      listingUrl: listing,
    });
  }

  const attached = new Set(out.items.map((i) => i.listingUrl).filter(Boolean));
  out.listingUrls = urls.filter((u) => parseListingUrl(u).ok && !attached.has(u));
  return out;
}

// ─── merge: each follow-up updates the same draft ────────────────────────────

export interface PoImportPatch {
  poNumber?: string | null;
  vendor?: string | null;
  /** Replaces the item list when given (non-empty). */
  lines?: PoImportLine[] | null;
  /** Added to the list (deduplicated by canonical number). */
  tracking?: PoImportTracking[] | null;
  /** Links not tied to a line: fill lines without one, in order. */
  listingLines?: PoImportLine[] | null;
  lineQuantities?: Array<{ line: number; quantity: number }> | null;
  expectedDate?: string | null;
  notes?: string | null;
}

export function mergePoDraft(base: PoImportDraft, patch: PoImportPatch): PoImportDraft {
  const next: PoImportDraft = structuredClone(base);
  if (patch.poNumber) next.poNumber = patch.poNumber.trim().toUpperCase();
  if (patch.vendor) next.vendor = patch.vendor.trim();
  if (patch.lines && patch.lines.length > 0) next.lines = patch.lines.slice(0, 20);
  for (const extra of patch.listingLines ?? []) {
    const open = next.lines.find((l) => !l.listingUrl && (extra.skuCatalogId == null || l.skuCatalogId == null || l.skuCatalogId === extra.skuCatalogId));
    if (open) {
      open.listingUrl = extra.listingUrl;
      open.itemNumber = extra.itemNumber;
      if (open.skuCatalogId == null && extra.skuCatalogId != null) {
        open.skuCatalogId = extra.skuCatalogId;
        open.sku = extra.sku;
        open.title = extra.title;
      }
    } else if (next.lines.length < 20) {
      next.lines.push(extra);
    }
  }
  for (const { line, quantity } of patch.lineQuantities ?? []) {
    const target = next.lines[line - 1];
    if (target && quantity >= 1) target.quantity = Math.min(9999, quantity);
  }
  const have = new Set(next.tracking.map((t) => t.number));
  for (const t of patch.tracking ?? []) {
    if (!have.has(t.number) && next.tracking.length < 10) {
      have.add(t.number);
      next.tracking.push(t);
    }
  }
  if (patch.expectedDate) next.expectedDate = patch.expectedDate;
  if (patch.notes) next.notes = next.notes ? `${next.notes}\n${patch.notes}`.slice(0, 1000) : patch.notes.slice(0, 1000);
  return next;
}

export function formatCostCents(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}
