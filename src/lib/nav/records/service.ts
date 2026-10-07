/**
 * The Records sheet's read (`GET /api/nav/records`, `/records`;
 * docs/refactors/records/PROMPT-records-sheet.md §Phase 2): every LINE of the
 * org, inbound and outbound together, one entry each (key `out:<orders.id>` /
 * `in:<receiving_line.id>`, ref = its order number), with the facts the
 * sheet paints, its Internal | External status and its flags.
 *
 * ONE statement (`./sql.ts`) cuts by direction (the caller's permissions —
 * `orders.view` reads outbound, `receiving.view` inbound), the date window,
 * the event, Find and a pasted list. Statuses resolve here from the
 * statement's signals through `record-status.ts` (never a second ladder);
 * every facet filter (include AND exclude) applies here to the same rows,
 * and each facet counts with every OTHER facet's filter applied — so rows and
 * counts never disagree. A pasted ref no line answers becomes a `miss:`
 * entry, in paste order.
 */

import {
  NAV_RECORDS_WIRE_DEFAULTS,
  type NavLocateEntry,
  type NavLocateFacts,
  type NavRecordsFacets,
  type NavRecordsWire,
} from '@/lib/nav/context/schema';
import { channelLabel } from '@/lib/nav/fulfilled/service';
import {
  RECORDS_DEFAULT_WINDOW_DAYS,
  RECORDS_FACETS,
  RECORDS_FLAG_LABEL,
  RECORDS_FLAGS,
  RECORDS_PRICE_BANDS,
  RECORDS_REFS_PARAM,
  RECORDS_ROW_LIMIT,
  RECORDS_TYPES,
  readRecordsQuery,
  type RecordsFacetId,
  type RecordsFlag,
  type RecordsQuery,
  type RecordsSort,
} from '@/lib/nav/records/params';
import type { RecordLineRow, RecordsSqlInput } from '@/lib/nav/records/sql';
import { INBOUND_SOURCE_LABELS, isRegisteredInboundSource } from '@/lib/inbound/source-registry';
import { isExceptionHeld } from '@/lib/orders/exception-membership';
import { DELIVERED_OVERDUE_HOURS } from '@/lib/receiving/incoming-exceptions';
import { parseRefInParam } from '@/lib/receiving/reconcile';
import { resolveReceivingLineStatus } from '@/lib/receiving/workflow-stages';
import { recordDetailsHref } from '@/lib/records/record-details';
import { recordTargetKey } from '@/lib/records/sheet-actions-contract';
import { sourcePlatformMeta } from '@/lib/source-platform';
import {
  CARRIER_STATUS,
  CARRIER_STATUSES,
  INBOUND_INTERNAL_STATUS,
  INBOUND_INTERNAL_STATUSES,
  OUTBOUND_INTERNAL_STATUS,
  OUTBOUND_INTERNAL_STATUSES,
  carrierStatusOfCategory,
  leadStatus,
  resolveInboundInternalStatus,
  resolveOutboundInternalStatus,
  type CarrierStatus,
  type InboundInternalStatus,
  type OutboundInternalStatus,
} from '@/lib/status/record-status';
import type { OrgId } from '@/lib/tenancy/constants';
import { canonicalizeTrackingKey } from '@/lib/zoho/call-reduction';
import { addDaysToDateKey, warehouseDayUtcBounds } from '@/utils/date';

/** Each direction's gate — the record lists' own (`/api/orders`, `/api/receiving-lines`). Either opens the sheet. */
export const NAV_RECORDS_PERMISSION = { outbound: 'orders.view', inbound: 'receiving.view' } as const;

/** What the read reaches outside itself — the database read is `navRecordsDeps` (`./read.ts`), passed by the route. */
export interface NavRecordsDeps {
  /** The enumeration statement (`buildRecordsSql`), one round trip. */
  rows(orgId: OrgId, input: RecordsSqlInput): Promise<RecordLineRow[]>;
  /** Today's PT civil day (`YYYY-MM-DD`). */
  today(): string;
  now(): Date;
}

export type NavRecordsResult =
  | { ok: true; body: NavRecordsWire }
  | { ok: false; status: 403; error: 'FORBIDDEN'; permission: string };

export type RecordsInternalStatus = OutboundInternalStatus | InboundInternalStatus;

/** Internal status sort / facet order: the outbound walk, then the inbound walk. */
const INTERNAL_ORDER: readonly RecordsInternalStatus[] = [...OUTBOUND_INTERNAL_STATUSES, ...INBOUND_INTERNAL_STATUSES];

/** No carrier status — the External facet's value for an empty cell. */
const NO_EXTERNAL = 'none';

const TYPE_LABEL: Readonly<Record<(typeof RECORDS_TYPES)[number], string>> = { outbound: 'Outbound', inbound: 'Inbound' };

const HOUR_MS = 3_600_000;

/** Start of `day` in PT as UTC ISO; null for no day. */
function dayStart(day: string | null): string | null {
  return day ? (warehouseDayUtcBounds(day)?.startIso ?? null) : null;
}

/**
 * The query's window as instants. No `from`/`to` and no pasted list = the
 * last {@link RECORDS_DEFAULT_WINDOW_DAYS} PT days; a pasted list has no
 * window unless one is set. Days are PT civil days, inclusive.
 */
export function recordsWindow(query: Pick<RecordsQuery, 'from' | 'to' | 'refs'>, today: string): { fromAt: string | null; toBefore: string | null } {
  if (query.from === null && query.to === null) {
    if (query.refs.length > 0) return { fromAt: null, toBefore: null };
    return { fromAt: dayStart(addDaysToDateKey(today, 1 - RECORDS_DEFAULT_WINDOW_DAYS)), toBefore: dayStart(addDaysToDateKey(today, 1)) };
  }
  return { fromAt: dayStart(query.from), toBefore: query.to ? dayStart(addDaysToDateKey(query.to, 1)) : null };
}

/** One sheet row with what its filters, counts and sorts read. */
interface Located {
  line: RecordLineRow;
  entry: NavLocateEntry & { facts: NavLocateFacts };
  internal: RecordsInternalStatus;
  external: CarrierStatus | null;
  flags: RecordsFlag[];
  /** Each facet's values for the row (several for flags; none = the row holds no value there). */
  values: Readonly<Record<RecordsFacetId, readonly string[]>>;
  /** Over its time limit, in ms (negative = time left); null = no limit applies. */
  overdueMs: number | null;
}

/** The platform's face: outbound the catalog account / platform registry; inbound the inbound source's name. */
function platformLabel(line: RecordLineRow): string | null {
  if (!line.platform) return null;
  if (line.direction === 'outbound') return channelLabel(line.platform, line.platformAccountLabel);
  if (isRegisteredInboundSource(line.platform)) return INBOUND_SOURCE_LABELS[line.platform];
  const meta = sourcePlatformMeta(line.platform);
  return meta.value ? meta.label : line.platform;
}

function priceBand(lineTotal: number | null): string {
  if (lineTotal === null) return 'none';
  return (
    RECORDS_PRICE_BANDS.find((band) => band.min !== null && lineTotal >= band.min && (band.max === null || lineTotal < band.max))?.value ??
    'none'
  );
}

/** One line → its sheet row (statuses, flags but `duplicate`, facts, facet values). */
function locate(line: RecordLineRow, nowMs: number): Located {
  const internal: RecordsInternalStatus =
    line.direction === 'outbound'
      ? resolveOutboundInternalStatus({
          buyerCancelled: line.buyerCancelled,
          scannedOut: line.scannedOut,
          onHold: line.holdFlag || line.outOfStock || isExceptionHeld({ releaseState: line.releaseState, skuCatalogId: line.skuCatalogId }),
          packed: line.packed,
          picked: line.picked,
        })
      : resolveInboundInternalStatus({
          hasTracking: line.packages.length > 0,
          unboxed: line.unboxedAt !== null || resolveReceivingLineStatus(line.lineStatus, line.workflowStatus) === 'UNBOXED',
          received:
            (line.unitsReceived ?? 0) > 0 ||
            line.receivedDone ||
            resolveReceivingLineStatus(line.lineStatus, line.workflowStatus) === 'RECEIVED',
        });

  // External: the carrier status of the line's packages (the one furthest behind / needing a person).
  const statuses = line.packages.map((pkg) => carrierStatusOfCategory(pkg.category));
  const external = leadStatus(
    CARRIER_STATUS,
    statuses.filter((status): status is CarrierStatus => status !== null),
  );
  // The package the External cell speaks for: the one holding that status, the primary first.
  const leadIndex = external === null ? 0 : statuses.indexOf(external);
  const lead = line.packages[leadIndex] ?? null;
  const primary = line.packages.find((pkg) => pkg.primary) ?? line.packages[0] ?? null;
  // Delivered = when the last package arrived (every package is delivered); else the lead's own delivery, if any.
  const deliveredAt =
    external === 'delivered'
      ? line.packages.reduce<string | null>(
          (best, { deliveredAt: at }) => (at !== null && (best === null || Date.parse(at) > Date.parse(best)) ? at : best),
          null,
        )
      : (lead?.deliveredAt ?? null);
  const trackings = line.packages.flatMap((pkg) => (pkg.tracking ? [pkg.tracking] : []));

  let overdueMs: number | null = null;
  if (line.direction === 'outbound') {
    if (line.shipByAt && !line.scannedOut && internal !== 'buyer_cancel') overdueMs = nowMs - Date.parse(line.shipByAt);
  } else if (deliveredAt && internal !== 'unboxed' && internal !== 'received') {
    overdueMs = nowMs - (Date.parse(deliveredAt) + DELIVERED_OVERDUE_HOURS * HOUR_MS);
  }

  const flags: RecordsFlag[] = [];
  if (overdueMs !== null && overdueMs > 0) flags.push('late');
  if (external === 'exception' || line.exceptionCode !== null) flags.push('exception');
  if (line.packages.length === 0) flags.push('no_tracking');
  if (line.hasNote) flags.push('has_note');
  if (line.mine) flags.push('mine');

  const channel = platformLabel(line);
  const ref = line.orderNumber ?? primary?.tracking ?? `#${line.recordId}`;
  const outbound = line.direction === 'outbound';
  const facts: NavLocateFacts = {
    section: line.direction,
    title: line.title,
    sku: line.sku,
    tracking: primary?.tracking ?? null,
    deliveredAt,
    channelStatus: line.channelStatus,
    shipBy: line.shipByDate,
    pickedAt: line.pickedBy ? line.pickedAt : null,
    pickedBy: line.pickedBy,
    packedAt: line.packedAt,
    shippedAt: line.scannedAt,
    packer: line.packer,
    po: line.po,
    vendor: line.vendor,
    lines: line.orderLines,
    duplicates: [],
    unboxedAt: line.unboxedAt,
    unboxedBy: line.unboxedBy,
    units: outbound ? null : { received: line.unitsReceived ?? 0, expected: line.unitsExpected },
    channel,
    customer: line.customer,
    qty: line.qty,
    orderTotal: line.orderTotal,
    orderedAt: line.orderedAt,
    importedAt: line.importedAt,
    scannedOutBy: line.scannedBy,
    carrier: lead?.carrier ?? null,
    service: line.service,
    eta: lead?.eta ?? null,
    lastEvent:
      lead && (lead.statusLabel || lead.latestEventAt)
        ? { label: lead.statusLabel, at: lead.latestEventAt, status: external ? CARRIER_STATUS[external].label : null }
        : null,
    lastEventPlace: lead?.place ?? null,
    packages: line.packages.length,
    trackings: trackings.length > 1 ? trackings : null,
    shipmentId: lead?.shipmentId ?? null,
    orderRowId: outbound ? line.recordId : null,
    lastNote: line.lastNote,
    owner: line.owner,
    direction: line.direction,
    recordId: line.recordId,
    orderNumber: line.orderNumber,
    orderKey: line.orderKey,
    itemNumber: line.itemNumber,
    productKey: line.skuCatalogId !== null ? `c:${line.skuCatalogId}` : line.sku ? `s:${line.sku.toUpperCase()}` : null,
    internalStatus: internal,
    externalStatus: external,
    unitPrice: line.unitPrice,
    lineTotal: line.lineTotal,
    placedAt: line.placedAt,
    receivedAt: line.receivedAt,
    receivedBy: line.receivedBy,
    flags,
    inboundOrderId: line.inboundOrderId,
    cartonId: line.cartonId,
  };
  return {
    line,
    entry: {
      key: recordTargetKey({ direction: line.direction, id: line.recordId }),
      ref,
      buckets: [internal],
      title: line.title,
      detail: lead?.statusLabel ?? null,
      recordHref: outbound
        ? recordDetailsHref({ kind: 'order', orderId: line.recordId, shipped: line.scannedOut })
        : recordDetailsHref({ kind: 'receiving-number', ref, lineId: line.recordId }),
      facts,
    },
    internal,
    external,
    flags,
    values: {
      type: [line.direction],
      internal: [internal],
      external: [external ?? NO_EXTERNAL],
      platform: line.platform ? [line.platform] : [],
      buyer: line.customer ? [line.customer] : [],
      vendor: line.vendor ? [line.vendor] : [],
      sku: line.sku ? [line.sku] : [],
      carrier: lead?.carrier ? [lead.carrier] : [],
      price: [priceBand(line.lineTotal)],
      flag: flags,
    },
    overdueMs,
  };
}

/**
 * `duplicate`: the line's order number is held by more than one order
 * (two orders under one number — another storefront, or an inbound and an
 * outbound), or two pasted refs both name the line.
 */
function markDuplicates(rows: readonly Located[]): void {
  const ordersByNumber = new Map<string, Set<string>>();
  for (const row of rows) {
    const number = canonicalizeTrackingKey(row.line.orderNumber);
    if (!number) continue;
    const orders = ordersByNumber.get(number) ?? new Set<string>();
    orders.add(row.line.orderKey);
    ordersByNumber.set(number, orders);
  }
  for (const row of rows) {
    const number = canonicalizeTrackingKey(row.line.orderNumber);
    const shared = number !== '' && (ordersByNumber.get(number)?.size ?? 0) > 1;
    if (shared || row.line.matchedRefs.length > 1) {
      row.flags.push('duplicate');
      row.flags.sort((a, b) => RECORDS_FLAGS.indexOf(a) - RECORDS_FLAGS.indexOf(b));
    }
  }
}

/** The query's facet lists, lower-cased for matching. */
type FacetCut = Partial<Record<RecordsFacetId, { include: ReadonlySet<string> | null; exclude: ReadonlySet<string> | null }>>;

function facetCut(query: RecordsQuery): FacetCut {
  const cut: FacetCut = {};
  for (const { id } of RECORDS_FACETS) {
    const include = query.include[id];
    const exclude = query.exclude[id];
    if (!include?.length && !exclude?.length) continue;
    cut[id] = {
      include: include?.length ? new Set(include.map((value) => value.toLowerCase())) : null,
      exclude: exclude?.length ? new Set(exclude.map((value) => value.toLowerCase())) : null,
    };
  }
  return cut;
}

/** The row passes every facet's include (any of) and exclude (none of), `except` one (its own counts lift it). */
function keeps(row: Located, cut: FacetCut, except?: RecordsFacetId): boolean {
  for (const [id, lists] of Object.entries(cut) as [RecordsFacetId, NonNullable<FacetCut[RecordsFacetId]>][]) {
    if (id === except) continue;
    const values = row.values[id].map((value) => value.toLowerCase());
    if (lists.include && !values.some((value) => lists.include!.has(value))) return false;
    if (lists.exclude && values.some((value) => lists.exclude!.has(value))) return false;
  }
  return true;
}

const TEXT_ORDER = new Intl.Collator('en-US', { numeric: true, sensitivity: 'base' });

/** A fixed vocabulary's label, in vocabulary order; an open set sorts most first. */
const FIXED_ORDER: Readonly<Partial<Record<RecordsFacetId, readonly string[]>>> = {
  type: RECORDS_TYPES,
  internal: INTERNAL_ORDER,
  external: [...CARRIER_STATUSES, NO_EXTERNAL],
  price: RECORDS_PRICE_BANDS.map((band) => band.value),
  flag: RECORDS_FLAGS,
};

function facetLabel(id: RecordsFacetId, value: string, row: Located): string {
  switch (id) {
    case 'type':
      return TYPE_LABEL[row.line.direction];
    case 'internal':
      return row.line.direction === 'outbound'
        ? OUTBOUND_INTERNAL_STATUS[value as OutboundInternalStatus].label
        : INBOUND_INTERNAL_STATUS[value as InboundInternalStatus].label;
    case 'external':
      return value === NO_EXTERNAL ? 'No carrier status' : CARRIER_STATUS[value as CarrierStatus].label;
    case 'platform':
      return row.entry.facts.channel ?? value;
    case 'price':
      return RECORDS_PRICE_BANDS.find((band) => band.value === value)?.label ?? value;
    case 'flag':
      return RECORDS_FLAG_LABEL[value as RecordsFlag];
    default:
      return value;
  }
}

/** Each facet over the rows every OTHER facet keeps (its own include AND exclude lifted). */
function countRecordsFacets(rows: readonly Located[], cut: FacetCut): NavRecordsFacets {
  const facets = {} as Record<RecordsFacetId, { value: string; label: string; count: number }[]>;
  for (const { id } of RECORDS_FACETS) {
    const options = new Map<string, { value: string; label: string; count: number }>();
    for (const row of rows) {
      if (!keeps(row, cut, id)) continue;
      for (const value of row.values[id]) {
        const option = options.get(value) ?? { value, label: facetLabel(id, value, row), count: 0 };
        option.count += 1;
        options.set(value, option);
      }
    }
    const fixed = FIXED_ORDER[id];
    facets[id] = [...options.values()].sort(
      fixed
        ? (a, b) => fixed.indexOf(a.value) - fixed.indexOf(b.value)
        : (a, b) => b.count - a.count || TEXT_ORDER.compare(a.label, b.label),
    );
  }
  return facets;
}

type SortValue = string | number | null;

const instant = (at: string | null | undefined): number | null => (at ? Date.parse(at) : null);

/** The row's instant on the query's date axis. */
function axisAt(row: Located, axis: RecordsQuery['axis']): number | null {
  const { line } = row;
  switch (axis) {
    case 'placed':
      return instant(line.orderedAt);
    case 'imported':
      return instant(line.importedAt);
    case 'ship_by':
      return instant(line.shipByAt);
    case 'shipped':
      return instant(line.shippedAt);
    case 'delivered':
      return instant(row.entry.facts.deliveredAt);
  }
}

/** Who the Staff sort reads: the chosen event's staffer, else the line's latest step's. */
function staffName(row: Located, event: RecordsQuery['event']): string | null {
  const { line } = row;
  switch (event) {
    case 'picked':
      return line.pickedBy?.name ?? null;
    case 'packed':
      return line.packer?.name ?? null;
    case 'scanned_out':
      return line.scannedBy?.name ?? null;
    case 'unboxed':
      return line.unboxedBy?.name ?? null;
    case 'received':
      return line.receivedBy?.name ?? null;
    default:
      return (
        (line.direction === 'outbound'
          ? (line.scannedBy?.name ?? line.packer?.name ?? line.pickedBy?.name)
          : (line.receivedBy?.name ?? line.unboxedBy?.name)) ?? null
      );
  }
}

/** Sorted by `query.sort` / `query.dir`, nulls last; ties fall to the axis instant (newest first), then the key. */
function sortRecords(rows: readonly Located[], query: Pick<RecordsQuery, 'sort' | 'dir' | 'axis' | 'event' | 'refs'>): Located[] {
  const sort: RecordsSort = query.sort === 'pasted' && query.refs.length === 0 ? 'date' : query.sort;
  const key = (row: Located): SortValue => {
    switch (sort) {
      case 'pasted':
        return row.line.matchedRefs[0] ?? null;
      case 'internal':
        return INTERNAL_ORDER.indexOf(row.internal);
      case 'external':
        return row.external === null ? null : CARRIER_STATUSES.indexOf(row.external);
      case 'date':
        return axisAt(row, query.axis);
      case 'staff':
        return staffName(row, query.event);
      case 'platform':
        return row.entry.facts.channel ?? null;
      case 'party':
        return row.line.customer ?? row.line.vendor;
      case 'price':
        return row.line.lineTotal;
      case 'overdue':
        return row.overdueMs;
    }
  };
  const sign = query.dir === 'asc' ? 1 : -1;
  return rows
    .map((row) => ({ row, value: key(row), at: axisAt(row, query.axis) }))
    .sort((a, b) => {
      if (a.value !== b.value) {
        if (a.value === null) return 1;
        if (b.value === null) return -1;
        const by =
          typeof a.value === 'number' && typeof b.value === 'number' ? a.value - b.value : TEXT_ORDER.compare(String(a.value), String(b.value));
        if (by !== 0) return by * sign;
      }
      if (a.at !== b.at) {
        if (a.at === null) return 1;
        if (b.at === null) return -1;
        return b.at - a.at;
      }
      return TEXT_ORDER.compare(a.row.entry.key!, b.row.entry.key!);
    })
    .map(({ row }) => row);
}

type WireEntry = NavRecordsWire['entries'][number];

const WIRE_DEFAULT: Readonly<Record<string, unknown>> = NAV_RECORDS_WIRE_DEFAULTS;

/**
 * An entry as it travels: every null left out, and every fact holding its
 * `NAV_RECORDS_WIRE_DEFAULTS` value — `NavRecordsResponseSchema` restores both.
 */
function wireEntry(entry: NavLocateEntry): WireEntry {
  const base = {
    ...(entry.key ? { key: entry.key } : null),
    ref: entry.ref,
    buckets: entry.buckets,
    ...(entry.title ? { title: entry.title } : null),
    ...(entry.detail ? { detail: entry.detail } : null),
    ...(entry.recordHref ? { recordHref: entry.recordHref } : null),
  };
  if (!entry.facts) return { ...base, facts: null };
  const facts: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(entry.facts)) {
    if (value === undefined || value === null) continue;
    if (Object.hasOwn(WIRE_DEFAULT, name)) {
      const fallback = WIRE_DEFAULT[name];
      const same = Array.isArray(fallback) ? Array.isArray(value) && value.length === 0 : value === fallback;
      if (same) continue;
    }
    facts[name] = value;
  }
  return { ...base, facts: facts as NonNullable<WireEntry['facts']> };
}

export async function getNavRecords(
  caller: { orgId: OrgId; permissions: ReadonlySet<string>; staffId?: number | null },
  params: Pick<URLSearchParams, 'get'>,
  deps: NavRecordsDeps,
): Promise<NavRecordsResult> {
  const outbound = caller.permissions.has(NAV_RECORDS_PERMISSION.outbound);
  const inbound = caller.permissions.has(NAV_RECORDS_PERMISSION.inbound);
  if (!outbound && !inbound) {
    return { ok: false, status: 403, error: 'FORBIDDEN', permission: `${NAV_RECORDS_PERMISSION.outbound}|${NAV_RECORDS_PERMISSION.inbound}` };
  }
  const pasted = parseRefInParam(params.get(RECORDS_REFS_PARAM));
  const query = readRecordsQuery(params, pasted.refs);
  const window = recordsWindow(query, deps.today());
  const lines = await deps.rows(caller.orgId, {
    outbound,
    inbound,
    axis: query.axis,
    ...window,
    event: query.event,
    eventBy: query.eventBy,
    eventFromAt: dayStart(query.eventFrom),
    eventToBefore: query.eventTo ? dayStart(addDaysToDateKey(query.eventTo, 1)) : null,
    find: query.find || null,
    refs: query.refs,
    viewerStaffId: caller.staffId ?? null,
  });
  const nowMs = deps.now().getTime();
  const located = lines.map((line) => locate(line, nowMs));
  markDuplicates(located);

  const cut = facetCut(query);
  const facets = countRecordsFacets(located, cut);
  const kept = sortRecords(
    located.filter((row) => keeps(row, cut)),
    query,
  );
  const answered = kept.slice(0, RECORDS_ROW_LIMIT).map((row) => row.entry);

  // Refs no line answers, as "Not found" entries — at their paste position under the As-pasted sort, else last.
  const found = new Set(lines.flatMap((line) => line.matchedRefs));
  const misses = query.refs.flatMap((ref, index): { at: number; entry: NavLocateEntry }[] =>
    found.has(index + 1)
      ? []
      : [{ at: index + 1, entry: { key: `miss:${pasted.keys[index]}`, ref, buckets: [], title: null, detail: 'Not found', recordHref: null, facts: null } }],
  );
  let entries: NavLocateEntry[] = answered;
  if (misses.length > 0 && query.sort === 'pasted') {
    entries = [];
    let next = 0;
    for (const row of kept.slice(0, RECORDS_ROW_LIMIT)) {
      const at = row.line.matchedRefs[0] ?? Number.POSITIVE_INFINITY;
      while (next < misses.length && misses[next]!.at < at) entries.push(misses[next++]!.entry);
      entries.push(row.entry);
    }
    while (next < misses.length) entries.push(misses[next++]!.entry);
  } else if (misses.length > 0) {
    entries = [...answered, ...misses.map((miss) => miss.entry)];
  }

  return {
    ok: true,
    body: {
      entries: entries.map(wireEntry),
      total: kept.length,
      truncated: kept.length > RECORDS_ROW_LIMIT,
      facets,
    },
  };
}
