/**
 * Server-only: label-face note from the **most recent scanned carton that
 * actually has a note**.
 *
 * SoT for Unbox notes-composer **Recent**:
 *   1. Walk `receiving_scans` newest-first (this operator when known, else org),
 *      one row per carton, skipping the open line's carton
 *   2. First carton that has any face text on a line wins — never stop at a
 *      blank last-scan carton
 *   3. Within that carton, the line touched most recently (`updated_at`) owns
 *      the face the operator just labeled — see {@link pickRecentFaceRow}
 *
 * Face text itself resolves through {@link pickLabelFaceNote}: `notes` (the
 * Unbox dock draft that drives the sticker center and gets stamped onto
 * `label_note` at carton print) before the older `label_note`.
 *
 * Table SoT: physical spine is `receiving_line` (singular). The legacy
 * plural compat view omits `label_note` — querying it for face text
 * throws and Recent paints nothing.
 *
 * Never device-local storage / MRU phrase bank.
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  pickRecentFaceRow,
  type RecentFaceCandidate,
  type RecentFaceRow,
} from './recent-label-note';

/**
 * Enough rows to cover every line on the newest few scanned cartons. Scans are
 * deduped to one row per carton, so this is a line budget, not a scan budget.
 */
const CANDIDATE_LIMIT = 40;

/**
 * How far back the scan walk reaches. Recent means recent — a bench that has
 * not put a face note on any of its last {@link SCAN_WALK_LIMIT} scanned
 * cartons has nothing useful to repeat.
 */
const SCAN_WALK_LIMIT = 200;

/**
 * Face note on the newest scanned tracking carton that has a non-empty
 * label/notes line. `excludeLineId` skips the open carton's tracking so
 * Recent never echoes the line you're already on.
 *
 * Walks scans (not “last scan then hope”) — a blank last carton yields the
 * prior scanned carton that does have a face note.
 */
export async function fetchMostRecentProcessedLabelNote(
  orgId: OrgId,
  opts: {
    excludeLineId?: number | null;
    /** Prefer this operator's scans (Unbox bench). */
    staffId?: number | null;
  } = {},
): Promise<RecentFaceRow | null> {
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
    label_note: string | null;
    notes: string | null;
    line_id: number;
    applied_at: string | null;
    tracking_number: string | null;
    receiving_id: number | null;
    line_updated_at: string | null;
  }>(
    orgId,
    `WITH exclude_carton AS (
       SELECT rl0.receiving_id
         FROM receiving_line rl0
        WHERE $2::int IS NOT NULL
          AND rl0.id = $2
          AND rl0.organization_id = $1
        LIMIT 1
     ),
     recent_scans AS (
       -- Pre-limit the walk: Recent only ever reaches back a few cartons, and
       -- an unbounded sort of the org's whole scan history runs on every
       -- carton open. There is no (organization_id, scanned_at) index, so this
       -- stays a bounded top-N instead of growing with the table.
       SELECT rs.receiving_id,
              rs.tracking_number,
              rs.scanned_at,
              rs.id AS scan_id
         FROM receiving_scans rs
        WHERE rs.organization_id = $1
          AND rs.receiving_id IS NOT NULL
          AND (
            NOT EXISTS (SELECT 1 FROM exclude_carton)
            OR rs.receiving_id IS DISTINCT FROM (SELECT receiving_id FROM exclude_carton)
          )
          AND ($3::int IS NULL OR rs.scanned_by = $3)
        ORDER BY rs.scanned_at DESC NULLS LAST, rs.id DESC
        LIMIT ${SCAN_WALK_LIMIT}
     ),
     candidate_scans AS (
       -- One row per carton (its newest scan) so a re-scanned carton cannot
       -- crowd its own sibling lines out of the row budget below.
       SELECT DISTINCT ON (cs0.receiving_id)
              cs0.receiving_id,
              cs0.tracking_number,
              cs0.scanned_at,
              cs0.scan_id
         FROM recent_scans cs0
        ORDER BY cs0.receiving_id, cs0.scanned_at DESC NULLS LAST, cs0.scan_id DESC
     )
     SELECT rl.label_note,
            rl.notes,
            rl.id AS line_id,
            cs.scanned_at::text AS applied_at,
            cs.tracking_number,
            cs.receiving_id,
            rl.updated_at::text AS line_updated_at
       FROM candidate_scans cs
       JOIN receiving_line rl
         ON rl.receiving_id = cs.receiving_id
        AND rl.organization_id = $1
      WHERE NULLIF(BTRIM(rl.label_note), '') IS NOT NULL
         OR NULLIF(BTRIM(rl.notes), '') IS NOT NULL
      ORDER BY
        cs.scanned_at DESC NULLS LAST,
        cs.scan_id DESC,
        rl.updated_at DESC NULLS LAST,
        rl.id DESC
      LIMIT ${CANDIDATE_LIMIT}`,
    [orgId, exclude, staffId],
  );

  const candidates: RecentFaceCandidate[] = result.rows.map((row) => ({
    lineId: row.line_id,
    labelNote: row.label_note,
    notes: row.notes,
    receivingId: row.receiving_id,
    appliedAt: row.applied_at,
    trackingNumber: row.tracking_number,
    lineUpdatedAt: row.line_updated_at,
  }));

  return pickRecentFaceRow(candidates);
}
