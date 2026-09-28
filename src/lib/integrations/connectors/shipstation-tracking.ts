/** ShipStation shipments → order tracking. */
import type { OrgId } from '@/lib/tenancy/constants';
import type { ShipStationV1Shipment } from '@/lib/shipping/shipstation/orders-v1';
import { shipStationCarrierToStored } from '@/lib/shipping/carrier-resolution';
import { normalizeTrackingNumber } from '@/lib/tracking-format';
import { matchAggregatorOrderRows, type PlatformOf } from '@/lib/orders/order-source-match';
import type { ImportRowRecord } from '@/lib/imports/types';

/** The tracking one order should carry as its primary. */
interface ShipmentTrackingPlan {
  orderNumber: string;
  shipmentId: number;
  /** The ShipStation order the label belongs to (pairs via the order refs). */
  shipStationOrderId: number | null;
  trackingNumber: string;
  /** Carrier in the stored vocabulary (`USPS`, `UPS`, …); null = let the
   *  tracking-pattern detector decide. */
  carrier: string | null;
}

interface ShipmentTrackingPlanSummary {
  /** One per order number, sorted by order number. */
  plans: ShipmentTrackingPlan[];
  /** Voided labels dropped. */
  voided: number;
  /** Non-voided rows that can't become a primary: return labels, rows with no
   *  tracking number, rows with no order number. */
  skipped: number;
}

function createdAt(s: ShipStationV1Shipment): number {
  const t = s.createDate ? Date.parse(s.createDate) : NaN;
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
}

/** True when `a` should win over `b` as the order's primary. */
function isLater(a: ShipStationV1Shipment, b: ShipStationV1Shipment): boolean {
  const ta = createdAt(a);
  const tb = createdAt(b);
  if (ta !== tb) return ta > tb;
  return a.shipmentId > b.shipmentId;
}

export function planShipStationTracking(shipments: readonly ShipStationV1Shipment[]): ShipmentTrackingPlanSummary {
  let voided = 0;
  let skipped = 0;
  const winners = new Map<string, ShipStationV1Shipment>();
  for (const s of shipments) {
    if (s.voided) {
      voided += 1;
      continue;
    }
    const orderNumber = s.orderNumber?.trim() ?? '';
    const tracking = s.trackingNumber?.trim() ?? '';
    if (s.isReturnLabel || !orderNumber || !tracking) {
      skipped += 1;
      continue;
    }
    const current = winners.get(orderNumber);
    if (!current || isLater(s, current)) winners.set(orderNumber, s);
  }
  const plans = Array.from(winners, ([orderNumber, s]) => ({
    orderNumber,
    shipmentId: s.shipmentId,
    shipStationOrderId: s.orderId,
    trackingNumber: s.trackingNumber!.trim(),
    carrier: shipStationCarrierToStored(s.carrierCode),
  })).sort((a, b) => (a.orderNumber < b.orderNumber ? -1 : a.orderNumber > b.orderNumber ? 1 : 0));
  return { plans, voided, skipped };
}

/** One org `orders` row carrying a ShipStation order number (any source),
 *  with the tracking it carries today. */
export interface ShipStationOrderRow {
  orderNumber: string;
  orderRowId: number;
  accountSource: string | null;
  /** Raw tracking behind `orders.shipment_id`, or null when none. */
  currentTracking: string | null;
  /** ShipStation order ids this row is recorded against
   *  (`shipstation_order_refs`) — the durable pairing. Absent = none known. */
  shipStationOrderIds?: number[];
}

export interface ShipStationTrackingDeps {
  /** The org's `orders` rows whose `order_id` is in `orderNumbers`, whatever
   *  their account_source, with their ShipStation order refs. */
  findOrders(orgId: OrgId, orderNumbers: string[]): Promise<ShipStationOrderRow[]>;
  /** Places an account_source in the org catalog (see `matchAggregatorOrderRows`). */
  platformOf: PlatformOf;
  /** Register `trackingNumber` as the primary on every row in `orderIds`. */
  attachPrimaryTracking(input: {
    orgId: OrgId;
    orderIds: number[];
    trackingNumber: string;
    carrier: string | null;
  }): Promise<void>;
  /** Per-order failure sink (one bad row never fails the sync). */
  onError?(orderNumber: string, error: unknown): void;
}

type TrackingAttachStatus = 'attached' | 'already_current' | 'unmatched' | 'ambiguous' | 'failed';

interface ShipStationTrackingResult {
  /** Orders whose primary tracking was set/replaced (would be, in a dry run). */
  attached: number;
  /** Orders already carrying this tracking — no write. */
  alreadyCurrent: number;
  /** Planned order numbers with no order row (any source) in this org. */
  unmatched: number;
  /** Order numbers whose rows span platforms and carry no ShipStation ref —
   *  left alone rather than guessed. */
  ambiguous: number;
  /** Orders whose attach threw (e.g. tracking owned by another order). */
  failed: number;
  /** `orders.id`s whose tracking changed — for the post-commit cache bust. */
  attachedOrderIds: number[];
  /** Per plan: what happened and which rows it resolved to. */
  outcomes: Array<{ shipmentId: number; status: TrackingAttachStatus; orderRowIds: number[] }>;
}

export async function attachShipStationTracking(
  orgId: OrgId,
  plans: readonly ShipmentTrackingPlan[],
  deps: ShipStationTrackingDeps,
  opts: { dryRun?: boolean; concurrency?: number } = {},
): Promise<ShipStationTrackingResult> {
  const result: ShipStationTrackingResult = {
    attached: 0,
    alreadyCurrent: 0,
    unmatched: 0,
    ambiguous: 0,
    failed: 0,
    attachedOrderIds: [],
    outcomes: [],
  };
  if (plans.length === 0) return result;

  const rows = await deps.findOrders(
    orgId,
    plans.map((p) => p.orderNumber),
  );
  const rowsByNumber = new Map<string, ShipStationOrderRow[]>();
  for (const row of rows) {
    const list = rowsByNumber.get(row.orderNumber);
    if (list) list.push(row);
    else rowsByNumber.set(row.orderNumber, [row]);
  }

  const handle = async (plan: ShipmentTrackingPlan) => {
    const outcome = (status: TrackingAttachStatus, orderRowIds: number[] = []) =>
      result.outcomes.push({ shipmentId: plan.shipmentId, status, orderRowIds });
    const candidates = rowsByNumber.get(plan.orderNumber) ?? [];
    // The durable pairing first: rows recorded against this ShipStation order.
    // Else the aggregator rule without a platform: one platform's rows (or a
    // legacy row) take the label; rows across platforms are never guessed.
    const referenced =
      plan.shipStationOrderId != null
        ? candidates.filter((r) => (r.shipStationOrderIds ?? []).includes(plan.shipStationOrderId!))
        : [];
    const match = referenced.length > 0 ? null : matchAggregatorOrderRows(null, candidates, deps.platformOf);
    if (match?.kind === 'ambiguous') {
      result.ambiguous += 1;
      outcome('ambiguous');
      return;
    }
    const orderRows = referenced.length > 0 ? referenced : (match?.rows ?? []);
    if (orderRows.length === 0) {
      result.unmatched += 1;
      outcome('unmatched');
      return;
    }
    const orderIds = orderRows.map((r) => r.orderRowId).sort((a, b) => a - b);
    const wanted = normalizeTrackingNumber(plan.trackingNumber);
    const current = orderRows.every(
      (r) => r.currentTracking != null && normalizeTrackingNumber(r.currentTracking) === wanted,
    );
    if (current) {
      result.alreadyCurrent += 1;
      outcome('already_current', orderIds);
      return;
    }
    if (opts.dryRun) {
      result.attached += 1;
      outcome('attached', orderIds);
      return;
    }
    try {
      await deps.attachPrimaryTracking({
        orgId,
        orderIds,
        trackingNumber: plan.trackingNumber,
        carrier: plan.carrier,
      });
      result.attached += 1;
      result.attachedOrderIds.push(...orderIds);
      outcome('attached', orderIds);
    } catch (e) {
      result.failed += 1;
      outcome('failed', orderIds);
      deps.onError?.(plan.orderNumber, e);
    }
  };

  // Plans touch different orders, so they attach a few at a time; one plan's
  // failure is contained in its own outcome.
  const limit = Math.max(1, opts.concurrency ?? 1);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, plans.length) }, async () => {
      while (next < plans.length) await handle(plans[next++]);
    }),
  );
  return result;
}

/**
 * The import record for one applied label pass: a label that became an
 * order's primary is `tracking_filled` on every row it attached to, an attach
 * that threw is `failed` there, and a number whose rows span platforms is one
 * `ambiguous` row. Unmatched labels and already-current tracking touch no
 * order and record nothing.
 */
export function shipStationTrackingImportRows(
  shipments: readonly ShipStationV1Shipment[],
  outcomes: ShipStationTrackingResult['outcomes'],
  rowsById: ReadonlyMap<number, { accountSource: string | null; shipmentId: number | null }>,
  platformOf: PlatformOf,
): ImportRowRecord[] {
  const shipmentById = new Map(shipments.map((s) => [s.shipmentId, s]));
  return outcomes.flatMap((o): ImportRowRecord[] => {
    const s = shipmentById.get(o.shipmentId);
    if (!s) return [];
    const base = {
      externalOrderId: s.orderNumber?.trim() ?? '',
      trackingNumber: s.trackingNumber?.trim() || null,
      shipstationShipmentId: s.shipmentId,
      shipstationOrderId: s.orderId,
    };
    if (o.status === 'ambiguous') {
      return [
        { ...base, orderRowId: null, accountSource: null, platform: null, outcome: 'ambiguous', reason: 'shipstation_ambiguous_match' },
      ];
    }
    if (o.status !== 'attached' && o.status !== 'failed') return [];
    return o.orderRowIds.map((orderRowId) => {
      const row = rowsById.get(orderRowId);
      const accountSource = row?.accountSource ?? null;
      return {
        ...base,
        orderRowId,
        accountSource,
        platform: platformOf(accountSource),
        outcome: o.status === 'attached' ? 'tracking_filled' : 'failed',
        reason: o.status === 'failed' ? 'tracking_attach_failed' : null,
        filledFields: o.status === 'attached' ? ['shipment_id'] : [],
        shipmentId: o.status === 'attached' ? row?.shipmentId ?? null : null,
      };
    });
  });
}
