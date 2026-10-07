/** Order lifecycle — the SINGLE canonical projection of an order's pre‑dock (sold → label → pick → pack → stage) lifecycle stage. */

import type { LifecycleState } from '@cycleforge/design-tokens';
import type { OutboundWarehouseStage } from '@/lib/outbound/work-contract';
import { carrierPhaseOfCategory } from '@/lib/status/record-status';

/** The full pre‑dock pipeline stage vocabulary. */
export type OrderLifecycleStage =
  | 'AWAITING_LABEL' // sold, no tracking/label yet (shipment_id is null)
  | 'PENDING' // labeled, waiting for pick/pack
  | 'PICKED' // picked (desk pick scan / serial taken) — ready to pack. A pick fact, not QC.
  | 'PACKED_STAGED' // packed + staged, awaiting dock scan‑out (shared seam state)
  | 'BLOCKED'; // out of stock / can't fulfill — needs attention

/** The narrowed lane vocabulary the Dashboard · Unshipped board renders. */
export type FulfillmentLane = 'PENDING' | 'PICKED' | 'BLOCKED';

/** The canonical lifecycle signals — the inputs every derivation reads. */
export interface OrderLifecycleSignals {
  /** orders.shipment_id — null means no tracking/label has been attached yet. */
  shipmentId?: number | string | null;
  /** Walk-in / counter pickup (`orders.fulfillment_channel = 'PICKUP'`) — never labeled, never awaiting one. */
  pickup?: boolean | null;
  /** The order has been picked — any source of the picked-by resolver (`sqlOrderIsPicked`). Not QC. */
  hasPickScan?: boolean | null;
  /** PACK event timestamp (pack completed, not merely a packer assigned). */
  packedAt?: string | null;
  /**
   * orders.is_out_of_stock — operator flag that the line is blocked.
   * Prefer this boolean. Legacy callers may still pass `outOfStock` as a
   * non-empty string (pre-2026-07-23b); both are accepted by {@link isOutOfStock}.
   */
  isOutOfStock?: boolean | null;
  /** @deprecated Use `isOutOfStock`. Kept for transitional row shapes / tests. */
  outOfStock?: string | boolean | null;
}

// ─── Shared predicates (one definition, reused by every evaluator) ──────────────
/** True when the order is flagged out of stock (boolean SoT, legacy text tolerated). */
function isOutOfStock(s: OrderLifecycleSignals): boolean {
  if (typeof s.isOutOfStock === 'boolean') return s.isOutOfStock;
  if (typeof s.outOfStock === 'boolean') return s.outOfStock;
  return String(s.outOfStock ?? '').trim() !== '';
}
/** A label/tracking is attached (shipment_id present). */
function hasLabel(s: OrderLifecycleSignals): boolean {
  return s.shipmentId != null && String(s.shipmentId) !== '';
}

/** Ordered, first‑match‑wins rule set — the SINGLE place pre‑dock precedence lives. */
interface OrderLifecycleRule {
  id: string;
  stage: OrderLifecycleStage;
  test: (s: OrderLifecycleSignals) => boolean;
}

export const UNSHIPPED_LIFECYCLE_RULES: readonly OrderLifecycleRule[] = [
  { id: 'packed_staged', stage: 'PACKED_STAGED', test: (s) => Boolean(s.packedAt) },
  { id: 'out_of_stock', stage: 'BLOCKED', test: isOutOfStock },
  { id: 'picked', stage: 'PICKED', test: (s) => Boolean(s.hasPickScan) },
  { id: 'labeled', stage: 'PENDING', test: (s) => hasLabel(s) || s.pickup === true },
];

/** Stage when no rule matches: sold but not yet labeled. */
const DEFAULT_LIFECYCLE_STAGE: OrderLifecycleStage = 'AWAITING_LABEL';

/** Resolve the full pre‑dock pipeline stage from the canonical signals. */
export function resolveOrderLifecycleStage(signals: OrderLifecycleSignals): OrderLifecycleStage {
  for (const rule of UNSHIPPED_LIFECYCLE_RULES) {
    if (rule.test(signals)) return rule.stage;
  }
  return DEFAULT_LIFECYCLE_STAGE;
}

/** Resolve the fulfillment LANE for orders already in the labeled‑not‑packed scope (Dashboard · Unshipped board). */
export function resolveFulfillmentLane(signals: OrderLifecycleSignals): FulfillmentLane {
  if (isOutOfStock(signals)) return 'BLOCKED';
  if (signals.hasPickScan) return 'PICKED';
  return 'PENDING';
}

/** Pre-dock stage (+ expedite flag) → the shared lifecycle key used on every surface. */
export function orderLifecycleState(
  stage: OrderLifecycleStage,
  flags: { urgent?: boolean | null } = {},
): LifecycleState {
  if (stage === 'BLOCKED') return 'outOfStock';
  if (flags.urgent) return 'urgent';
  if (stage === 'PACKED_STAGED') return 'packed';
  if (stage === 'PICKED') return 'picked';
  return 'toPick';
}

/** The server's outbound warehouse stage (`OutboundWorkItem.warehouseStage`, `/api/v1/outbound/work`) + the order's expedite flag → the… */
export function workStageLifecycleState(
  stage: OutboundWarehouseStage,
  flags: { urgent?: boolean | null } = {},
): LifecycleState {
  if (stage === 'SCANNED_OUT') return 'shipped';
  if (stage === 'OUT_OF_STOCK') return 'outOfStock';
  if (flags.urgent) return 'urgent';
  if (stage === 'PACKED' || stage === 'LABELED') return 'packed';
  if (stage === 'PICKED') return 'picked';
  return 'toPick';
}

// ─── Board descriptor (lane order + icon binding, as data — no React) ───────────
interface FulfillmentLaneDescriptor {
  id: FulfillmentLane;
  /** Which structural icon sits next to the lane title. */
  iconKey: 'clock' | 'check' | 'alert';
  /** Lane header icon color (icon only; the status dot keeps the meta hue). */
  iconClass: string;
}

/** Lane order (top → bottom = progress; Blocked/exception last) + per‑lane icon binding for the Unshipped board. */
export const FULFILLMENT_BOARD_LANES: readonly FulfillmentLaneDescriptor[] = [
  { id: 'PENDING', iconKey: 'clock', iconClass: 'text-yellow-500' },
  { id: 'PICKED', iconKey: 'check', iconClass: 'text-green-500' },
  { id: 'BLOCKED', iconKey: 'alert', iconClass: 'text-red-500' },
];

// ════════════════════════════════════════════════════════════════════════════ POST‑DOCK (outbound) lifecycle — pack → leave‑the‑building…

export type OutboundStage =
  | 'PACKED_STAGED' // packed, sitting in staging, not yet scanned out
  | 'SCANNED_OUT' // dock scan recorded, carrier hasn't reported custody yet
  | 'IN_CUSTODY' // carrier accepted / in transit / out for delivery
  | 'DELIVERED' // terminal delivered
  | 'EXCEPTION' // carrier exception or stalled (no movement)
  | 'PROCESS_GAP' // scanned out but no pack record — backfill / coach
  | 'ORPHAN'; // carrier took custody but it was never scanned out internally

/** The post‑dock signals every outbound derivation reads. */
export interface OutboundSignals {
  /** PACK event present (packer scanned it). */
  packedAt?: string | null;
  /** SHIP_CONFIRM event present (scanned out at the dock). */
  shipConfirmedAt?: string | null;
  /** shipping_tracking_numbers.latest_status_category. */
  latestStatusCategory?: string | null;
  /** shipping_tracking_numbers.is_terminal. */
  isTerminal?: boolean | null;
  /** shipping_tracking_numbers.has_exception. */
  hasException?: boolean | null;
  /** Caller-computed `isStalled(...)` result (kept out of here so this stays pure). */
  stalled?: boolean | null;
}

/**
 * Carrier has physical custody (accepted or further along): the category's
 * carrier status is moving or terminal (`CARRIER_STATUS` phase,
 * `src/lib/status/record-status.ts`) — the one vocabulary every
 * custody/shipped predicate reads.
 */
export function carrierHasCustody(input: OutboundSignals): boolean {
  const phase = carrierPhaseOfCategory(input.latestStatusCategory);
  return phase === 'moving' || phase === 'terminal';
}

/**
 * Has the package left the building? Either we scanned it out, or the carrier
 * already has it. Used to partition the staging table from the shipped-out table.
 */
export function hasLeftWarehouse(input: OutboundSignals): boolean {
  return Boolean(input.shipConfirmedAt) || carrierHasCustody(input);
}

/** Resolve the post‑dock outbound stage from the carrier + scan signals. */
export function resolveOutboundStage(input: OutboundSignals): OutboundStage {
  const cat = String(input.latestStatusCategory ?? '').toUpperCase();
  const hasPack = Boolean(input.packedAt);
  const hasShipOut = Boolean(input.shipConfirmedAt);
  const delivered = cat === 'DELIVERED' || (input.isTerminal === true && cat !== 'RETURNED');
  const custody = carrierHasCustody(input);

  // Delivered is terminal and always the last word — it overrides scanned-out,
  // process-gap, exception, everything.
  if (delivered) return 'DELIVERED';
  // Scanned out with no pack record at all → a process gap worth surfacing.
  if (hasShipOut && !hasPack) return 'PROCESS_GAP';
  if (input.hasException || input.stalled) return 'EXCEPTION';
  if (custody && hasShipOut) return 'IN_CUSTODY';
  // Carrier has it, but it was never scanned out internally — left outside the flow.
  if (custody && !hasShipOut) return 'ORPHAN';
  if (hasShipOut) return 'SCANNED_OUT';
  return 'PACKED_STAGED';
}

/** The "effective ship time" used to file a package under the day it left, not the day it was packed. */
export function effectiveShipTime(input: {
  shipConfirmedAt?: string | null;
  packedAt?: string | null;
}): string | null {
  return input.shipConfirmedAt || input.packedAt || null;
}
