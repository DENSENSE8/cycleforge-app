/**
 * `view=exceptions` SQL — server only (the predicates it composes live beside
 * the DB helpers). The codes and their words are in `incoming-exceptions.ts`.
 */

import {
  CARRIER_MISMATCH_PREDICATE,
  DELIVERED_UNSCANNED_WINDOW_DAYS,
  SHIPMENT_SCANNED_PREDICATE,
} from '@/lib/receiving/delivered-unscanned';
import { DELIVERED_OVERDUE_HOURS } from '@/lib/receiving/incoming-exceptions';
import { ZOHO_RECEIVED_LIKE_STATUSES, ZOHO_TERMINAL_STATUSES } from '@/lib/receiving/zoho-received-status';

const RECEIVED_LIKE_SQL = ZOHO_RECEIVED_LIKE_STATUSES.map((s) => `'${s}'`).join(',');

/**
 * A Zoho PO that is still somebody's problem: open, OR received-like (billed,
 * closed, received — the ERP-ahead case). Cancelled / rejected POs are not
 * inbound work and never an exception. References `mirror`.
 */
export const EXCEPTION_PO_LIVE_SQL = `COALESCE(mirror.status, '') NOT IN (${ZOHO_TERMINAL_STATUSES
  .filter((status) => !(ZOHO_RECEIVED_LIKE_STATUSES as readonly string[]).includes(status))
  .map((status) => `'${status}'`)
  .join(',')})`;

/** ZIP5 of a SQL postal expression, or '' (same rule as `normalizePostalCode`). */
function zip5Sql(expr: string): string {
  return `left(regexp_replace(COALESCE(${expr}, ''), '[^0-9]', '', 'g'), 5)`;
}

/**
 * The line's exception code, or NULL. References `rl`, `ru`, `rt`, `stn`,
 * `stn_evt`, `mirror`, `rz`. `warehouseZipParam` is the `$n` holding the
 * org's ship-from ZIP5; null when unset, and then wrong-destination never
 * fires (no crying wolf).
 *
 * Physical-first, like the Check: receipt evidence on the row itself (units
 * received, past EXPECTED, unboxed, door-received) is the first arm, so a
 * received line is never labelled. The tracking-scan match
 * (`SHIPMENT_SCANNED_PREDICATE`) is a correlated EXISTS too costly to run per
 * row twice (measured 2.8s of a 4.4s count), so it lives ONCE, in
 * {@link incomingExceptionMembershipSql} — use that for membership, never
 * this CASE alone.
 */
export function incomingExceptionCodeSql(warehouseZipParam: string | null): string {
  const wrongDestination = warehouseZipParam
    ? `WHEN COALESCE(stn.is_delivered, false) = true
             AND length(${zip5Sql('stn_evt.event_postal_code')}) = 5
             AND ${zip5Sql('stn_evt.event_postal_code')} <> ${warehouseZipParam}
            THEN 'WRONG_DESTINATION'`
    : '';
  return `(CASE
            WHEN COALESCE(rl.quantity_received, 0) > 0
              OR rl.workflow_status <> 'EXPECTED'
              OR ru.unboxed_at IS NOT NULL
              OR rt.door_received_at IS NOT NULL
            THEN NULL
            ${wrongDestination}
            WHEN rz.zoho_purchaseorder_id IS NOT NULL
             AND COALESCE(mirror.status, '') IN (${RECEIVED_LIKE_SQL})
             -- The Check judges the PO, not the line: one received line means
             -- the warehouse DID take this PO in, so a leftover line is not the
             -- ERP running ahead (it falls through to its own carrier reason).
             AND NOT EXISTS (
               SELECT 1 FROM receiving_line_zoho rz_po
                 JOIN receiving_line rl_po ON rl_po.id = rz_po.receiving_line_id
                                          AND rl_po.organization_id = rz_po.organization_id
                WHERE rz_po.organization_id = rl.organization_id
                  AND rz_po.zoho_purchaseorder_id = rz.zoho_purchaseorder_id
                  AND (COALESCE(rl_po.quantity_received, 0) > 0 OR rl_po.workflow_status <> 'EXPECTED')
             )
            THEN 'ERP_AHEAD'
            WHEN COALESCE(stn.is_delivered, false) = true
             AND stn.delivered_at < NOW() - interval '${DELIVERED_OVERDUE_HOURS} hours'
             AND stn.delivered_at > NOW() - interval '${DELIVERED_UNSCANNED_WINDOW_DAYS} days'
            THEN 'DELIVERED_OVERDUE'
            WHEN stn.id IS NOT NULL
             AND COALESCE(stn.is_terminal, false) = false
             AND COALESCE(stn.is_delivered, false) = false
             AND (stn.has_exception = true
                  OR (stn.latest_event_at IS NOT NULL AND stn.latest_event_at < (NOW() - interval '72 hours')))
            THEN 'STALLED'
            WHEN stn.tracking_blocked_reason IS NOT NULL
             AND COALESCE(stn.is_delivered, false) = false
            THEN 'TRACKING_UNAVAILABLE'
            WHEN ${CARRIER_MISMATCH_PREDICATE}
            THEN 'CARRIER_MISMATCH'
          END)`;
}

/**
 * `view=exceptions` membership: the line is not tracking-scanned here AND it
 * has a code. The scan match runs once, as an anti join.
 */
export function incomingExceptionMembershipSql(warehouseZipParam: string | null): string {
  return `NOT ${SHIPMENT_SCANNED_PREDICATE}
         AND ${incomingExceptionCodeSql(warehouseZipParam)} IS NOT NULL`;
}
