/** Cross-system patch: */

import pool from '@/lib/db';
import { registerShipmentPermissive } from '@/lib/shipping/sync-shipment';

export interface LinkTrackingArgs {
  /** Zoho internal PO id — the join key shared by mirror + receiving. */
  zoho_purchaseorder_id: string;
  /** Raw tracking candidates pulled from the email body. */
  trackingCandidates: ReadonlyArray<string>;
  /** Free-form source tag for audit (e.g. 'po-gmail.reconcile'). */
  sourceSystem: string;
  /** Tenant that owns this PO reconcile — stamps the STN write. */
  organizationId: string;
}

export interface LinkTrackingResult {
  /** Receiving rows that already had a shipment_id — left untouched. */
  alreadyLinked: number;
  /** Successfully created+stamped shipment_id during this run. */
  linked: number;
  /** Candidates rejected by registerShipmentPermissive (bad format / too short). */
  rejectedCandidates: number;
}

/**
 * For each receiving row matching `zoho_purchaseorder_id` AND missing a
 * shipment_id, register the first valid tracking candidate and stamp the
 * resulting shipment_id. Returns aggregate counts for the run summary.
 */
export async function linkTrackingToPo(
  args: LinkTrackingArgs,
): Promise<LinkTrackingResult> {
  const result: LinkTrackingResult = {
    alreadyLinked: 0,
    linked: 0,
    rejectedCandidates: 0,
  };

  const candidates = args.trackingCandidates.filter((c) => c && c.trim());
  if (candidates.length === 0) return result;

  // Receiving rows for this PO. `source = 'zoho_po'` excludes operator-
  // created unmatched cartons (those carry their own tracking already).
  const r = await pool.query<{ id: number; shipment_id: number | null }>(
    `SELECT id, shipment_id
       FROM receiving_carton
      WHERE zoho_purchaseorder_id = $1
        AND source = 'zoho_po'`,
    [args.zoho_purchaseorder_id],
  );

  const rows = r.rows;
  if (rows.length === 0) return result;

  for (const row of rows) {
    if (row.shipment_id != null) {
      result.alreadyLinked++;
      continue;
    }

    let registered: { id: number } | null = null;
    for (const raw of candidates) {
      const shipment = await registerShipmentPermissive({
        trackingNumber: raw,
        sourceSystem: args.sourceSystem,
      }, args.organizationId);
      if (shipment?.id) {
        registered = { id: Number(shipment.id) };
        break;
      }
      result.rejectedCandidates++;
    }

    if (!registered) continue;

    // Only stamp when the column is still NULL — race-safe against any
    // concurrent operator scan that may have linked tracking via the
    // station scan bar between our SELECT and this UPDATE.
    const upd = await pool.query(
      `UPDATE receiving_carton
          SET shipment_id = $1,
              updated_at  = NOW()
        WHERE id = $2
          AND shipment_id IS NULL
        RETURNING id`,
      [registered.id, row.id],
    );
    if ((upd.rowCount ?? 0) > 0) result.linked++;
  }

  return result;
}
