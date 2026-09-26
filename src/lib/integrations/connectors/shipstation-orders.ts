/** ShipStation orders → the org's `orders` rows: */
import type { CanonicalOrderLine } from '@/lib/orders/canonical-order';
import type { ShipStationV1Order, ShipStationV1Store } from '@/lib/shipping/shipstation/orders-v1';
import type { ShipAddress } from '@/lib/shipping/shipstation/types';
import { shipstationMarketplaceSlug } from '@/lib/catalog/shipstation-store-sync';
import {
  crossSourceBackfillPolicy,
  matchAggregatorOrderRows,
  type PlatformOf,
} from '@/lib/orders/order-source-match';
import { planOrderRowBackfill, type BackfillPolicy, type BackfillRow } from '@/lib/orders/order-row-backfill';

// ─── Store → platform ────────────────────────────────────────────────────────

/** Platform key of ShipStation's Manual Orders store (marketplace 'ShipStation'). */
const MANUAL_ORDERS_PLATFORM = 'manual';

export type StoreAttribution =
  | {
      kind: 'platform';
      storeId: number;
      /** Catalog platform slug (or `manual`). */
      platform: string;
      /** What `orders.account_source` gets. */
      accountSource: string;
      via: 'binding' | 'marketplace';
    }
  | { kind: 'unattributed'; storeId: number | null; detail: string };

export interface AttributionCatalog {
  /** Store links: ShipStation store id → the linked platform slug and, when
   *  the link names an account, that account's slug (else null → the org's
   *  spelling for the platform). */
  bindings: ReadonlyMap<number, { platform: string; accountSource: string | null }>;
  /** This org's existing `orders.account_source` values, with how many orders
   *  use each and the platform the catalog places each on (null = unplaced). */
  spellings: ReadonlyArray<{ accountSource: string; platform: string | null; count: number }>;
}

function storePlatform(store: ShipStationV1Store): string | null {
  const name = String(store.marketplace ?? store.marketplaceName ?? '').trim().toLowerCase();
  if (name === 'shipstation') return MANUAL_ORDERS_PLATFORM;
  return shipstationMarketplaceSlug(store);
}

/** The org's spelling for a platform: its most-used account_source placed on
 *  that platform (an unplaced value counts under its own lower-case text),
 *  ties broken alphabetically; else the platform key itself. */
function spellingFor(platform: string, spellings: AttributionCatalog['spellings']): string {
  let best: { accountSource: string; count: number } | null = null;
  for (const s of spellings) {
    const source = s.accountSource.trim();
    if (!source) continue;
    if ((s.platform ?? source.toLowerCase()) !== platform) continue;
    if (!best || s.count > best.count || (s.count === best.count && source < best.accountSource)) {
      best = { accountSource: source, count: s.count };
    }
  }
  return best?.accountSource ?? platform;
}

export function buildStoreAttributions(
  stores: readonly ShipStationV1Store[],
  catalog: AttributionCatalog,
): Map<number, StoreAttribution> {
  const out = new Map<number, StoreAttribution>();
  for (const store of stores) {
    const bound = catalog.bindings.get(store.storeId);
    if (bound) {
      out.set(store.storeId, {
        kind: 'platform',
        storeId: store.storeId,
        platform: bound.platform,
        accountSource: bound.accountSource ?? spellingFor(bound.platform, catalog.spellings),
        via: 'binding',
      });
      continue;
    }
    const platform = storePlatform(store);
    out.set(
      store.storeId,
      platform
        ? {
            kind: 'platform',
            storeId: store.storeId,
            platform,
            accountSource: spellingFor(platform, catalog.spellings),
            via: 'marketplace',
          }
        : {
            kind: 'unattributed',
            storeId: store.storeId,
            detail: `ShipStation store "${store.storeName ?? store.storeId}" (${store.marketplaceName ?? 'no marketplace'}) is not a sales platform`,
          },
    );
  }
  return out;
}

export function attributeStore(
  storeId: number | null,
  attributions: ReadonlyMap<number, StoreAttribution>,
): StoreAttribution {
  if (storeId == null) return { kind: 'unattributed', storeId: null, detail: 'order carries no ShipStation store' };
  return (
    attributions.get(storeId) ?? {
      kind: 'unattributed',
      storeId,
      detail: `ShipStation store ${storeId} is not in the account's store list`,
    }
  );
}

// ─── Orders → canonical line ─────────────────────────────────────────────────

/** ShipStation orders sharing one order number (split shipments share the
 *  number and the order key), in first-seen order. */
function groupByOrderNumber(orders: readonly ShipStationV1Order[]): Map<string, ShipStationV1Order[]> {
  const out = new Map<string, ShipStationV1Order[]>();
  for (const order of orders) {
    const number = String(order.orderNumber ?? '').trim();
    if (!number) continue;
    const list = out.get(number);
    if (list) {
      if (!list.some((o) => o.orderId === order.orderId)) list.push(order);
    } else out.set(number, [order]);
  }
  return out;
}

const isCancelled = (o: ShipStationV1Order) => (o.orderStatus ?? '').toLowerCase() === 'cancelled';
const isShipped = (o: ShipStationV1Order) => (o.orderStatus ?? '').toLowerCase() === 'shipped';

/** orders.status for a group. */
function groupStatus(live: readonly ShipStationV1Order[]): string {
  if (live.length === 0) return 'unassigned';
  const split = live.some((o) => o.mergedOrSplit);
  return (split ? live.every(isShipped) : live.some(isShipped)) ? 'shipped' : 'unassigned';
}

/** The order a group is described by: a live one (a shipped copy first),
 *  then the most recently modified. */
function primaryOf(group: readonly ShipStationV1Order[]): ShipStationV1Order {
  const live = group.filter((o) => !isCancelled(o));
  const pool = live.length > 0 ? live : group;
  return [...pool].sort(
    (a, b) =>
      Number(isShipped(b)) - Number(isShipped(a)) ||
      String(b.modifyDate ?? '').localeCompare(String(a.modifyDate ?? '')) ||
      b.orderId - a.orderId,
  )[0];
}

function toBuyerAddress(a: ShipAddress | null) {
  if (!a) return null;
  return {
    address1: a.addressLine1,
    address2: a.addressLine2 ?? null,
    city: a.cityLocality,
    state: a.stateProvince,
    postalCode: a.postalCode,
    country: a.countryCode,
    residential: a.residential ?? null,
  };
}

/** One canonical line for a ShipStation order (all orders sharing its number). */
export function toCanonicalLine(group: readonly ShipStationV1Order[], accountSource: string): CanonicalOrderLine {
  const primary = primaryOf(group);
  const items = group.flatMap((o) => o.items).filter((it) => !it.adjustment);
  const named = items.filter((it) => (it.name ?? '').trim() || (it.sku ?? '').trim());
  const first = named[0];
  const firstTitle = first?.name?.trim() || first?.sku?.trim() || '';
  const title = firstTitle && named.length > 1 ? `${firstTitle} (+${named.length - 1} more)` : firstTitle;
  const units = items.reduce((s, it) => s + (it.quantity || 0), 0);

  const name =
    primary.shipTo?.name?.trim() || primary.billTo?.name?.trim() || primary.customerUsername?.trim() || '';
  const phone = primary.shipTo?.phone?.trim() || primary.billTo?.phone?.trim() || '';
  const email = primary.customerEmail?.trim() || '';
  const hasStrongIdentity = Boolean(primary.customerId != null || email || phone);
  const billTo = primary.billTo;

  const notes = [
    primary.customerNotes ? `Buyer note: ${primary.customerNotes}` : null,
    primary.internalNotes ? `Internal note: ${primary.internalNotes}` : null,
    primary.gift ? `Gift${primary.giftMessage ? `: ${primary.giftMessage}` : ''}` : null,
    primary.requestedShippingService ? `Requested service: ${primary.requestedShippingService}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  // A total of 0 with no priced line is "ShipStation does not know" (manual
  // orders), not a free sale.
  const priced = items.some((it) => (it.unitPrice ?? 0) > 0);
  const total = primary.orderTotal;
  const saleAmount = total != null && (total > 0 || priced) ? total.toFixed(2) : null;

  const shipByDate = primary.shipByDate ? new Date(primary.shipByDate) : null;
  const orderDate = primary.orderDate ? new Date(primary.orderDate) : null;
  const live = group.filter((o) => !isCancelled(o));

  return {
    externalOrderId: String(primary.orderNumber).trim(),
    itemNumber: '',
    sku: named.find((it) => (it.sku ?? '').trim())?.sku?.trim() || '',
    productTitle: title,
    condition: '',
    quantity: String(units || 1),
    notes,
    customerName: hasStrongIdentity ? '' : name,
    buyer: hasStrongIdentity
      ? {
          channelCustomerId: primary.customerId != null ? String(primary.customerId) : '',
          // ShipStation's customer ids are ShipStation's, whatever the platform.
          channel: 'shipstation',
          name,
          email,
          phone,
          shipTo: toBuyerAddress(primary.shipTo),
          billTo: billTo
            ? {
                name: billTo.name || null,
                company: billTo.company ?? null,
                phone: billTo.phone ?? null,
                address1: billTo.addressLine1,
                address2: billTo.addressLine2 ?? null,
                city: billTo.cityLocality,
                state: billTo.stateProvince,
                postalCode: billTo.postalCode,
                country: billTo.countryCode,
              }
            : null,
        }
      : null,
    accountSource,
    trackings: [],
    shipByDate: shipByDate && !Number.isNaN(shipByDate.getTime()) ? shipByDate : null,
    orderDate: orderDate && !Number.isNaN(orderDate.getTime()) ? orderDate : null,
    saleAmount,
    currency: 'USD',
    status: groupStatus(live),
  };
}

// ─── Reconciliation plan ─────────────────────────────────────────────────────

/** An existing org order row carrying a ShipStation order number. */
export interface ExistingOrderRow extends BackfillRow {
  id: number;
}

type QuarantineReason = 'shipstation_unknown_store' | 'shipstation_ambiguous_match';
type SkipReason = 'cancelled' | 'awaiting_payment' | 'ignored_exception' | 'unchanged';
export type MatchKind = 'inserted' | 'same' | 'adopted' | 'claimed';

export type OrderPlan =
  | { outcome: 'skip'; reason: Exclude<SkipReason, 'unchanged'> }
  | { outcome: 'quarantine'; reason: QuarantineReason; detail: string; candidateSources: string[] }
  | { outcome: 'import'; accountSource: string }
  | { outcome: 'enrich' | 'unchanged'; accountSource: string; match: Exclude<MatchKind, 'inserted'>; rowIds: number[] };

export interface PlannedOrder {
  orderNumber: string;
  orders: ShipStationV1Order[];
  attribution: StoreAttribution;
  plan: OrderPlan;
  /** What the writer receives; null for skipped / quarantined orders. */
  line: CanonicalOrderLine | null;
}

export interface ReconcileCounts {
  imported: number;
  enriched: number;
  skipped: number;
  quarantined: number;
  /** Per-reason breakdown: `skipped.cancelled`, `quarantined.shipstation_unknown_store`, `match.adopted` … */
  reasons: Record<string, number>;
}

export function emptyCounts(): ReconcileCounts {
  return { imported: 0, enriched: 0, skipped: 0, quarantined: 0, reasons: {} };
}

export function mergeCounts(into: ReconcileCounts, add: ReconcileCounts): ReconcileCounts {
  into.imported += add.imported;
  into.enriched += add.enriched;
  into.skipped += add.skipped;
  into.quarantined += add.quarantined;
  for (const [k, v] of Object.entries(add.reasons)) into.reasons[k] = (into.reasons[k] ?? 0) + v;
  return into;
}

export function bump(counts: ReconcileCounts, key: string, by = 1) {
  counts.reasons[key] = (counts.reasons[key] ?? 0) + by;
}

interface PlanInputs {
  attributions: ReadonlyMap<number, StoreAttribution>;
  /** Every org row carrying each order number, any account_source. */
  rowsByNumber: ReadonlyMap<string, readonly ExistingOrderRow[]>;
  platformOf: PlatformOf;
  /** Order numbers an operator ignored in the exception queue. */
  ignored: ReadonlySet<string>;
}

const SAME_POLICY: Pick<BackfillPolicy, 'titleAuthoritative' | 'sourceWrite'> = {
  titleAuthoritative: false,
  sourceWrite: 'fill',
};

/** Would the writer change anything on these rows? (Tracking is separate.) */
function wouldEnrich(
  line: CanonicalOrderLine,
  rows: readonly ExistingOrderRow[],
  policy: Pick<BackfillPolicy, 'titleAuthoritative' | 'sourceWrite'>,
): boolean {
  const hasCustomer = Boolean(line.buyer || line.customerName);
  return rows.some((row) => {
    const { values } = planOrderRowBackfill(
      row,
      {
        orderId: line.externalOrderId,
        itemNumber: line.itemNumber,
        productTitle: line.productTitle,
        sku: line.sku,
        skuCatalogId: null,
        quantity: line.quantity,
        condition: line.condition,
        notes: line.notes,
        status: line.status,
        saleAmount: line.saleAmount,
        currency: line.currency,
        accountSource: line.accountSource,
        // Presence only: the real id is resolved by the writer.
        customerId: hasCustomer ? 1 : null,
        shipmentIds: [],
      },
      { ...policy, statusAuthoritative: true },
    );
    return Object.keys(values).length > 0;
  });
}

export function planShipStationOrders(
  orders: readonly ShipStationV1Order[],
  inputs: PlanInputs,
): { planned: PlannedOrder[]; counts: ReconcileCounts } {
  const counts = emptyCounts();
  const planned: PlannedOrder[] = [];
  for (const [orderNumber, group] of groupByOrderNumber(orders)) {
    const primary = primaryOf(group);
    const attribution = attributeStore(primary.storeId, inputs.attributions);
    const push = (plan: OrderPlan, line: CanonicalOrderLine | null) =>
      planned.push({ orderNumber, orders: group, attribution, plan, line });

    if (group.every(isCancelled)) {
      counts.skipped++;
      bump(counts, 'skipped.cancelled');
      push({ outcome: 'skip', reason: 'cancelled' }, null);
      continue;
    }
    // Unpaid is not shippable: it imports once ShipStation moves it on (the
    // status change bumps modifyDate, so the incremental pull sees it).
    if (group.every((o) => isCancelled(o) || (o.orderStatus ?? '').toLowerCase() === 'awaiting_payment')) {
      counts.skipped++;
      bump(counts, 'skipped.awaiting_payment');
      push({ outcome: 'skip', reason: 'awaiting_payment' }, null);
      continue;
    }
    if (inputs.ignored.has(orderNumber)) {
      counts.skipped++;
      bump(counts, 'skipped.ignored_exception');
      push({ outcome: 'skip', reason: 'ignored_exception' }, null);
      continue;
    }
    const rows = inputs.rowsByNumber.get(orderNumber) ?? [];
    if (attribution.kind === 'unattributed') {
      counts.quarantined++;
      bump(counts, 'quarantined.shipstation_unknown_store');
      push(
        {
          outcome: 'quarantine',
          reason: 'shipstation_unknown_store',
          detail: attribution.detail,
          candidateSources: rows.map((r) => String(r.accountSource ?? '')),
        },
        null,
      );
      continue;
    }

    const line = toCanonicalLine(group, attribution.accountSource);
    const match = matchAggregatorOrderRows(attribution.accountSource, rows, inputs.platformOf);
    if (match.kind === 'ambiguous') {
      counts.quarantined++;
      bump(counts, 'quarantined.shipstation_ambiguous_match');
      const sources = Array.from(new Set(rows.map((r) => String(r.accountSource ?? '').trim() || '(blank)')));
      push(
        {
          outcome: 'quarantine',
          reason: 'shipstation_ambiguous_match',
          detail: `order ${orderNumber} (${attribution.accountSource}) already exists under ${sources.join(', ')}`,
          candidateSources: sources,
        },
        null,
      );
      continue;
    }
    if (match.kind === 'none') {
      counts.imported++;
      bump(counts, `platform.${attribution.accountSource}`);
      push({ outcome: 'import', accountSource: attribution.accountSource }, line);
      continue;
    }

    const kind: Exclude<MatchKind, 'inserted'> =
      match.kind === 'same' ? 'same' : match.kind === 'adopt' ? 'adopted' : 'claimed';
    const enrich =
      match.kind === 'claim' ||
      wouldEnrich(line, match.rows, match.kind === 'same' ? SAME_POLICY : crossSourceBackfillPolicy('adopt', false));
    bump(counts, `match.${kind}`);
    if (enrich) counts.enriched++;
    else {
      counts.skipped++;
      bump(counts, 'skipped.unchanged');
    }
    push(
      {
        outcome: enrich ? 'enrich' : 'unchanged',
        accountSource: attribution.accountSource,
        match: kind,
        rowIds: match.rows.map((r) => r.id),
      },
      line,
    );
  }
  return { planned, counts };
}

// ─── Historical backfill windows ─────────────────────────────────────────────

export interface BackfillCheckpoint {
  phase: 'orders' | 'shipments' | 'done';
  /** Start of the window being worked. */
  windowStart: Date;
  /** Next page to read inside that window (1-based). */
  page: number;
}

/** Consecutive [start, end) windows of `days` from `start` up to `end`. */
export function backfillWindows(start: Date, end: Date, days: number): Array<{ start: Date; end: Date }> {
  const out: Array<{ start: Date; end: Date }> = [];
  const step = Math.max(1, days) * 86_400_000;
  for (let t = start.getTime(); t < end.getTime(); t += step) {
    out.push({ start: new Date(t), end: new Date(Math.min(t + step, end.getTime())) });
  }
  return out;
}

/** Where a (possibly interrupted) backfill continues: */
export function resumeFrom(
  windows: ReadonlyArray<{ start: Date; end: Date }>,
  checkpoint: BackfillCheckpoint | null,
  phase: 'orders' | 'shipments',
): { windowIndex: number; page: number } {
  if (!checkpoint) return { windowIndex: 0, page: 1 };
  const order = { orders: 0, shipments: 1, done: 2 } as const;
  if (order[checkpoint.phase] > order[phase]) return { windowIndex: windows.length, page: 1 };
  if (order[checkpoint.phase] < order[phase]) return { windowIndex: 0, page: 1 };
  const at = checkpoint.windowStart.getTime();
  const idx = windows.findIndex((w) => w.start.getTime() <= at && at < w.end.getTime());
  return idx < 0 ? { windowIndex: 0, page: 1 } : { windowIndex: idx, page: Math.max(1, checkpoint.page) };
}
