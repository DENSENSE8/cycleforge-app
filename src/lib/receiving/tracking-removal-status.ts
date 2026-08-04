/**
 * "I pasted 40 trackings and only saw 34 — where are the other 6?"
 *
 * Resolves a paste list against everything this org knows about those
 * trackings, so the bulk-filter panel can report its residuals honestly:
 * **not found at all** (no inbound shipment in this org) vs **found but
 * normally hidden** (it left the Incoming lane, and here is why).
 *
 * This is NOT a second search engine and not a second list query. It is an
 * exact-key resolve over the same spine `?tracking_in=` filters on, run once
 * for the whole paste so the answer is independent of the list's pagination —
 * a residual computed from page 1 of a 50-row page would over-report
 * "not found" the moment a paste matched more than a page.
 *
 * The reason itself is NOT decided here: this function gathers signals and
 * hands them to {@link resolveIncomingRemovalReason}, the one ladder the
 * recently-removed lane also uses. Two surfaces, one derivation.
 *
 * Server deps load lazily so the pure shaping stays unit-testable.
 */

import {
  INBOUND_SOURCE_SYSTEMS,
  SHIPMENT_SCAN_MATCH_CONDITION,
} from '@/lib/receiving/delivered-unscanned';
import { isZohoReceivedLikeStatus } from '@/lib/receiving/zoho-received-status';
import {
  DELIVERED_UNSCANNED_WINDOW_DAYS,
  isVendorCancelledStatus,
  resolveIncomingRemovalReason,
  type IncomingRemovalReason,
} from '@/lib/receiving/incoming-removal-reason';
import { parseTrackingKeys } from '@/lib/receiving/tracking-paste';
import type { OrgId } from '@/lib/tenancy/constants';

/** What the org knows about one pasted tracking. */
export interface TrackingRemovalStatusRow {
  /** The operator's original string, so the report reads back what they pasted. */
  tracking: string;
  /** Canonical key — what the filter actually sent. */
  key: string;
  /** An inbound shipment row exists in this org for this tracking. */
  known: boolean;
  /** Why it is off the Incoming lane, or `null` when it is still on it. */
  reason: IncomingRemovalReason | null;
  /**
   * The PO this tracking resolved to, when one did.
   *
   * The row is keyed by a tracking number, but the operator navigates by the
   * PO — it is the handle on the pick list, the carton label and the vendor
   * email, and it is what the reason chips now name ("PO cancelled"). Reported
   * from the SAME `zoho_po_mirror` row the status came from, so the number and
   * the status can never describe two different POs.
   */
  po_number: string | null;
  /** Purchasing-source PO status, and the age of that answer. */
  zoho_status: string | null;
  zoho_status_synced_at: string | null;
  /** The carton, when one is linked — lets the panel deep-link the row. */
  receiving_id: number | null;
}

export interface TrackingRemovalStatusResult {
  rows: TrackingRemovalStatusRow[];
  /** Canonical keys the org has no inbound shipment for. */
  not_found: string[];
  /** Keys that exist but have left the default Incoming lane, with reasons. */
  hidden: TrackingRemovalStatusRow[];
  stats: {
    /** Unique keys the operator supplied, BEFORE the cap. */
    requested: number;
    /** Keys actually resolved (and sent as `?tracking_in=`). */
    applied: number;
    /** Keys the cap dropped — stated, never swallowed. */
    truncated: number;
    not_found: number;
    hidden: number;
  };
}

interface StatusRow {
  canon: string;
  delivered: boolean;
  delivered_at: string | null;
  scanned: boolean;
  unboxed: boolean;
  written_off: boolean;
  zoho_status: string | null;
  zoho_status_synced_at: string | null;
  po_number: string | null;
  receiving_id: number | null;
}

type TrackingStatusLookupFn = (
  orgId: OrgId,
  keys: string[],
) => Promise<StatusRow[]>;

interface TrackingRemovalStatusDeps {
  lookup?: TrackingStatusLookupFn;
  /** Injectable for tests; defaults to the real clock. */
  now?: () => number;
}

const INBOUND_SOURCE_SQL = INBOUND_SOURCE_SYSTEMS.map((s) => `'${s}'`).join(',');

/**
 * One indexed query for the whole paste.
 *
 * Tenant scoping: `shipping_tracking_numbers` and `zoho_po_mirror` both carry
 * `organization_id` under FORCE RLS, so `tenantQuery` scopes them; every
 * org-bearing alias reached through the join is additionally pinned to `$2`,
 * the same belt-and-braces the sibling check applies.
 *
 * The shipment join is a plain indexed equality on `tracking_number_normalized`
 * (unique btree) with no last-8 tolerance — what an operator pastes IS the
 * canonical stored form, and the tolerance exists for SCANNED barcodes, which
 * `SHIPMENT_SCAN_MATCH_CONDITION` already handles on its own side.
 */
async function lookupTrackingStatus(orgId: OrgId, keys: string[]): Promise<StatusRow[]> {
  const { tenantQuery } = await import('@/lib/tenancy/db');
  if (keys.length === 0) return [];

  const { rows } = await tenantQuery<StatusRow>(
    orgId,
    `WITH keys AS (SELECT DISTINCT unnest($1::text[]) AS canon)
     SELECT DISTINCT ON (k.canon)
            k.canon,
            COALESCE(stn.is_delivered, false)                     AS delivered,
            stn.delivered_at::text                                AS delivered_at,
            EXISTS (
              SELECT 1
                FROM receiving_scans rs
                LEFT JOIN receiving_carton r2
                  ON r2.id = rs.receiving_id AND r2.organization_id = $2
               WHERE rs.organization_id = $2
                 AND ${SHIPMENT_SCAN_MATCH_CONDITION}
            )                                                     AS scanned,
            EXISTS (
              SELECT 1
                FROM receiving_carton r3
                LEFT JOIN receiving_unbox ru
                  ON ru.receiving_id = r3.id AND ru.organization_id = r3.organization_id
                LEFT JOIN receiving_line rl
                  ON rl.receiving_id = r3.id AND rl.organization_id = r3.organization_id
               WHERE r3.shipment_id = stn.id
                 AND r3.organization_id = $2
                 AND (ru.unboxed_at IS NOT NULL OR COALESCE(rl.quantity_received, 0) > 0)
            )                                                     AS unboxed,
            EXISTS (
              SELECT 1
                FROM receiving_exceptions rx
                JOIN receiving_line rl_x
                  ON rl_x.id = rx.receiving_line_id AND rl_x.organization_id = rx.organization_id
               WHERE rx.organization_id = $2
                 AND rx.status = 'OPEN'
                 AND rx.exception_code IN ('LOST_IN_TRANSIT','EMPTY_BOX','MISDELIVERED','STOLEN')
                 AND rl_x.receiving_id = carton.id
            )                                                     AS written_off,
            mirror.status                                         AS zoho_status,
            mirror.last_synced_at::text                           AS zoho_status_synced_at,
            mirror.zoho_purchaseorder_number                      AS po_number,
            carton.id                                             AS receiving_id
       FROM keys k
       JOIN shipping_tracking_numbers stn
         ON stn.tracking_number_normalized = k.canon
       LEFT JOIN LATERAL (
         SELECT rc.id, rc.zoho_purchaseorder_id
           FROM receiving_carton rc
          WHERE rc.shipment_id = stn.id AND rc.organization_id = $2
          ORDER BY rc.id DESC
          LIMIT 1
       ) carton ON TRUE
       -- The PO is reached through the carton when one is linked, else by the
       -- Reference# the vendor put on the PO (the same match the ERP check
       -- makes). A tracking with neither simply has no vendor answer.
       LEFT JOIN LATERAL (
         SELECT m.status, m.last_synced_at, m.zoho_purchaseorder_number
           FROM zoho_po_mirror m
          WHERE (carton.zoho_purchaseorder_id IS NOT NULL
                 AND m.zoho_purchaseorder_id = carton.zoho_purchaseorder_id)
             OR (COALESCE(m.reference_number, '') <> ''
                 AND NULLIF(upper(regexp_replace(m.reference_number, '[^A-Za-z0-9]', '', 'g')), '') = k.canon)
          ORDER BY (carton.zoho_purchaseorder_id IS NOT NULL
                    AND m.zoho_purchaseorder_id = carton.zoho_purchaseorder_id) DESC,
                   m.last_synced_at DESC NULLS LAST
          LIMIT 1
       ) mirror ON TRUE
      WHERE (
              carton.id IS NOT NULL
              OR stn.source_system IN (${INBOUND_SOURCE_SQL})
            )
      ORDER BY k.canon,
               COALESCE(stn.is_delivered, false) DESC,
               stn.delivered_at DESC NULLS LAST,
               stn.id DESC`,
    [keys, orgId],
  );
  return rows;
}

/**
 * Resolve a paste into its residual report.
 *
 * Never throws for a lookup failure — an empty result would claim "none of
 * these exist", which is a stronger statement than the check can make. A failed
 * lookup rejects so the caller can say the residual report is unavailable
 * rather than quietly reporting zero.
 */
export async function resolveTrackingRemovalStatus(
  orgId: OrgId,
  input: string | string[],
  deps: TrackingRemovalStatusDeps = {},
): Promise<TrackingRemovalStatusResult> {
  const selection = parseTrackingKeys(input);
  const lookup = deps.lookup ?? lookupTrackingStatus;
  const now = deps.now ?? Date.now;

  const found = selection.keys.length > 0 ? await lookup(orgId, selection.keys) : [];
  const byKey = new Map(found.map((r) => [r.canon, r]));

  const rows: TrackingRemovalStatusRow[] = selection.keys.map((key, i) => {
    const hit = byKey.get(key);
    const display = selection.display[i] ?? key;
    if (!hit) {
      return {
        tracking: display,
        key,
        known: false,
        reason: null,
        zoho_status: null,
        zoho_status_synced_at: null,
        po_number: null,
        receiving_id: null,
      };
    }

    const deliveredAtMs = hit.delivered_at ? Date.parse(hit.delivered_at) : NaN;
    const agedOut =
      hit.delivered
      && !hit.scanned
      && Number.isFinite(deliveredAtMs)
      && now() - deliveredAtMs > DELIVERED_UNSCANNED_WINDOW_DAYS * 86_400_000;

    return {
      tracking: display,
      key,
      known: true,
      reason: resolveIncomingRemovalReason({
        delivered: hit.delivered,
        scanned: hit.scanned,
        unboxed: hit.unboxed,
        writtenOff: hit.written_off,
        vendorReceived: isZohoReceivedLikeStatus(hit.zoho_status),
        vendorCancelled: isVendorCancelledStatus(hit.zoho_status),
        agedOut,
      }),
      zoho_status: hit.zoho_status ?? null,
      zoho_status_synced_at: hit.zoho_status_synced_at ?? null,
      po_number: hit.po_number?.trim() || null,
      receiving_id: hit.receiving_id != null ? Number(hit.receiving_id) : null,
    };
  });

  const not_found = rows.filter((r) => !r.known).map((r) => r.key);
  const hidden = rows.filter((r) => r.known && r.reason != null);

  return {
    rows,
    not_found,
    hidden,
    stats: {
      requested: selection.requested,
      applied: selection.keys.length,
      truncated: selection.truncated,
      not_found: not_found.length,
      hidden: hidden.length,
    },
  };
}
