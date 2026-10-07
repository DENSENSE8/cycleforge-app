/**
 * Receiving › Purchasing (`GET /api/nav/purchases`) — every inbound purchase
 * straight from our tables, read the way the pasted list (`/search/list`)
 * reads a number: one entry per purchase, ref = its number, with the inbound
 * locator's own buckets, detail, record and facts (`locateInbound`, the SAME
 * verdict — no second implementation).
 *
 * Identity — ONE row per physical purchase, the identity a paste of its
 * number resolves to:
 * 1. a number is one purchase: the enumeration's rows (`./sql`, Zoho POs +
 *    eBay / Amazon / manual orders) group by canonical number — two Zoho POs
 *    sharing a PO#, or an eBay order whose id IS the PO#, are one row;
 * 2. an order recorded as the same purchase as a better-ranked one
 *    (`inbound_purchase_order_equivalence`; rank = `INBOUND_SOURCE_TYPES`
 *    order, Zoho first) folds into it;
 * 3. an eBay order that `matchZohoPo` (the eBay ↔ Zoho merge's rule:
 *    tracking last-8, or order# = Reference#) pairs with a Zoho PO folds
 *    into that PO.
 * The surviving number is the `ref`; a folded order still answers the Find.
 *
 * Reads: the enumeration (one statement), then the locator's arms in
 * parallel over the window's numbers — our tables only: the Check never asks
 * live Zoho here (`liveZoho: false`); a mirror miss is decided by the lines.
 * Window and Find are set-based in that statement; source / vendor / who
 * unboxed are the row's own facts (`facts.vendor` is the label the row
 * paints), so they filter the located entries, and each facet counts with
 * every OTHER filter applied. Bucket counts ignore `status`; entries honour it.
 */

import type { NavLocateBucket, NavLocateEntry, NavLocateFacts, NavPurchasesFacets, NavPurchasesResponse } from '@/lib/nav/context/schema';
import { INBOUND_SOURCE_LABELS, type InboundSourceType } from '@/lib/inbound/source-registry';
import { matchZohoPo } from '@/lib/inbound/purchase-match';
import { LOCATE_BUCKET_PRECEDENCE, primaryBucketId } from '@/lib/nav/locate/bucket-precedence';
import { INBOUND_LOCATE_PERMISSION, locateInbound, type InboundLocateDeps } from '@/lib/nav/locate/inbound';
import { readInboundAwaiting, readInboundCheck, readInboundLines } from '@/lib/nav/locate/service';
import { buildPurchasesSql, purchaseRowOf, type PurchaseRow, type PurchasesWindow } from '@/lib/nav/purchases/sql';
import { readInboundFollowups } from '@/lib/receiving/inbound-followups-store';
import { PURCHASES_SORT_DIR, type PurchasesSort } from '@/lib/receiving/purchases-params';
import { NavPurchasesQuery } from '@/lib/schemas/nav';
import { tenantQueryOneTrip } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { normalizeTrackingLast8 } from '@/lib/tracking-format';
import { addDaysToDateKey, getCurrentPSTDateKey, warehouseDayUtcBounds } from '@/utils/date';
import { canonicalizeTrackingKey } from '@/lib/zoho/call-reduction';

/** The Inbound ledger's own gate — the locate's inbound permission. */
export const NAV_PURCHASES_PERMISSION = INBOUND_LOCATE_PERMISSION;

/** No window given = the last this-many PT days, today included. */
export const PURCHASES_DEFAULT_WINDOW_DAYS = 90;

export interface NavPurchasesDeps {
  /** The enumeration statement (`buildPurchasesSql`), one round trip. */
  purchases(orgId: OrgId, window: PurchasesWindow, find: { text: string; key: string } | null): Promise<PurchaseRow[]>;
  /** The inbound locator's reads for this org. */
  inbound(orgId: OrgId): InboundLocateDeps;
  /** Today's PT civil day (`YYYY-MM-DD`). */
  today(): string;
}

export const defaultNavPurchasesDeps: NavPurchasesDeps = {
  purchases: async (orgId, window, find) => {
    const { sql, params } = buildPurchasesSql(orgId, window, find);
    return (await tenantQueryOneTrip(orgId, sql, params)).rows.map(purchaseRowOf);
  },
  inbound: (orgId) => ({
    // Our tables only: a full window would otherwise send every mirror miss to live Zoho.
    check: (refs) => readInboundCheck(orgId, refs, { liveZoho: false }),
    lines: (refs) => readInboundLines(orgId, refs),
    awaiting: (refs) => readInboundAwaiting(orgId, refs),
    followups: (keys) => readInboundFollowups(orgId, [...keys]),
  }),
  today: getCurrentPSTDateKey,
};

export type NavPurchasesResult =
  | { ok: true; body: NavPurchasesResponse }
  | { ok: false; status: 403; error: 'FORBIDDEN'; permission: string }
  | { ok: false; status: 400; error: 'BAD_REQUEST'; message: string };

/**
 * The query's window as the statement reads it. Neither bound = the last
 * {@link PURCHASES_DEFAULT_WINDOW_DAYS} PT days; `from=all` = no lower bound.
 * Days are PT civil days, inclusive; the stamped axes compare instants from
 * the start of `from` to the start of the day after `to` (exclusive).
 */
export function purchasesWindow(query: Pick<NavPurchasesQuery, 'axis' | 'from' | 'to'>, today: string): PurchasesWindow {
  const unset = query.from === undefined && query.to === undefined;
  const fromDay = unset
    ? addDaysToDateKey(today, 1 - PURCHASES_DEFAULT_WINDOW_DAYS)
    : query.from === 'all'
      ? null
      : (query.from ?? null);
  const toDay = unset ? today : (query.to ?? null);
  return {
    axis: query.axis,
    fromDay,
    toDay,
    fromAt: fromDay ? (warehouseDayUtcBounds(fromDay)?.startIso ?? null) : null,
    toBefore: toDay ? (warehouseDayUtcBounds(addDaysToDateKey(toDay, 1))?.startIso ?? null) : null,
  };
}

/** One purchase after twins fold. */
export interface Purchase {
  ref: string;
  key: string;
  source: InboundSourceType;
  vendor: string | null;
  orderedOn: string | null;
  /** ISO-8601 UTC: first on record (`PurchaseRow.importedAt`), earliest across the number's own rows. */
  importedAt: string | null;
  inWindow: boolean;
  matchesFind: boolean;
}

/** Which of two records of one purchase stands for it: the ERP's PO first (`INBOUND_SOURCE_TYPES` order). */
const SOURCE_RANK: Readonly<Record<InboundSourceType, number>> = { zoho: 0, ebay: 1, amazon: 2, manual: 3 };

interface NumberGroup {
  key: string;
  members: PurchaseRow[];
  /** The best-ranked member — its number, source and window stand for the group. */
  lead: PurchaseRow;
  /** The group this one folds into, when it is another's twin. */
  into: number | null;
}

/**
 * The enumeration's rows → one {@link Purchase} per physical purchase, in the
 * statement's order (identity rules in the module doc).
 */
export function foldPurchases(rows: readonly PurchaseRow[]): Purchase[] {
  const groups: NumberGroup[] = [];
  const byKey = new Map<string, number>();
  for (const row of rows) {
    const key = canonicalizeTrackingKey(row.ref);
    if (!key) continue;
    const at = byKey.get(key);
    if (at === undefined) {
      byKey.set(key, groups.length);
      groups.push({ key, members: [row], lead: row, into: null });
      continue;
    }
    const group = groups[at]!;
    group.members.push(row);
    if (SOURCE_RANK[row.source] < SOURCE_RANK[group.lead.source]) group.lead = row;
  }

  const byIdentity = new Map<string, number>();
  // The Zoho signals `matchZohoPo` reads, indexed so an eBay order is tried only against its candidates.
  const byReference = new Map<string, number[]>();
  const byLast8 = new Map<string, number[]>();
  const index = (map: Map<string, number[]>, key: string, at: number) => {
    if (!key) return;
    const list = map.get(key);
    if (!list) map.set(key, [at]);
    else if (list[list.length - 1] !== at) list.push(at);
  };
  groups.forEach((group, at) => {
    for (const member of group.members) {
      if (member.purchaseId) byIdentity.set(`${member.source}:${member.purchaseId}`, at);
      if (member.source !== 'zoho') continue;
      index(byReference, canonicalizeTrackingKey(member.referenceNumber), at);
      for (const tracking of [member.referenceNumber, ...member.trackings]) {
        if (tracking) index(byLast8, normalizeTrackingLast8(tracking), at);
      }
    }
  });

  const zohoTwin = (at: number): number | null => {
    for (const order of groups[at]!.members) {
      if (order.source !== 'ebay') continue;
      const candidates = new Set([
        ...(byReference.get(groups[at]!.key) ?? []),
        ...order.trackings.flatMap((tracking) => byLast8.get(normalizeTrackingLast8(tracking)) ?? []),
      ]);
      const orderTrackings = order.trackings.length > 0 ? order.trackings : [null];
      for (const candidate of [...candidates].sort((a, b) => a - b)) {
        if (candidate === at) continue;
        const twin = groups[candidate]!.members.some((po) => {
          if (po.source !== 'zoho') return false;
          const poTrackings = [po.referenceNumber, ...po.trackings].filter(Boolean);
          return orderTrackings.some((tracking) =>
            (poTrackings.length > 0 ? poTrackings : [null]).some(
              (poTracking) =>
                matchZohoPo(
                  { receivingLineId: 0, sourceOrderId: order.ref, sku: null, tracking },
                  { zohoPurchaseOrderId: po.purchaseId ?? '', poNumber: po.ref, tracking: poTracking, referenceNumber: po.referenceNumber },
                ) != null,
            ),
          );
        });
        if (twin) return candidate;
      }
    }
    return null;
  };

  groups.forEach((group, at) => {
    const rank = SOURCE_RANK[group.lead.source];
    if (rank === 0) return;
    // A recorded equivalence names its better-ranked twin; ranks only fall, so folds never cycle.
    const recorded = group.members
      .flatMap((member) => member.equivalents)
      .map((identity) => byIdentity.get(identity))
      .find((other) => other !== undefined && other !== at && SOURCE_RANK[groups[other]!.lead.source] < rank);
    group.into = recorded ?? zohoTwin(at);
  });

  const rootOf = (at: number): number => {
    let root = at;
    while (groups[root]!.into !== null) root = groups[root]!.into!;
    return root;
  };
  const foundByFind = new Set<number>();
  groups.forEach((group, at) => {
    if (group.members.some((member) => member.matchesFind)) foundByFind.add(rootOf(at));
  });

  const purchases: Purchase[] = [];
  groups.forEach((group, at) => {
    if (group.into !== null) return;
    const { lead } = group;
    // The number's own rows (never a folded twin's) decide its window and dates.
    const orderedOn = group.members.reduce<string | null>(
      (latest, member) => (member.orderedOn && (!latest || member.orderedOn > latest) ? member.orderedOn : latest),
      null,
    );
    // ISO-8601 UTC strings order as their instants.
    const importedAt = group.members.reduce<string | null>(
      (first, member) => (member.importedAt && (!first || member.importedAt < first) ? member.importedAt : first),
      null,
    );
    purchases.push({
      ref: lead.ref,
      key: group.key,
      source: lead.source,
      vendor: group.members.find((member) => member.vendor)?.vendor ?? null,
      orderedOn,
      importedAt,
      inWindow: group.members.some((member) => member.inWindow),
      matchesFind: foundByFind.has(at),
    });
  });
  return purchases;
}

/** One located purchase with the attributes its filters and sorts read. */
interface Located {
  purchase: Purchase;
  entry: NavLocateEntry;
  vendor: string | null;
  unboxedBy: { id: number; name: string | null } | null;
}

/** A purchase no line or Check answers yet: what the enumeration alone knows about it. */
function purchaseOnlyFacts(purchase: Purchase): NavLocateFacts {
  return {
    section: 'inbound',
    title: null,
    sku: null,
    tracking: null,
    deliveredAt: null,
    channelStatus: null,
    shipBy: null,
    pickedAt: null,
    pickedBy: null,
    packedAt: null,
    shippedAt: null,
    packer: null,
    po: null,
    vendor: purchase.vendor,
    lines: 0,
    duplicates: [],
    unboxedAt: null,
    unboxedBy: null,
    units: null,
  };
}

type SortValue = string | number | null;

const INBOUND_PRECEDENCE = LOCATE_BUCKET_PRECEDENCE.inbound;

/** Each sort's key (null sorts last either way); its direction when `dir` is absent is `PURCHASES_SORT_DIR`. */
const SORT_KEYS: Readonly<Record<PurchasesSort, (row: Located) => SortValue>> = {
  ordered: (row) => row.purchase.orderedOn,
  imported: (row) => row.purchase.importedAt,
  delivered: (row) => row.entry.facts?.deliveredAt ?? null,
  unboxed: (row) => row.entry.facts?.unboxedAt ?? null,
  // Delivered and not yet scanned or unboxed here (the Delivered status), longest wait first.
  waiting: (row) => (row.entry.buckets.includes('delivered') ? (row.entry.facts?.deliveredAt ?? null) : null),
  po: (row) => row.purchase.ref,
  vendor: (row) => row.vendor,
  product: (row) => row.entry.facts?.title ?? null,
  status: (row) => {
    const id = primaryBucketId(row.entry.buckets, 'inbound');
    return id ? INBOUND_PRECEDENCE.indexOf(id) : null;
  },
  units: (row) => row.entry.facts?.units?.expected ?? row.entry.facts?.units?.received ?? null,
};

const TEXT_ORDER = new Intl.Collator('en-US', { numeric: true, sensitivity: 'base' });

/**
 * Sorted by `sort` / `dir`, nulls last; ties fall to the order date, then the
 * import instant, then the number — newest first, except under a date sort
 * (Ordered / Imported), whose ties follow its own direction.
 */
function sortLocated(rows: Located[], sort: PurchasesSort, dir: 'asc' | 'desc' | undefined): Located[] {
  const key = SORT_KEYS[sort];
  const sign = (dir ?? PURCHASES_SORT_DIR[sort]) === 'asc' ? 1 : -1;
  const tieSign = sort === 'ordered' || sort === 'imported' ? sign : -1;
  const byDate = (a: string | null, b: string | null): number => {
    if (a === b) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return (a < b ? -1 : 1) * tieSign;
  };
  return rows
    .map((row) => ({ row, value: key(row) }))
    .sort((a, b) => {
      if (a.value !== b.value) {
        if (a.value === null) return 1;
        if (b.value === null) return -1;
        const by =
          typeof a.value === 'number' && typeof b.value === 'number'
            ? a.value - b.value
            : TEXT_ORDER.compare(String(a.value), String(b.value));
        if (by !== 0) return by * sign;
      }
      return (
        byDate(a.row.purchase.orderedOn, b.row.purchase.orderedOn) ||
        byDate(a.row.purchase.importedAt, b.row.purchase.importedAt) ||
        TEXT_ORDER.compare(a.row.purchase.ref, b.row.purchase.ref)
      );
    })
    .map(({ row }) => row);
}

type PurchasesFilter = 'source' | 'vendor' | 'unboxedBy';

/** The row passes the query's source / vendor / unboxed-by filters, `except` one (its own facet counts without it). */
function keeps(row: Located, query: NavPurchasesQuery, except?: PurchasesFilter): boolean {
  return (
    (except === 'source' || query.source === undefined || row.purchase.source === query.source) &&
    (except === 'vendor' || query.vendor === undefined || row.vendor === query.vendor) &&
    (except === 'unboxedBy' || query.unboxedBy === undefined || row.unboxedBy?.id === query.unboxedBy)
  );
}

/** Each facet over the rows every OTHER filter keeps; most first, then by label. */
function purchasesFacets(rows: readonly Located[], query: NavPurchasesQuery): NavPurchasesFacets {
  const vendors = new Map<string, { value: string; label: string; count: number }>();
  const sources = new Map<string, { value: string; label: string; count: number }>();
  const staff = new Map<number, { id: number; name: string | null; count: number }>();
  for (const row of rows) {
    if (row.vendor && keeps(row, query, 'vendor')) {
      const value = vendors.get(row.vendor) ?? { value: row.vendor, label: row.vendor, count: 0 };
      value.count += 1;
      vendors.set(row.vendor, value);
    }
    if (keeps(row, query, 'source')) {
      const { source } = row.purchase;
      const value = sources.get(source) ?? { value: source, label: INBOUND_SOURCE_LABELS[source], count: 0 };
      value.count += 1;
      sources.set(source, value);
    }
    if (row.unboxedBy && keeps(row, query, 'unboxedBy')) {
      const value = staff.get(row.unboxedBy.id) ?? { ...row.unboxedBy, count: 0 };
      value.count += 1;
      staff.set(row.unboxedBy.id, value);
    }
  }
  const mostFirst = <T extends { count: number }>(values: Iterable<T>, label: (value: T) => string): T[] =>
    [...values].sort((a, b) => b.count - a.count || TEXT_ORDER.compare(label(a), label(b)));
  return {
    vendors: mostFirst(vendors.values(), (value) => value.label),
    sources: mostFirst(sources.values(), (value) => value.label),
    unboxedBy: mostFirst(staff.values(), (value) => value.name ?? ''),
  };
}

export async function getNavPurchases(
  caller: { orgId: OrgId; permissions: ReadonlySet<string> },
  params: URLSearchParams,
  deps: NavPurchasesDeps = defaultNavPurchasesDeps,
): Promise<NavPurchasesResult> {
  if (!caller.permissions.has(NAV_PURCHASES_PERMISSION)) {
    return { ok: false, status: 403, error: 'FORBIDDEN', permission: NAV_PURCHASES_PERMISSION };
  }
  // A blank param is an unset control, never a filter.
  const raw = Object.fromEntries([...params].filter(([, value]) => value.trim() !== ''));
  const parsed = NavPurchasesQuery.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, status: 400, error: 'BAD_REQUEST', message: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'query'}: ${issue.message}`).join('; ') };
  }
  const query = parsed.data;
  const { orgId } = caller;
  const findText = (query.find ?? query.q ?? '').trim();
  const find = findText ? { text: findText, key: canonicalizeTrackingKey(findText) } : null;

  const rows = await deps.purchases(orgId, purchasesWindow(query, deps.today()), find);
  const visible = foldPurchases(rows).filter((purchase) => purchase.inWindow && purchase.matchesFind);
  const answer = await locateInbound(
    { refs: visible.map((purchase) => purchase.ref), keys: visible.map((purchase) => purchase.key) },
    deps.inbound(orgId),
  );

  const located: Located[] = visible.map((purchase, at) => {
    const found = answer.entries[at]!;
    // The sheet's Ordered / Imported columns ride the entry's facts — a purchase found nowhere still has its dates.
    const entry: NavLocateEntry = {
      ...found,
      facts: { ...(found.facts ?? purchaseOnlyFacts(purchase)), orderedOn: purchase.orderedOn, importedAt: purchase.importedAt },
    };
    const unboxedBy = entry.facts?.unboxedBy;
    return {
      purchase,
      entry,
      vendor: entry.facts?.vendor ?? purchase.vendor,
      unboxedBy: unboxedBy?.id ? { id: unboxedBy.id, name: unboxedBy.name } : null,
    };
  });
  const facets = purchasesFacets(located, query);
  const kept = located.filter((row) => keeps(row, query));
  const counts = new Map<string, number>();
  for (const row of kept) for (const id of row.entry.buckets) counts.set(id, (counts.get(id) ?? 0) + 1);
  const buckets: NavLocateBucket[] = answer.buckets.map((bucket) => ({ ...bucket, count: counts.get(bucket.id) ?? 0 }));
  const entries = sortLocated(
    query.status === undefined ? kept : kept.filter((row) => row.entry.buckets.includes(query.status!)),
    query.sort,
    query.dir,
  ).map((row) => row.entry);

  return { ok: true, body: { locator: 'inbound', buckets, entries, total: entries.length, facets } };
}
