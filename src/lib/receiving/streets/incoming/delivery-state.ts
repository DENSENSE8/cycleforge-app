/** Incoming street — delivery-state rules-as-data SoT. */

import { SHIPMENT_SCANNED_PREDICATE, CARRIER_MISMATCH_PREDICATE } from '../../delivered-unscanned';

export const DELIVERY_STATES = [
  'RECEIVED',
  'DELIVERED_UNOPENED',
  'DELIVERED_NOT_UNBOXED',
  'ARRIVING_TODAY',
  'STALLED',
  'TRACKING_UNAVAILABLE',
  'IN_TRANSIT',
  'AWAITING_TRACKING',
  'CARRIER_MISMATCH',
  'PENDING_CARRIER',
  'UNKNOWN',
  'WRONG_DESTINATION',
] as const;
export type DeliveryState = (typeof DELIVERY_STATES)[number];

export function isDeliveryState(v: unknown): v is DeliveryState {
  return typeof v === 'string' && (DELIVERY_STATES as readonly string[]).includes(v);
}

// ── Shared predicate fragments (defined once) ─────────────────────────────── Wave-2 reader cutover:
const NOT_UNBOXED_STREET = `NOT EXISTS (
             SELECT 1 FROM receiving_unbox ru_ds
              WHERE ru_ds.receiving_id = r.id
                AND ru_ds.organization_id = r.organization_id
                AND ru_ds.unboxed_at IS NOT NULL
           )`;
const DELIVERED_UNOPENED = `stn.is_delivered = true\n           AND NOT ${SHIPMENT_SCANNED_PREDICATE}`;
/** Carrier delivered + dock-scanned + still not unboxed (CASE badge only). */
const DELIVERED_NOT_UNBOXED_CASE = `stn.is_delivered = true
           AND ${SHIPMENT_SCANNED_PREDICATE}
           AND COALESCE(rl.quantity_received, 0) = 0
           AND ${NOT_UNBOXED_STREET}
           AND rl.workflow_status NOT IN (
             'UNBOXED','AWAITING_TEST','IN_TEST','PASSED','DONE','FAILED','RTV','SCRAP'
           )`;
/**
 * Broader facet: carrier delivered and warehouse has not unboxed yet
 * (includes unscanned delivered — overlaps DELIVERED_UNOPENED intentionally).
 * Dedicated list feed uses the same predicate; CASE uses the scanned-only arm.
 */
const DELIVERED_NOT_UNBOXED_WHERE = `stn.is_delivered = true
           AND COALESCE(rl.quantity_received, 0) = 0
           AND (r.id IS NULL OR ${NOT_UNBOXED_STREET})
           AND rl.workflow_status NOT IN (
             'UNBOXED','AWAITING_TEST','IN_TEST','PASSED','DONE','FAILED','RTV','SCRAP'
           )`;
const ARRIVING_TODAY = `stn.latest_status_category = 'OUT_FOR_DELIVERY'`;
const STALLED = `stn.id IS NOT NULL
           AND COALESCE(stn.is_terminal, false) = false
           AND COALESCE(stn.is_delivered, false) = false
           AND (
             stn.has_exception = true
             OR (
               stn.latest_event_at IS NOT NULL
               AND stn.latest_event_at < (NOW() - interval '72 hours')
             )
           )`;
const TRACKING_UNAVAILABLE = `stn.tracking_blocked_reason IS NOT NULL
           AND COALESCE(stn.is_delivered, false) = false`;
const IN_TRANSIT = `stn.latest_status_category IN ('IN_TRANSIT','ACCEPTED','LABEL_CREATED')`;
const AWAITING_TRACKING = `stn.id IS NULL`;
const RECEIVED = `COALESCE(rl.quantity_received, 0) > 0 OR rl.workflow_status <> 'EXPECTED'`;
// PENDING_CARRIER: the CASE arm runs after CARRIER_MISMATCH + AWAITING_TRACKING,
// so it only checks for a missing/unknown status; the standalone WHERE re-adds the
// "tracking exists" + "not a mismatch" guards.
const PENDING_CARRIER_CASE = `stn.latest_status_category IS NULL OR stn.latest_status_category = 'UNKNOWN'`;
const PENDING_CARRIER_WHERE = `stn.id IS NOT NULL
            AND (stn.latest_status_category IS NULL OR stn.latest_status_category = 'UNKNOWN')
            AND NOT ${CARRIER_MISMATCH_PREDICATE}`;

interface DeliveryStateBucket {
  state: DeliveryState;
  /** Predicate for the ordered SELECT CASE; null = not a CASE arm (facet-only / ELSE). */
  caseWhen: string | null;
  /** Self-contained predicate for the WHERE facet; null = not a facet (CASE-only). */
  whereStandalone: string | null;
}

/**
 * The bucket list, in SELECT-CASE order. The CASE is built top-to-bottom; the
 * WHERE facet picks one bucket's `whereStandalone`. UNKNOWN is the CASE ELSE.
 */
export const DELIVERY_STATE_BUCKETS: ReadonlyArray<DeliveryStateBucket> = [
  { state: 'RECEIVED', caseWhen: RECEIVED, whereStandalone: null }, // incoming view filters to EXPECTED → no facet
  { state: 'DELIVERED_UNOPENED', caseWhen: DELIVERED_UNOPENED, whereStandalone: DELIVERED_UNOPENED },
  // CASE = scanned+not-unboxed; WHERE = broader delivered+not-unboxed (asymmetry like PENDING_CARRIER).
  // Facet kept for Unbox deep-links; Incoming hunt tiles no longer expose this rose bucket.
  { state: 'DELIVERED_NOT_UNBOXED', caseWhen: DELIVERED_NOT_UNBOXED_CASE, whereStandalone: DELIVERED_NOT_UNBOXED_WHERE },
  { state: 'ARRIVING_TODAY', caseWhen: ARRIVING_TODAY, whereStandalone: ARRIVING_TODAY },
  { state: 'STALLED', caseWhen: STALLED, whereStandalone: STALLED },
  { state: 'TRACKING_UNAVAILABLE', caseWhen: TRACKING_UNAVAILABLE, whereStandalone: null }, // CASE-only label
  { state: 'IN_TRANSIT', caseWhen: IN_TRANSIT, whereStandalone: IN_TRANSIT },
  { state: 'AWAITING_TRACKING', caseWhen: AWAITING_TRACKING, whereStandalone: AWAITING_TRACKING },
  { state: 'CARRIER_MISMATCH', caseWhen: CARRIER_MISMATCH_PREDICATE, whereStandalone: CARRIER_MISMATCH_PREDICATE },
  { state: 'PENDING_CARRIER', caseWhen: PENDING_CARRIER_CASE, whereStandalone: PENDING_CARRIER_WHERE },
  { state: 'WRONG_DESTINATION', caseWhen: null, whereStandalone: null }, // facet via dedicated feed / flag
  { state: 'UNKNOWN', caseWhen: null, whereStandalone: null }, // CASE ELSE
];

/** Build the `CASE … END` expression for the computed delivery_state column. */
export function deliveryStateCaseSql(): string {
  const whens = DELIVERY_STATE_BUCKETS.filter((b) => b.caseWhen != null)
    .map((b) => `  WHEN ${b.caseWhen}\n    THEN '${b.state}'`)
    .join('\n');
  return `CASE\n${whens}\n  ELSE 'UNKNOWN'\nEND`;
}

/** The self-contained WHERE predicate for a facet filter, or null if the state has no facet. */
export function deliveryStateWhereSql(state: DeliveryState): string | null {
  return DELIVERY_STATE_BUCKETS.find((b) => b.state === state)?.whereStandalone ?? null;
}

/** The states that are selectable facet filters (have a standalone WHERE). */
export function deliveryStateFacets(): DeliveryState[] {
  return DELIVERY_STATE_BUCKETS.filter((b) => b.whereStandalone != null).map((b) => b.state);
}
