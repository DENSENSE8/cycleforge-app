/**
 * Fulfillment › Fulfilled (`GET /api/nav/fulfilled`) — every shipped order in
 * a window, answered as the Records sheet's LINES (operator 2026-10-07:
 * Fulfilled renders exactly as a pasted list does).
 *
 * Two statements, each the one way of what it decides:
 * - the Fulfilled enumeration (`./sql.ts`) decides WHICH orders shipped in
 *   the window (dock scan-out or channel-shipped; a scan-out no order owns
 *   is its own row) and each order's JOURNEY — its packages' buckets
 *   (`./bucket.ts`), the order's one bucket, its check-in stage and clock
 *   (`./journey.ts`), and the label / poll / claim facts the journey reads;
 * - the Records statement (`buildRecordsSql` with `orderIds`) gives every
 *   kept line its Records facts through `locateRecordLine` — the same
 *   Internal | External status, prices, staff and identifiers `/records`
 *   paints — and each line then carries its order's journey.
 *
 * Platform / carrier / packer / scan source filter ORDERS here, each facet
 * counted with every OTHER filter applied; bucket counts are orders too.
 * Lines sort by the Records sorter (`sortRecords`), the journey's own sorts
 * included; an order's lines fold under it on the client (the Records grain).
 */

import type { NavFulfilledFacets, NavFulfilledSyncHealth, NavFulfilledWire, NavLocateBucket, NavLocateFacts } from '@/lib/nav/context/schema';
import { fulfilledGroupBucket, firstCarrierScanAt, fulfilledPackageBucket } from '@/lib/nav/fulfilled/bucket';
import { journeyClock, journeyStage } from '@/lib/nav/fulfilled/journey';
import type { FulfilledPackageRow, FulfilledWindow } from '@/lib/nav/fulfilled/sql';
import { FULFILLED_BUCKETS, type FulfilledBucketId } from '@/lib/nav/locate/bucket-precedence';
import { channelLabel, locateRecordLine, recordsWireEntry, sortRecords, type Located } from '@/lib/nav/records/service';
import type { RecordLineRow } from '@/lib/nav/records/sql';
import {
  FULFILLED_COLUMN_PARAM,
  FULFILLED_DEFAULT_WINDOW_DAYS,
  FULFILLED_LAYOUT_PARAM,
  FULFILLED_SCAN_LABEL,
  type FulfilledScan,
} from '@/lib/outbound/fulfilled-params';
import { RECORDS_SORT_DIR } from '@/lib/nav/records/params';
import { NavFulfilledQuery } from '@/lib/schemas/nav';
import { carrierClaimWindow } from '@/lib/shipping/carrier-pickup-window';
import { SHIPPING_SHIPPED_PATH } from '@/lib/shipping/shipped-desk';
import type { OrgId } from '@/lib/tenancy/constants';
import { addDaysToDateKey, warehouseDayUtcBounds } from '@/utils/date';

/** `/fulfilled`'s own gate — the Shipped list's (`/api/packerlogs`, the outbound locator's Shipped bucket). */
export const NAV_FULFILLED_PERMISSION = 'packing.view';

/** What the read reaches outside itself — the database read is `navFulfilledDeps` (`./read.ts`), passed by the route. */
export interface NavFulfilledDeps {
  /** The enumeration statement (`buildFulfilledSql`), one round trip. */
  rows(orgId: OrgId, window: FulfilledWindow, q: string | null): Promise<FulfilledPackageRow[]>;
  /**
   * The Records lines of exactly these orders' lines (`buildRecordsSql` with `orderIds`), one round trip.
   * Absent = counts only (the sidebar's facet read): buckets and facets, no entries.
   */
  recordLines?(orgId: OrgId, orderIds: readonly number[], viewerStaffId: number | null): Promise<RecordLineRow[]>;
  /** Today's PT civil day (`YYYY-MM-DD`). */
  today(): string;
  now(): Date;
  /** Carrier sync health for the org (`carrierSyncHealth`), read beside the rows; null when that read failed. */
  syncHealth?(orgId: OrgId): Promise<NavFulfilledSyncHealth['carriers'] | null>;
  /** The order lines (`orders.id`) on which `viewerStaffId` holds an unread @mention. Read after the window is cut. */
  mentions?(orgId: OrgId, orderRowIds: readonly number[], viewerStaffId: number): Promise<ReadonlySet<number>>;
}

export type NavFulfilledResult =
  | { ok: true; body: NavFulfilledWire }
  | { ok: false; status: 403; error: 'FORBIDDEN'; permission: string }
  | { ok: false; status: 400; error: 'BAD_REQUEST'; message: string };

/**
 * The query's window as instants. Neither bound = the last
 * {@link FULFILLED_DEFAULT_WINDOW_DAYS} PT days; `from=all` = no lower bound.
 * Days are PT civil days, inclusive: from the start of `from` to the start of
 * the day after `to` (exclusive).
 */
export function fulfilledWindow(query: Pick<NavFulfilledQuery, 'axis' | 'from' | 'to'>, today: string): FulfilledWindow {
  const unset = query.from === undefined && query.to === undefined;
  const fromDay = unset ? addDaysToDateKey(today, 1 - FULFILLED_DEFAULT_WINDOW_DAYS) : query.from === 'all' ? null : (query.from ?? null);
  const toDay = unset ? today : (query.to ?? null);
  return {
    axis: query.axis,
    fromAt: fromDay ? (warehouseDayUtcBounds(fromDay)?.startIso ?? null) : null,
    toBefore: toDay ? (warehouseDayUtcBounds(addDaysToDateKey(toDay, 1))?.startIso ?? null) : null,
  };
}

/** What only the journey knows — every line of the order carries it. */
export type JourneyFacts = Required<
  Pick<
    NavLocateFacts,
    | 'journey'
    | 'clock'
    | 'checkIn'
    | 'promisedAt'
    | 'scanSource'
    | 'labelCreatedAt'
    | 'labelCost'
    | 'firstScanAt'
    | 'transitDays'
    | 'attempts'
    | 'exceptionCode'
    | 'claim'
    | 'lastPoll'
    | 'shipstationStatus'
    | 'returnRef'
  >
>;

/** One shipped ORDER: its journey and what its filters read. */
export interface FulfilledOrder {
  key: string;
  bucket: FulfilledBucketId;
  journey: JourneyFacts;
  /** Canonical `account_source` (the platform facet's value). */
  platform: string | null;
  platformLabel: string | null;
  carrier: string | null;
  packer: { id: number; name: string | null } | null;
  scan: FulfilledScan;
  /** Over its clock's limit, in ms (negative = time left); null = the bucket has no limit. The Records `overdue` sort reads it. */
  overdueMs: number | null;
  /** The order's lines (`orders.id`); empty for a scan-out no order owns. */
  orderRowIds: number[];
  /** A scan-out no order owns: its one package row (it has no Records line). */
  orphan: FulfilledPackageRow | null;
}

const latest = (values: ReadonlyArray<string | null>): string | null =>
  values.reduce<string | null>((best, at) => (at !== null && (best === null || Date.parse(at) > Date.parse(best)) ? at : best), null);

/** Distinct non-empty values joined in first-seen order (an order's lines combined). */
function joined(values: ReadonlyArray<string | null>): string | null {
  const distinct = [...new Set(values.filter((value): value is string => !!value))];
  return distinct.length > 0 ? distinct.join(' · ') : null;
}

/** The carrier's fault, so a lost-package claim may apply (Tracking stale is ours: we stopped asking). */
const CLAIM_BUCKETS: Readonly<Partial<Record<FulfilledBucketId, true>>> = { no_movement: true, stalled: true, exception: true, late: true };
const DAY_MS = 86_400_000;
/** A poll error's face: its first line, at most this long (the hover says why polling fails, not the response body). */
const POLL_ERROR_CHARS = 80;

/** One order from its lines' package rows: the journey (bucket, clock, check-in) and the label / poll / claim facts of its lead package. */
function journeyOf(rows: readonly FulfilledPackageRow[], now: Date): FulfilledOrder {
  const lines = new Map<number, FulfilledPackageRow>();
  const packages = new Map<number, { pkg: FulfilledPackageRow; bucket: FulfilledBucketId }>();
  for (const row of rows) {
    if (!lines.has(row.orderRowId)) lines.set(row.orderRowId, row);
    if (row.shipmentId !== null && !packages.has(row.shipmentId)) {
      packages.set(row.shipmentId, { pkg: row, bucket: fulfilledPackageBucket(row, now) });
    }
  }
  const lineRows = [...lines.values()];
  const head = lineRows[0]!;
  const boxes = [...packages.values()];
  const carrierBucket = fulfilledGroupBucket(boxes.map((box) => box.bucket));
  const checkIn = lineRows.find((line) => line.checkIn !== null)?.checkIn ?? null;
  const bucket = journeyStage(carrierBucket, checkIn);
  // The package the journey speaks for: the one holding that bucket, latest hand-off first.
  const lead =
    boxes
      .filter((box) => box.bucket === carrierBucket)
      .sort((a, b) => Date.parse(b.pkg.handOffAt ?? '') - Date.parse(a.pkg.handOffAt ?? '') || 0)[0]?.pkg ??
    boxes[0]?.pkg ??
    null;
  const lastScan = boxes
    .filter((box) => box.pkg.scannedAt !== null)
    .reduce<FulfilledPackageRow | null>((best, { pkg }) => (best === null || Date.parse(pkg.scannedAt!) > Date.parse(best.scannedAt!) ? pkg : best), null);
  // Backfill marks the shown scan-out instant (the latest) when it was backdated (`scanOutBackdated`).
  const scan: FulfilledScan = lastScan === null ? 'none' : lastScan.scanBackdated ? 'backfill' : 'live';
  const deliveredAt = carrierBucket === 'delivered' ? latest(boxes.map((box) => box.pkg.deliveredAt)) : (lead?.deliveredAt ?? null);
  const firstScanAt = lead ? firstCarrierScanAt(lead) : null;
  const leadHandOff = lead?.handOffAt ?? null;
  const transitFrom = firstScanAt ?? leadHandOff;
  const transitTo = deliveredAt ?? (firstScanAt ? now.toISOString() : null);
  const labelCosts = boxes.flatMap((box) => (box.pkg.labelCost !== null ? [box.pkg.labelCost] : []));
  const clock = journeyClock(bucket, { lead, deliveredAt, checkIn });
  const packerLine = lineRows.find((line) => line.packerId !== null) ?? null;
  return {
    key: head.orderKey,
    bucket,
    journey: {
      journey: bucket,
      clock,
      checkIn: checkIn
        ? {
            state: checkIn.state,
            supportItemId: checkIn.supportItemId,
            dueAt: checkIn.dueAt,
            contactedAt: checkIn.contactedAt,
            nextFollowUpAt: checkIn.nextFollowUpAt,
            repliedAt: checkIn.repliedAt,
            closedAt: checkIn.closedAt,
            outcome: checkIn.outcome,
          }
        : null,
      promisedAt: lead?.promisedAt ?? null,
      scanSource: scan === 'none' ? null : scan,
      labelCreatedAt: lead?.labelCreatedAt ?? null,
      labelCost: labelCosts.length > 0 ? labelCosts.reduce((a, b) => a + b, 0) : null,
      firstScanAt,
      transitDays: transitFrom && transitTo ? Math.max(0, Math.round(((Date.parse(transitTo) - Date.parse(transitFrom)) / DAY_MS) * 10) / 10) : null,
      attempts: lead ? lead.attempts : null,
      exceptionCode: lead?.exceptionCode ?? null,
      claim: CLAIM_BUCKETS[carrierBucket] && lead && leadHandOff ? carrierClaimWindow(lead.carrier, new Date(leadHandOff), lead.service) : null,
      // The error's first line (`USPS auth failed: 401`), not the carrier's whole response body. An
      // Untracked order's carrier is not polled at all, so a stale poll error there says nothing new.
      lastPoll:
        lead && carrierBucket !== 'untracked' && (lead.lastCheckedAt || lead.lastError)
          ? { at: lead.lastCheckedAt, error: lead.lastError?.split('\n')[0]!.trim().slice(0, POLL_ERROR_CHARS) || null }
          : null,
      shipstationStatus: head.shipstationStatus,
      returnRef: joined(lineRows.map((line) => line.returnRef)),
    },
    platform: head.channel,
    platformLabel: head.channel ? channelLabel(head.channel, head.channelAccountLabel) : null,
    carrier: lead?.carrier ?? null,
    packer: packerLine?.packerId ? { id: packerLine.packerId, name: packerLine.packerName } : null,
    scan,
    overdueMs: clock?.due ? now.getTime() - Date.parse(clock.due) : null,
    orderRowIds: lineRows.flatMap((line) => (line.orderRowId > 0 ? [line.orderRowId] : [])),
    orphan: head.orderRowId > 0 ? null : head,
  };
}

/** The statement's rows → one {@link FulfilledOrder} per order key, in first-seen order. */
export function groupFulfilledOrders(rows: readonly FulfilledPackageRow[], now: Date): FulfilledOrder[] {
  const groups = new Map<string, FulfilledPackageRow[]>();
  for (const row of rows) {
    const group = groups.get(row.orderKey);
    if (group) group.push(row);
    else groups.set(row.orderKey, [row]);
  }
  return [...groups.values()].map((group) => journeyOf(group, now));
}

type FulfilledFilter = 'platform' | 'carrier' | 'packer' | 'scan';

/** The order passes the query's platform / carrier / packer / scan filters, `except` one (its own facet counts without it). */
function keeps(order: FulfilledOrder, query: NavFulfilledQuery, except?: FulfilledFilter): boolean {
  return (
    (except === 'platform' || query.platform === undefined || order.platform === query.platform) &&
    (except === 'carrier' || query.carrier === undefined || order.carrier === query.carrier) &&
    (except === 'packer' || query.packer === undefined || order.packer?.id === query.packer) &&
    (except === 'scan' || query.scan === undefined || order.scan === query.scan)
  );
}

const TEXT_ORDER = new Intl.Collator('en-US', { numeric: true, sensitivity: 'base' });

/** Each facet over the orders every OTHER filter keeps; most first, then by label. */
export function countFulfilledFacets(orders: readonly FulfilledOrder[], query: NavFulfilledQuery): NavFulfilledFacets {
  const platforms = new Map<string, { value: string; label: string; count: number }>();
  const carriers = new Map<string, { value: string; label: string; count: number }>();
  const scans = new Map<string, { value: string; label: string; count: number }>();
  const packers = new Map<number, { id: number; name: string | null; count: number }>();
  const tally = (map: Map<string, { value: string; label: string; count: number }>, value: string, label: string) => {
    const option = map.get(value) ?? { value, label, count: 0 };
    option.count += 1;
    map.set(value, option);
  };
  for (const order of orders) {
    if (order.platform && keeps(order, query, 'platform')) tally(platforms, order.platform, order.platformLabel ?? order.platform);
    if (order.carrier && keeps(order, query, 'carrier')) tally(carriers, order.carrier, order.carrier);
    if (keeps(order, query, 'scan')) tally(scans, order.scan, FULFILLED_SCAN_LABEL[order.scan]);
    if (order.packer && keeps(order, query, 'packer')) {
      const option = packers.get(order.packer.id) ?? { ...order.packer, count: 0 };
      option.count += 1;
      packers.set(order.packer.id, option);
    }
  }
  const mostFirst = <T extends { count: number }>(values: Iterable<T>, label: (value: T) => string): T[] =>
    [...values].sort((a, b) => b.count - a.count || TEXT_ORDER.compare(label(a), label(b)));
  return {
    platforms: mostFirst(platforms.values(), (option) => option.label),
    carriers: mostFirst(carriers.values(), (option) => option.label),
    packers: mostFirst(packers.values(), (option) => option.name ?? ''),
    scans: mostFirst(scans.values(), (option) => option.label),
  };
}

/**
 * A scan-out no order owns, as a Records line: its one package, scanned out
 * by its staffer. It names no order line, so it carries no write target
 * (`recordId`) and opens no order record — its package is its record.
 */
function orphanLine(pkg: FulfilledPackageRow): RecordLineRow {
  const scannedBy = pkg.scannedById !== null || pkg.scannedByName !== null ? { id: pkg.scannedById, name: pkg.scannedByName } : null;
  return {
    direction: 'outbound',
    recordId: 0,
    orderNumber: null,
    orderKey: pkg.orderKey,
    itemNumber: null,
    skuCatalogId: null,
    title: null,
    sku: null,
    qty: null,
    unitPrice: null,
    lineTotal: null,
    orderTotal: null,
    orderTotalSource: null,
    orderLines: 1,
    platform: null,
    platformAccountLabel: null,
    customer: null,
    vendor: null,
    po: null,
    channelStatus: null,
    placedAt: null,
    placedOn: null,
    importedAt: null,
    orderedAt: null,
    shipByDate: null,
    shipByAt: null,
    pickedAt: null,
    pickedBy: null,
    packedAt: null,
    packer: null,
    scannedAt: pkg.scannedAt,
    scannedBy,
    shippedAt: pkg.handOffAt,
    unboxedAt: null,
    unboxedBy: null,
    receivedAt: null,
    receivedBy: null,
    unitsReceived: null,
    unitsExpected: null,
    receivedDone: false,
    inboundOrderId: null,
    cartonId: null,
    service: pkg.service,
    packages:
      pkg.shipmentId !== null
        ? [
            {
              shipmentId: pkg.shipmentId,
              tracking: pkg.tracking,
              carrier: pkg.carrier,
              category: pkg.category,
              statusLabel: pkg.statusLabel,
              latestEventAt: pkg.latestEventAt,
              eta: pkg.estimatedDeliveryAt,
              deliveredAt: pkg.isDelivered ? pkg.deliveredAt : null,
              place: pkg.lastEventPlace,
              primary: true,
            },
          ]
        : [],
    buyerCancelled: false,
    scannedOut: pkg.scannedAt !== null,
    releaseState: null,
    outOfStock: false,
    holdFlag: false,
    packed: false,
    picked: false,
    lineStatus: null,
    workflowStatus: null,
    exceptionCode: null,
    lastNote: null,
    hasNote: false,
    owner: null,
    mine: false,
    matchedRefs: [],
  };
}

/** A Records line carrying its order's journey: the order's bucket heads `buckets`, its clock the `overdue` sort. */
function withJourney(row: Located, order: FulfilledOrder, mentionsMe: boolean): Located {
  const orphan = order.orphan !== null;
  return {
    ...row,
    overdueMs: order.overdueMs,
    entry: {
      ...row.entry,
      ...(orphan ? { key: order.key, recordHref: null } : null),
      buckets: [order.bucket],
      facts: {
        ...row.entry.facts,
        ...order.journey,
        ...(orphan ? { recordId: undefined, orderRowId: null } : null),
        ...(mentionsMe ? { mentionsMe } : null),
      },
    },
  };
}

export async function getNavFulfilled(
  caller: { orgId: OrgId; permissions: ReadonlySet<string>; staffId?: number | null },
  params: URLSearchParams,
  deps: NavFulfilledDeps,
): Promise<NavFulfilledResult> {
  if (!caller.permissions.has(NAV_FULFILLED_PERMISSION)) {
    return { ok: false, status: 403, error: 'FORBIDDEN', permission: NAV_FULFILLED_PERMISSION };
  }
  // A blank param is an unset control, never a filter.
  const raw = Object.fromEntries([...params].filter(([, value]) => value.trim() !== ''));
  const parsed = NavFulfilledQuery.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      error: 'BAD_REQUEST',
      message: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'query'}: ${issue.message}`).join('; '),
    };
  }
  const query = parsed.data;
  const viewerStaffId = caller.staffId ?? null;
  const [rows, syncCarriers] = await Promise.all([
    deps.rows(caller.orgId, fulfilledWindow(query, deps.today()), query.q?.trim() || null),
    deps.syncHealth?.(caller.orgId) ?? null,
  ]);
  const now = deps.now();
  const orders = groupFulfilledOrders(rows, now);

  const facets = countFulfilledFacets(orders, query);
  const kept = orders.filter((order) => keeps(order, query));
  const counts = new Map<FulfilledBucketId, number>();
  for (const order of kept) counts.set(order.bucket, (counts.get(order.bucket) ?? 0) + 1);
  const buckets: NavLocateBucket[] = FULFILLED_BUCKETS.map((bucket) => ({
    id: bucket.id,
    label: bucket.label,
    tone: bucket.tone,
    href: `${SHIPPING_SHIPPED_PATH}?${new URLSearchParams({ [FULFILLED_COLUMN_PARAM]: bucket.id, [FULFILLED_LAYOUT_PARAM]: 'sheet' })}`,
    count: counts.get(bucket.id) ?? 0,
  }));

  // Every kept order's lines, as Records lines (the one place their facts are made), then its journey.
  const sorted = deps.recordLines ? await fulfilledLines(caller.orgId, kept, query, viewerStaffId, now.getTime(), deps.recordLines, deps.mentions) : [];

  return {
    ok: true,
    body: {
      locator: 'outbound',
      buckets,
      entries: sorted.map((row) => recordsWireEntry(row.entry)),
      total: kept.length,
      facets,
      ...(syncCarriers ? { syncHealth: { carriers: syncCarriers } } : {}),
    },
  };
}

/** The kept orders' lines — Records lines with their order's journey — in the query's Records sort. */
async function fulfilledLines(
  orgId: OrgId,
  kept: readonly FulfilledOrder[],
  query: NavFulfilledQuery,
  viewerStaffId: number | null,
  nowMs: number,
  recordLines: NonNullable<NavFulfilledDeps['recordLines']>,
  mentions: NavFulfilledDeps['mentions'],
): Promise<Located[]> {
  const orderRowIds = kept.flatMap((order) => order.orderRowIds);
  const [lineRows, mentioned] = await Promise.all([
    orderRowIds.length > 0 ? recordLines(orgId, orderRowIds, viewerStaffId) : [],
    viewerStaffId !== null && orderRowIds.length > 0 && mentions ? mentions(orgId, orderRowIds, viewerStaffId) : null,
  ]);
  const byId = new Map(lineRows.map((line) => [line.recordId, line] as const));
  const located = kept.flatMap((order): Located[] => {
    if (order.orphan) return [withJourney(locateRecordLine(orphanLine(order.orphan), nowMs), order, false)];
    const mentionsMe = order.orderRowIds.some((id) => mentioned?.has(id) ?? false);
    return order.orderRowIds.flatMap((id) => {
      const line = byId.get(id);
      return line ? [withJourney(locateRecordLine(line, nowMs), order, mentionsMe)] : [];
    });
  });
  return sortRecords(located, { sort: query.sort, dir: query.dir ?? RECORDS_SORT_DIR[query.sort], axis: query.axis, event: null, refs: [] });
}
