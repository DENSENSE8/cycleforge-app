/**
 * Collect every openable listing URL for a receiving carton — manual paste,
 * catalog marketplace platform rows, and SKU-derived storefront fallbacks.
 * Dedupes by normalized href and orders manual → platform-matched catalog →
 * other catalog → derived. Zoho PO cartons pass `suppressEcwidStorefront` so
 * Ecwid/usavshop auto-links are not invented from inventory SKUs.
 */

import { normalizeListingHref } from '@/lib/receiving/listing-href';
import { sourcePlatformLabel } from '@/lib/source-platform';
import { parseListingLinksFromSyncNotes } from '@/lib/zoho-po-prefill';
import {
  getExternalUrlByItemNumber,
  getExternalUrlByPlatform,
} from '@/utils/external-item-url';

export interface CartonListingLink {
  /**
   * `receiving_listing_links.id` when this link is a DURABLE row — the handle
   * an edit / delete / reorder needs. `null` on a computed tier (`catalog` /
   * `derived`) and on the legacy scalar+notes fallback, which have no row to
   * address: those are read-only by construction.
   */
  id?: number | null;
  href: string;
  /**
   * What KIND of link this is — `Listing`, a platform row (`eBay · acct`),
   * `Storefront`. Always present, never operator-authored.
   */
  label: string;
  /**
   * The human name for THIS link, when someone gave it one — today the title
   * a buyer wrote before the URL in the Zoho PO sync notes
   * (`Bose QC35 black: https://…`). Absent for links nobody named.
   *
   * Distinct from `label` on purpose: a surface picking between several links
   * needs the name that tells them apart, and `label` is identical across every
   * link from one source (three sync-note links are all `Synced`).
   */
  title?: string | null;
  source: 'manual' | 'sync_notes' | 'catalog' | 'derived';
}

/**
 * The durable-row shape this resolver consumes — structural on purpose, so
 * `listing-links.ts` stays free of the store module (and of `pg`).
 * Satisfied by `StoredListingLink` from `listing-link-store.ts`.
 */
export interface StoredCartonListingLink {
  id: number;
  href: string;
  label: string | null;
  source: 'manual' | 'sync_notes';
}

export interface CatalogPlatformLinkInput {
  platform: string;
  platformSku?: string | null;
  platformItemId?: string | null;
  accountName?: string | null;
  listingUrl?: string | null;
}

/**
 * Re-exported from the leaf `listing-href` module, which is where the function
 * lives so `zoho-po-prefill` (imported above) can share it without a cycle.
 * This stays the public import path — a second `new URL(...)` + protocol check
 * anywhere in the listing path is the fork.
 */
export { normalizeListingHref };

const normalizeHref = normalizeListingHref;

function platformRowLabel(p: CatalogPlatformLinkInput): string {
  const base = sourcePlatformLabel(p.platform) || p.platform;
  return p.accountName?.trim() ? `${base} · ${p.accountName.trim()}` : base;
}

function catalogRowHref(p: CatalogPlatformLinkInput): string | null {
  const stored = (p.listingUrl || '').trim();
  if (stored) return normalizeHref(stored);
  const id = (p.platformItemId || p.platformSku || '').trim();
  if (!id) return null;
  return getExternalUrlByPlatform(p.platform, id);
}

function sortKey(
  link: CartonListingLink,
  sourcePlatform: string | null | undefined,
  platformOrder: Map<string, string>,
): number {
  if (link.source === 'manual') return 0;
  if (link.source === 'catalog') {
    const platform = [...platformOrder.entries()].find(([, href]) => href === link.href)?.[0];
    if (platform && platform === (sourcePlatform || '').trim().toLowerCase()) return 1;
    return 2;
  }
  return 3;
}

/**
 * Returns unique listing links for the carton context chip. The first entry is
 * the primary open target (explicit URL wins, then catalog row for the carton's
 * platform, then remaining catalog rows, then SKU-derived storefront search).
 */
export function collectCartonListingLinks(args: {
  listingLink: string;
  syncNotes?: string | null;
  sku: string | null | undefined;
  sourcePlatform: string | null | undefined;
  isUnmatched: boolean;
  /**
   * Zoho PO cartons: hide Ecwid/usavshop auto-links. Zoho SKUs are inventory
   * identity, not storefront listings — derived + catalog ecwid/zoho rows must
   * not invent a usavshop search URL. Manual paste + sync notes + other
   * marketplace catalog rows still pass through.
   */
  suppressEcwidStorefront?: boolean;
  platforms?: CatalogPlatformLinkInput[];
  /**
   * Durable `receiving_listing_links` rows for this carton, in the buyer's
   * order. Non-empty supersedes `listingLink` + `syncNotes`; empty/omitted
   * keeps the legacy read (see the strangler note in the body).
   */
  storedLinks?: StoredCartonListingLink[];
}): CartonListingLink[] {
  const seen = new Set<string>();
  const candidates: CartonListingLink[] = [];
  const platformOrder = new Map<string, string>();
  const suppressEcwid = Boolean(args.suppressEcwidStorefront);

  const push = (
    href: string | null,
    label: string,
    source: CartonListingLink['source'],
    title?: string | null,
    id?: number | null,
  ) => {
    if (!href) return;
    const key = href.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ id: id ?? null, href, label, source, title: title?.trim() || null });
  };

  /**
   * Durable rows supersede BOTH legacy tiers they replace — the pasted scalar
   * and the sync-note parse. A carton with no rows yet (nothing backfilled,
   * nobody has edited) falls through to the legacy read unchanged, which is
   * what makes this flip safe to land before the backfill.
   */
  const stored = args.storedLinks ?? [];
  if (stored.length > 0) {
    for (const l of stored) {
      push(l.href, l.label?.trim() || 'Listing', l.source, l.label, l.id);
    }
    // Same rule the sync-note tier has always had: a carton whose links the
    // buyer authored does not also get catalog rows and a storefront guess.
    if (stored.some((l) => l.source === 'sync_notes')) return candidates;
  } else {
    const manual = normalizeHref(args.listingLink);
    if (manual) push(manual, 'Listing', 'manual');

    const syncNoteLinks = parseListingLinksFromSyncNotes(args.syncNotes);
    if (syncNoteLinks.length > 0) {
      for (const l of syncNoteLinks) {
        // `label` stays the kind; the buyer's own title rides in `title`, which is
        // the only thing that tells three sync-note links apart. Order is the
        // note's order — the buyer's order — so these deliberately skip the sort.
        push(l.href, l.title ?? 'Listing', 'sync_notes', l.title);
      }
      return candidates;
    }
  }

  for (const p of args.platforms ?? []) {
    const platformKey = p.platform.trim().toLowerCase();
    if (suppressEcwid && (platformKey === 'ecwid' || platformKey === 'zoho')) continue;
    const href = catalogRowHref(p);
    if (href && !platformOrder.has(platformKey)) platformOrder.set(platformKey, href);
    push(href, platformRowLabel(p), 'catalog');
  }

  if (!args.isUnmatched && !suppressEcwid) {
    const sku = (args.sku || '').trim();
    if (sku) {
      const derived = getExternalUrlByItemNumber(sku);
      push(derived, 'Storefront', 'derived');
    }
  }

  const sourcePlatform = (args.sourcePlatform || '').trim().toLowerCase();
  return [...candidates].sort((a, b) => {
    const da = sortKey(a, sourcePlatform, platformOrder);
    const db = sortKey(b, sourcePlatform, platformOrder);
    if (da !== db) return da - db;
    return a.label.localeCompare(b.label);
  });
}

/**
 * The listing-link inputs a receiving ROW carries, named structurally so any
 * row shape with these fields satisfies it — `ReceivingLineRow` does, without
 * `lib/` importing a component type.
 */
interface ReceivingRowListingInput {
  receiving_listing_url?: string | null;
  receiving_zoho_notes?: string | null;
  sku?: string | null;
  source_platform?: string | null;
  zoho_purchaseorder_id?: string | null;
}

/**
 * Every openable listing link for a receiving line row — the adapter three
 * surfaces share (Testing verify, photo compare, inventory linkage) so none of
 * them re-derives an open target from a bare column.
 *
 * `platforms` is optional because the catalog tier comes from `useSkuIdentity`,
 * a hook: a surface that has not resolved SKU identity gets the manual,
 * sync-note and derived tiers, and honestly no catalog rows — rather than a
 * silently different answer from the same inputs.
 */
export function listingLinksForReceivingRow(
  row: ReceivingRowListingInput,
  opts?: {
    platforms?: CatalogPlatformLinkInput[];
    isUnmatched?: boolean;
    storedLinks?: StoredCartonListingLink[];
  },
): CartonListingLink[] {
  const isZohoPo = Boolean((row.zoho_purchaseorder_id || '').trim());
  return collectCartonListingLinks({
    listingLink: row.receiving_listing_url ?? '',
    syncNotes: row.receiving_zoho_notes ?? null,
    sku: row.sku ?? '',
    sourcePlatform: row.source_platform ?? null,
    isUnmatched: opts?.isUnmatched ?? false,
    suppressEcwidStorefront: isZohoPo,
    platforms: opts?.platforms,
    storedLinks: opts?.storedLinks,
  });
}

export interface ListingLinkMenuOption {
  href: string;
  label: string;
  title: string;
}

/**
 * Stable listing identity key for chip last-8 faces — prefers marketplace item
 * ids embedded in the URL (eBay `/itm/`, Amazon `/dp/`, Goodwill `/item/`),
 * then a cleaned last path segment / query id. Empty when nothing useful parses.
 */
export function listingUrlIdentityKey(href: string | null | undefined): string {
  const raw = String(href ?? '').trim();
  // Same normalizer as every other listing path — parsing an identity key out
  // of a URL we would refuse to OPEN would hand a chip a face for a dead link.
  const normalized = normalizeListingHref(raw);
  if (!normalized) return '';
  try {
    const u = new URL(normalized);
    const path = u.pathname;
    const ebay = path.match(/\/itm\/(\d{6,})/i);
    if (ebay?.[1]) return ebay[1];
    const amazon = path.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
    if (amazon?.[1]) return amazon[1];
    const goodwill = path.match(/\/item\/(\d{6,})/i);
    if (goodwill?.[1]) return goodwill[1];
    const q =
      u.searchParams.get('itemId') ||
      u.searchParams.get('item') ||
      u.searchParams.get('id');
    if (q?.trim()) {
      const digits = q.replace(/\D/g, '');
      return digits.length >= 4 ? digits : q.trim();
    }
    const last = path.split('/').filter(Boolean).pop() ?? '';
    const cleaned = last.replace(/[^a-zA-Z0-9]/g, '');
    return cleaned.length >= 4 ? cleaned : '';
  } catch {
    const digits = raw.replace(/\D/g, '');
    return digits.length >= 4 ? digits : '';
  }
}

/**
 * The marketplace item id a listing URL **structurally** carries — `''` when
 * the URL does not positively attribute one.
 *
 * The strict sibling of {@link listingUrlIdentityKey}, and the two answer
 * different questions on purpose:
 *
 * - `listingUrlIdentityKey` answers *"give me something stable to print on a
 *   chip"*. Its last-path-segment fallback is right there — a cosmetic face
 *   that is merely unhelpful when the URL is odd.
 * - `listingUrlItemId` answers *"give me an id I may WRITE"*. That same
 *   fallback is a **silent wrong id** here: `/sch/i.html` yields `ihtml`,
 *   `/usr/someseller` yields `someseller`, and a usavshop search yields
 *   `search`. Resolving with one of those creates a real order carrying a
 *   fabricated item number, which is exactly what the propose→approve plan
 *   forbids. So this one refuses instead of guessing.
 *
 * Do not "unify" them by loosening this or tightening that — the split IS the
 * safety property.
 */
export function listingUrlItemId(href: string | null | undefined): string {
  const normalized = normalizeListingHref(href);
  if (!normalized) return '';
  let u: URL;
  try {
    u = new URL(normalized);
  } catch {
    return '';
  }
  const path = u.pathname;

  // eBay carries the id last, with or without a title slug in front of it:
  //   /itm/123456789012        and        /itm/Vintage-Sony-Walkman/123456789012
  const ebay = path.match(/\/itm\/(?:[^/]*\/)?(\d{6,})(?:\/|$)/i);
  if (ebay?.[1]) return ebay[1];

  const amazon = path.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i);
  if (amazon?.[1]) return amazon[1].toUpperCase();

  const goodwill = path.match(/\/item\/(\d{6,})(?:\/|$)/i);
  if (goodwill?.[1]) return goodwill[1];

  const walmart = path.match(/\/ip\/(?:[^/]*\/)?(\d{6,})(?:\/|$)/i);
  if (walmart?.[1]) return walmart[1];

  // An explicit id PARAM is structural too — but only when it holds an id-shaped
  // value. `?id=widget` is a slug, not an item number.
  const param =
    u.searchParams.get('itemId') ?? u.searchParams.get('item') ?? u.searchParams.get('id');
  if (param && /^\d{6,}$/.test(param.trim())) return param.trim();

  return '';
}

/**
 * Canonical `SOURCE_PLATFORMS` value for the marketplace a listing URL points
 * at — `''` when the host is not one we recognise.
 *
 * A pasted URL names its own marketplace, which beats inferring one from the
 * order's account source: the same seller account can hold listings the sheet
 * labels differently, and an id pattern (`getPlatformLabelByItemNumber`) is a
 * guess where the hostname is a fact.
 */
export function listingUrlPlatform(href: string | null | undefined): string {
  const normalized = normalizeListingHref(href);
  if (!normalized) return '';
  let host: string;
  try {
    host = new URL(normalized).hostname.toLowerCase();
  } catch {
    return '';
  }
  // `ebay.` / `amazon.` prefix-match so every ccTLD storefront (ebay.co.uk,
  // amazon.de) resolves — the item id is the same id on any of them.
  if (/(^|\.)ebay\./.test(host)) return 'ebay';
  if (/(^|\.)amazon\./.test(host)) return 'amazon';
  if (/(^|\.)walmart\./.test(host)) return 'walmart';
  if (/(^|\.)shopgoodwill\.com$/.test(host)) return 'goodwill';
  if (/(^|\.)mercari\.com$/.test(host)) return 'mercari';
  if (/(^|\.)usavshop\.com$/.test(host)) return 'ecwid';
  return '';
}

/** 1-indexed menu rows for the listing chip hover menu (only when count > 1). */
export function formatListingLinkMenuOptions(
  links: CartonListingLink[],
): ListingLinkMenuOption[] | undefined {
  if (links.length <= 1) return undefined;
  const total = links.length;
  return links.map((l, i) => ({
    href: l.href,
    label: `Listing ${i + 1}/${total}`,
    title: l.href,
  }));
}

/**
 * Hub URL for the popup-blocker-safe multi-open page. Chip hover menus open
 * this in one tab; the Listings tab can open hrefs directly (user gesture).
 */
export function buildOpenLinksHubHref(links: Array<{ href: string }>): string {
  const qs = new URLSearchParams({ links: JSON.stringify(links.map((l) => l.href)) });
  return `/open-links?${qs.toString()}`;
}

/** Open every listing href in a new tab — call only from a direct user gesture. */
export function openAllListingHrefs(hrefs: string[]): void {
  for (const href of hrefs) {
    const t = href.trim();
    if (!t) continue;
    window.open(t, '_blank', 'noopener,noreferrer');
  }
}
