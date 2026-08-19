/**
 * Server-only: intended putaway location from the **most recent staged
 * carton that is not the open one**.
 *
 * SoT for Unbox notes-composer **Last entry**:
 *   1. Walk `receiving_line_putaway` newest-first (this operator when known,
 *      else org), skipping the open line's carton
 *   2. First row with a non-null `staged_location_id` wins
 *
 * Never device-local storage / last-clicked bin.
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  toStagedLocationFace,
  type StagedLocationCandidate,
  type StagedLocationFace,
} from './recent-staged-location';

export async function fetchMostRecentStagedLocation(
  orgId: OrgId,
  opts: {
    excludeLineId?: number | null;
    /** Prefer this operator's stages (Unbox bench). */
    staffId?: number | null;
  } = {},
): Promise<StagedLocationFace | null> {
  const exclude =
    opts.excludeLineId != null &&
    Number.isFinite(opts.excludeLineId) &&
    opts.excludeLineId > 0
      ? opts.excludeLineId
      : null;
  const staffId =
    opts.staffId != null && Number.isFinite(opts.staffId) && opts.staffId > 0
      ? opts.staffId
      : null;

  const result = await tenantQuery<{
    staged_location_id: number;
    line_id: number;
    receiving_id: number | null;
    staged_at: string | null;
    staged_by: number | null;
    name: string | null;
    barcode: string | null;
    room: string | null;
    row_label: string | null;
    col_label: string | null;
  }>(
    orgId,
    `WITH exclude_carton AS (
       SELECT rl0.receiving_id
         FROM receiving_line rl0
        WHERE $2::int IS NOT NULL
          AND rl0.id = $2
          AND rl0.organization_id = $1
        LIMIT 1
     )
     SELECT rlp.staged_location_id,
            rl.id AS line_id,
            rl.receiving_id,
            rlp.staged_at::text AS staged_at,
            rlp.staged_by,
            loc.name,
            loc.barcode,
            loc.room,
            loc.row_label,
            loc.col_label
       FROM receiving_line_putaway rlp
       JOIN receiving_line rl
         ON rl.id = rlp.receiving_line_id
        AND rl.organization_id = $1
       JOIN locations loc
         ON loc.id = rlp.staged_location_id
        AND loc.organization_id = $1
      WHERE rlp.organization_id = $1
        AND rlp.staged_location_id IS NOT NULL
        AND rlp.staged_at IS NOT NULL
        AND (
          NOT EXISTS (SELECT 1 FROM exclude_carton)
          OR rl.receiving_id IS DISTINCT FROM (SELECT receiving_id FROM exclude_carton)
        )
        AND ($3::int IS NULL OR rlp.staged_by = $3)
      ORDER BY rlp.staged_at DESC NULLS LAST, rlp.receiving_line_id DESC
      LIMIT 1`,
    [orgId, exclude, staffId],
  );

  const row = result.rows[0];
  if (!row) return null;
  const candidate: StagedLocationCandidate = {
    locationId: row.staged_location_id,
    lineId: row.line_id,
    receivingId: row.receiving_id,
    stagedAt: row.staged_at,
    stagedBy: row.staged_by,
    name: row.name,
    barcode: row.barcode,
    room: row.room,
    rowLabel: row.row_label,
    colLabel: row.col_label,
  };
  return toStagedLocationFace(candidate);
}
