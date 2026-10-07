/**
 * Fulfillment › Fulfilled (`GET /api/nav/fulfilled`) — every shipped order in
 * a window, read the way the pasted list reads a number: one entry per
 * channel order number (`grain=order`, every line combined) or per order line
 * (`grain=line`), ref = the channel order #, exactly ONE bucket
 * (`FULFILLED_BUCKETS`), its record and the shared outbound facts
 * (`outboundFacts`, extended with the sheet's own).
 *
 * Reads: ONE set-based statement (`./sql.ts`, `tenantQueryOneTrip`) — window
 * and Find are in it — and, beside it, the org's carrier sync health
 * (`syncHealth`). Each package's carrier bucket is decided once
 * (`./bucket.ts`); a line / order is delivered only when every package is,
 * else the precedence over its packages. The order's check-in then gives the
 * JOURNEY stage the row is painted with, and its clock (`./journey.ts`).
 * Channel / carrier / packer / scan source are the row's own facts, so they
 * filter the grouped entries here, and each facet counts with every OTHER
 * filter applied. Bucket counts ignore `status`; entries honour it.
 */

import {
  NAV_FULFILLED_WIRE_DEFAULTS,
  type NavFulfilledFacets,
  type NavFulfilledSyncHealth,
  type NavFulfilledWire,
  type NavLocateBucket,
  type NavLocateEntry,
  type NavLocateFacts,
} from '@/lib/nav/context/schema';
import { fulfilledGroupBucket, firstCarrierScanAt, fulfilledPackageBucket } from '@/lib/nav/fulfilled/bucket';
import { journeyClock, journeyStage } from '@/lib/nav/fulfilled/journey';
import type { FulfilledPackageRow, FulfilledWindow } from '@/lib/nav/fulfilled/sql';
import { FULFILLED_BUCKET_IDS, FULFILLED_BUCKETS, type FulfilledBucketId } from '@/lib/nav/locate/bucket-precedence';
import { outboundFacts, type OutboundFulfilledFacts } from '@/lib/nav/locate/outbound-facts';
import {
  FULFILLED_DEFAULT_WINDOW_DAYS,
  FULFILLED_SCAN_LABEL,
  FULFILLED_STATUS_PARAM,
  type FulfilledScan,
  type FulfilledSort,
} from '@/lib/outbound/fulfilled-params';
import { recordDetailsHref } from '@/lib/records/record-details';
import { NavFulfilledQuery } from '@/lib/schemas/nav';
import { carrierClaimWindow } from '@/lib/shipping/carrier-pickup-window';
import { carrierStatusLabel } from '@/lib/status/record-status';
import { SHIPPING_SHIPPED_PATH } from '@/lib/shipping/shipped-desk';
import { sourcePlatformMeta } from '@/lib/source-platform';
import type { OrgId } from '@/lib/tenancy/constants';
import { addDaysToDateKey, warehouseDayUtcBounds } from '@/utils/date';

/** `/fulfilled`'s own gate — the Shipped list's (`/api/packerlogs`, the outbound locator's Shipped bucket). */
export const NAV_FULFILLED_PERMISSION = 'packing.view';

/** What the read reaches outside itself — the database read is `navFulfilledDeps` (`./read.ts`), passed by the route. */
export interface NavFulfilledDeps {
  /** The enumeration statement (`buildFulfilledSql`), one round trip. */
  rows(orgId: OrgId, window: FulfilledWindow, q: string | null): Promise<FulfilledPackageRow[]>;
  /** Today's PT civil day (`YYYY-MM-DD`). */
  today(): string;
  now(): Date;
  /** Carrier sync health for the org (`carrierSyncHealth`), read beside the rows; null when that read failed. */
  syncHealth?(orgId: OrgId): Promise<NavFulfilledSyncHealth['carriers'] | null>;
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

/** One sheet row (an order or a line) with the attributes its filters and sorts read. */
export interface Located {
  entry: NavLocateEntry & { facts: NonNullable<NavLocateEntry['facts']> };
  bucket: FulfilledBucketId;
  channel: string | null;
  carrier: string | null;
  packer: { id: number; name: string | null } | null;
  scan: FulfilledScan;
  /** The window's shipped instant: the latest hand-off. */
  handOffAt: string | null;
  shipByAt: string | null;
}

const latest = (values: ReadonlyArray<string | null>): string | null =>
  values.reduce<string | null>((best, at) => (at !== null && (best === null || Date.parse(at) > Date.parse(best)) ? at : best), null);
const earliest = (values: ReadonlyArray<string | null>): string | null =>
  values.reduce<string | null>((best, at) => (at !== null && (best === null || Date.parse(at) < Date.parse(best)) ? at : best), null);

function sumOrNull(values: ReadonlyArray<number | null>): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length > 0 ? known.reduce((a, b) => a + b, 0) : null;
}

/** Distinct non-empty values joined in first-seen order (an order's lines combined). */
function joined(values: ReadonlyArray<string | null>): string | null {
  const distinct = [...new Set(values.filter((value): value is string => !!value))];
  return distinct.length > 0 ? distinct.join(' · ') : null;
}

/** The channel's face: the catalog account's label (`USAV`), else the platform registry's name, else the stored key. Records reads it too. */
export function channelLabel(channel: string, accountLabel: string | null): string {
  if (accountLabel) return accountLabel;
  if (channel === 'fba') return 'Amazon FBA';
  const meta = sourcePlatformMeta(channel);
  return meta.value ? meta.label : channel;
}

/** The carrier's fault, so a lost-package claim may apply (Tracking stale is ours: we stopped asking). */
const CLAIM_BUCKETS: Readonly<Partial<Record<FulfilledBucketId, true>>> = { no_movement: true, stalled: true, exception: true, late: true };
const DAY_MS = 86_400_000;
/** A poll error's face: its first line, at most this long (the hover says why polling fails, not the response body). */
const POLL_ERROR_CHARS = 80;

/**
 * One row of the sheet from its order lines' package rows (one line at
 * `grain=line`; every line of the order number at `grain=order`).
 */
function locate(rows: readonly FulfilledPackageRow[], key: string | undefined, now: Date): Located {
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
  // The package the row's carrier status speaks for: the one holding that bucket, latest hand-off first.
  const lead =
    boxes
      .filter((box) => box.bucket === carrierBucket)
      .sort((a, b) => Date.parse(b.pkg.handOffAt ?? '') - Date.parse(a.pkg.handOffAt ?? '') || 0)[0]?.pkg ??
    boxes[0]?.pkg ??
    null;

  const scanned = boxes.filter((box) => box.pkg.scannedAt !== null);
  const lastScan = scanned.reduce<FulfilledPackageRow | null>(
    (best, { pkg }) => (best === null || Date.parse(pkg.scannedAt!) > Date.parse(best.scannedAt!) ? pkg : best),
    null,
  );
  // Backfill marks the shown scan-out instant (the latest) when it was backdated (`scanOutBackdated`).
  const scan: FulfilledScan = lastScan === null ? 'none' : lastScan.scanBackdated ? 'backfill' : 'live';
  const handOffAt = latest(boxes.map((box) => box.pkg.handOffAt));
  const shipByAt = earliest(lineRows.map((line) => line.shipByAt));
  const shipByDate = lineRows.find((line) => line.shipByAt === shipByAt)?.shipByDate ?? null;
  const packerLine = lineRows.find((line) => line.packerId !== null || line.packerName !== null) ?? null;
  // The order's pick finished with its last-picked line.
  const pickedAt = latest(lineRows.map((line) => (line.pickedBy ? line.pickedAt : null)));
  const pickLine = lineRows.find((line) => line.pickedBy !== null && line.pickedAt === pickedAt) ?? null;
  const deliveredAt = carrierBucket === 'delivered' ? latest(boxes.map((box) => box.pkg.deliveredAt)) : (lead?.deliveredAt ?? null);
  const firstScanAt = lead ? firstCarrierScanAt(lead) : null;
  const leadHandOff = lead?.handOffAt ?? null;
  const transitFrom = firstScanAt ?? leadHandOff;
  const transitTo = deliveredAt ?? (firstScanAt ? now.toISOString() : null);
  const trackings = boxes.map((box) => box.pkg.tracking).filter((tracking): tracking is string => !!tracking);

  const fulfilled: OutboundFulfilledFacts = {
    channel: head.channel ? channelLabel(head.channel, head.channelAccountLabel) : null,
    customer: joined(lineRows.map((line) => line.customer)),
    qty: sumOrNull(lineRows.map((line) => line.qty)),
    orderTotal: sumOrNull(lineRows.map((line) => line.saleAmount)),
    orderedAt: earliest(lineRows.map((line) => line.orderedAt)),
    scannedOutBy: lastScan && (lastScan.scannedById || lastScan.scannedByName) ? { id: lastScan.scannedById, name: lastScan.scannedByName } : null,
    scanSource: scan === 'none' ? null : scan,
    carrier: lead?.carrier ?? null,
    service: lead?.service ?? null,
    labelCreatedAt: lead?.labelCreatedAt ?? null,
    labelCost: sumOrNull(boxes.map((box) => box.pkg.labelCost)),
    firstScanAt,
    lastEvent:
      lead && (lead.statusLabel || lead.latestEventAt)
        ? {
            label: lead.statusLabel,
            at: lead.latestEventAt,
            status: carrierStatusLabel(lead.category),
          }
        : null,
    lastEventPlace: lead?.lastEventPlace ?? null,
    eta: lead?.estimatedDeliveryAt ?? null,
    attempts: lead ? lead.attempts : null,
    exceptionCode: lead?.exceptionCode ?? null,
    // The error's first line (`USPS auth failed: 401`), not the carrier's whole response body. An
    // Untracked row's carrier is not polled at all, so a stale poll error there says nothing new.
    lastPoll:
      lead && carrierBucket !== 'untracked' && (lead.lastCheckedAt || lead.lastError)
        ? { at: lead.lastCheckedAt, error: lead.lastError?.split('\n')[0]!.trim().slice(0, POLL_ERROR_CHARS) || null }
        : null,
    packages: boxes.length,
    trackings: trackings.length > 1 ? trackings : null,
    returnRef: joined(lineRows.map((line) => line.returnRef)),
    shipstationStatus: head.shipstationStatus,
    transitDays: transitFrom && transitTo ? Math.max(0, Math.round(((Date.parse(transitTo) - Date.parse(transitFrom)) / DAY_MS) * 10) / 10) : null,
    claim: CLAIM_BUCKETS[carrierBucket] && lead && leadHandOff ? carrierClaimWindow(lead.carrier, new Date(leadHandOff), lead.service) : null,
    // Only when lines were combined (the sheet paints "+N").
    lineCount: lineRows.length > 1 ? lineRows.length : null,
  };
  const facts = {
    ...outboundFacts(
      {
        // The first line's; the sheet adds "+N" from `lineCount`.
        fact_title: head.title,
        sku: head.sku,
        tracking_number: lead?.tracking ?? null,
        delivered_at: deliveredAt,
        status: head.channelStatus,
        ship_by_date: shipByDate,
        picked_at: pickLine?.pickedAt ?? null,
        picked_by: pickLine?.pickedBy?.id ?? null,
        picked_by_name: pickLine?.pickedBy?.name ?? null,
        picked_source: pickLine?.pickedBy?.source ?? null,
        packed_at: latest(lineRows.map((line) => line.packedAt)),
        packer_id: packerLine?.packerId ?? null,
        packer_name: packerLine?.packerName ?? null,
        shipped_at: lastScan?.scannedAt ?? null,
      },
      lineRows.length,
      fulfilled,
    ),
    shipmentId: lead?.shipmentId ?? null,
    promisedAt: lead?.promisedAt ?? null,
    clock: journeyClock(bucket, { lead, deliveredAt, checkIn }),
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
  } satisfies NavLocateFacts;
  return {
    entry: {
      key,
      ref: head.orderId ?? head.orderKey,
      buckets: [bucket],
      // The item is `facts.title`, the carrier's words `facts.lastEvent` — never sent twice.
      title: null,
      detail: null,
      recordHref: head.orderRowId > 0
        ? recordDetailsHref({ kind: 'order', orderId: head.orderRowId, shipped: true })
        : null,
      facts,
    },
    bucket,
    channel: head.channel,
    carrier: lead?.carrier ?? null,
    packer: packerLine?.packerId ? { id: packerLine.packerId, name: packerLine.packerName } : null,
    scan,
    handOffAt,
    shipByAt,
  };
}

/** The statement's rows → one {@link Located} per line or per order number, in first-seen order. */
export function groupFulfilled(rows: readonly FulfilledPackageRow[], grain: 'order' | 'line', now: Date): Located[] {
  const groups = new Map<string, FulfilledPackageRow[]>();
  for (const row of rows) {
    const key = grain === 'line' ? `line:${row.orderRowId}` : row.orderKey;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  // An order number is its own row key; a line needs one (its `ref` repeats across the order's lines).
  return [...groups].map(([key, group]) => locate(group, grain === 'line' ? key : undefined, now));
}

type SortValue = string | number | null;

const instant = (at: string | null | undefined): number | null => (at ? Date.parse(at) : null);

/** Each sort's key (null sorts last either way) and its direction when `dir` is absent. */
const SORTS: Readonly<Record<FulfilledSort, { key: (row: Located) => SortValue; dir: 'asc' | 'desc' }>> = {
  shipped: { key: (row) => instant(row.handOffAt), dir: 'desc' },
  delivered: { key: (row) => instant(row.entry.facts.deliveredAt), dir: 'desc' },
  ordered: { key: (row) => instant(row.entry.facts.orderedAt), dir: 'desc' },
  shipBy: { key: (row) => instant(row.shipByAt), dir: 'desc' },
  order: { key: (row) => row.entry.ref, dir: 'asc' },
  channel: { key: (row) => row.entry.facts.channel ?? null, dir: 'asc' },
  carrier: { key: (row) => row.carrier, dir: 'asc' },
  status: { key: (row) => FULFILLED_BUCKET_IDS.indexOf(row.bucket), dir: 'asc' },
  packer: { key: (row) => row.entry.facts.packer?.name ?? null, dir: 'asc' },
  item: { key: (row) => row.entry.facts.title, dir: 'asc' },
  lastEvent: { key: (row) => instant(row.entry.facts.lastEvent?.at), dir: 'desc' },
};

const TEXT_ORDER = new Intl.Collator('en-US', { numeric: true, sensitivity: 'base' });

/** Sorted by `sort` / `dir`, nulls last; ties fall to the latest hand-off, then the number. */
export function sortFulfilled(rows: readonly Located[], sort: FulfilledSort, dir: 'asc' | 'desc' | undefined): Located[] {
  const { key } = SORTS[sort];
  const sign = (dir ?? SORTS[sort].dir) === 'asc' ? 1 : -1;
  return rows
    .map((row) => ({ row, value: key(row), handOff: instant(row.handOffAt) }))
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
      if (a.handOff !== b.handOff) {
        if (a.handOff === null) return 1;
        if (b.handOff === null) return -1;
        return b.handOff - a.handOff;
      }
      return TEXT_ORDER.compare(a.row.entry.ref, b.row.entry.ref);
    })
    .map(({ row }) => row);
}

type FulfilledFilter = 'channel' | 'carrier' | 'packer' | 'scan';

/** The row passes the query's channel / carrier / packer / scan filters, `except` one (its own facet counts without it). */
function keeps(row: Located, query: NavFulfilledQuery, except?: FulfilledFilter): boolean {
  return (
    (except === 'channel' || query.channel === undefined || row.channel === query.channel) &&
    (except === 'carrier' || query.carrier === undefined || row.carrier === query.carrier) &&
    (except === 'packer' || query.packer === undefined || row.packer?.id === query.packer) &&
    (except === 'scan' || query.scan === undefined || row.scan === query.scan)
  );
}

/** Each facet over the rows every OTHER filter keeps; most first, then by label. */
export function countFulfilledFacets(rows: readonly Located[], query: NavFulfilledQuery): NavFulfilledFacets {
  const channels = new Map<string, { value: string; label: string; count: number }>();
  const carriers = new Map<string, { value: string; label: string; count: number }>();
  const scans = new Map<string, { value: string; label: string; count: number }>();
  const packers = new Map<number, { id: number; name: string | null; count: number }>();
  const tally = (map: Map<string, { value: string; label: string; count: number }>, value: string, label: string) => {
    const option = map.get(value) ?? { value, label, count: 0 };
    option.count += 1;
    map.set(value, option);
  };
  for (const row of rows) {
    if (row.channel && keeps(row, query, 'channel')) tally(channels, row.channel, row.entry.facts.channel ?? row.channel);
    if (row.carrier && keeps(row, query, 'carrier')) tally(carriers, row.carrier, row.carrier);
    if (keeps(row, query, 'scan')) tally(scans, row.scan, FULFILLED_SCAN_LABEL[row.scan]);
    if (row.packer && keeps(row, query, 'packer')) {
      const option = packers.get(row.packer.id) ?? { ...row.packer, count: 0 };
      option.count += 1;
      packers.set(row.packer.id, option);
    }
  }
  const mostFirst = <T extends { count: number }>(values: Iterable<T>, label: (value: T) => string): T[] =>
    [...values].sort((a, b) => b.count - a.count || TEXT_ORDER.compare(label(a), label(b)));
  return {
    channels: mostFirst(channels.values(), (option) => option.label),
    carriers: mostFirst(carriers.values(), (option) => option.label),
    packers: mostFirst(packers.values(), (option) => option.name ?? ''),
    scans: mostFirst(scans.values(), (option) => option.label),
  };
}

export async function getNavFulfilled(
  caller: { orgId: OrgId; permissions: ReadonlySet<string> },
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
  const [rows, syncCarriers] = await Promise.all([
    deps.rows(caller.orgId, fulfilledWindow(query, deps.today()), query.q?.trim() || null),
    deps.syncHealth?.(caller.orgId) ?? null,
  ]);
  const located = groupFulfilled(rows, query.grain, deps.now());

  const facets = countFulfilledFacets(located, query);
  const kept = located.filter((row) => keeps(row, query));
  const counts = new Map<FulfilledBucketId, number>();
  for (const row of kept) counts.set(row.bucket, (counts.get(row.bucket) ?? 0) + 1);
  const buckets: NavLocateBucket[] = FULFILLED_BUCKETS.map((bucket) => ({
    id: bucket.id,
    label: bucket.label,
    tone: bucket.tone,
    href: `${SHIPPING_SHIPPED_PATH}?${new URLSearchParams({ [FULFILLED_STATUS_PARAM]: bucket.id })}`,
    count: counts.get(bucket.id) ?? 0,
  }));
  const entries = sortFulfilled(
    query.status === undefined ? kept : kept.filter((row) => row.bucket === query.status),
    query.sort,
    query.dir,
  ).map((row) => wireEntry(row.entry));

  return {
    ok: true,
    body: {
      locator: 'outbound',
      buckets,
      entries,
      total: entries.length,
      facets,
      ...(syncCarriers ? { syncHealth: { carriers: syncCarriers } } : {}),
    },
  };
}

type WireEntry = NavFulfilledWire['entries'][number];

const WIRE_DEFAULT: Readonly<Record<string, unknown>> = NAV_FULFILLED_WIRE_DEFAULTS;

/**
 * An entry as it travels: every null left out, and every fact holding its
 * `NAV_FULFILLED_WIRE_DEFAULTS` value — `NavFulfilledResponseSchema` restores
 * both on parse. A defaulted fact that differs (null included) is sent.
 */
function wireEntry(entry: Located['entry']): WireEntry {
  const facts: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(entry.facts)) {
    if (value === undefined) continue;
    if (Object.hasOwn(WIRE_DEFAULT, name)) {
      const fallback = WIRE_DEFAULT[name];
      const same = Array.isArray(fallback) ? Array.isArray(value) && value.length === 0 : value === fallback;
      if (!same) facts[name] = value;
    } else if (value !== null) {
      facts[name] = value;
    }
  }
  return {
    ...(entry.key ? { key: entry.key } : null),
    ref: entry.ref,
    buckets: entry.buckets,
    ...(entry.recordHref ? { recordHref: entry.recordHref } : null),
    facts: facts as NonNullable<WireEntry['facts']>,
  };
}
