/**
 * Carrier sync health — is each carrier's tracking actually being refreshed?
 * One set-based statement over `shipping_tracking_numbers` (per org for the
 * Fulfilled board, global for the shipping metrics cron) and a pure summary
 * that adds the runtime's configuration fault (credentials missing).
 *
 * `lastOkAt` is the newest SUCCESSFUL poll: since 2026-10-06 only
 * `updateShipmentSummary` stamps `last_checked_at` (`updateShipmentError` no
 * longer does), so "failing since" reads straight off it.
 */

import { missingCarrierCredentials } from './carrier-credentials';
import { isCarrierSyncEnabled } from './enabled-carriers';
import type { CarrierCode } from './types';

/** Fixed order the board and the metrics read carriers in. */
const HEALTH_CARRIERS: readonly CarrierCode[] = ['UPS', 'FEDEX', 'USPS'];

export interface CarrierSyncHealth {
  carrier: CarrierCode;
  /** The sweep polls this carrier (USPS is off pending its IP Agreement — its failures are expected). */
  enabled: boolean;
  /** Non-terminal shipments. */
  open: number;
  /** Non-terminal shipments whose latest poll failed (consecutive_error_count > 0). */
  failingOpen: number;
  /** Newest successful poll over the carrier's shipments (ISO), null when none ever succeeded. */
  lastOkAt: string | null;
  /** Enabled, but this runtime lacks the carrier's credentials: nothing of it is being polled. */
  configFault: boolean;
  /** The newest error message on a failing open shipment. */
  lastError: string | null;
}

/** One row of {@link carrierSyncHealthSql} as the driver returns it. */
export interface CarrierSyncHealthRow {
  carrier: string;
  open: number;
  failing_open: number;
  last_ok_at: string | Date | null;
  last_error: string | null;
}

/**
 * The health statement: one pass over the carrier rows, grouped per carrier.
 * `orgScoped` adds `organization_id = $1` (run it through a tenant connection);
 * the unscoped form is the metrics cron's cross-org view.
 */
export function carrierSyncHealthSql(orgScoped: boolean): string {
  return `SELECT upper(carrier) AS carrier,
       count(*) FILTER (WHERE is_terminal = false)::int AS open,
       count(*) FILTER (WHERE is_terminal = false AND consecutive_error_count > 0)::int AS failing_open,
       max(last_checked_at) AS last_ok_at,
       (array_agg(last_error_message ORDER BY updated_at DESC)
          FILTER (WHERE is_terminal = false AND consecutive_error_count > 0 AND last_error_message IS NOT NULL))[1] AS last_error
  FROM shipping_tracking_numbers
 WHERE upper(carrier) IN ('UPS', 'FEDEX', 'USPS')${orgScoped ? '\n   AND organization_id = $1::uuid' : ''}
 GROUP BY upper(carrier)`;
}

/** The statement's rows → one entry per carrier in {@link HEALTH_CARRIERS} order (zeros when it has no rows). */
export function summarizeCarrierSyncHealth(
  rows: readonly CarrierSyncHealthRow[],
  env: Readonly<Record<string, string | undefined>> = process.env,
): CarrierSyncHealth[] {
  return HEALTH_CARRIERS.map((carrier) => {
    const row = rows.find((r) => r.carrier.toUpperCase() === carrier);
    const enabled = isCarrierSyncEnabled(carrier);
    const lastOk = row?.last_ok_at ?? null;
    return {
      carrier,
      enabled,
      open: row?.open ?? 0,
      failingOpen: row?.failing_open ?? 0,
      lastOkAt: lastOk === null ? null : new Date(lastOk).toISOString(),
      configFault: enabled && missingCarrierCredentials(carrier, env).length > 0,
      lastError: row?.last_error ?? null,
    };
  });
}
