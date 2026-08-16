/**
 * Server-only: label-face note from the **most recent scanned carton that
 * actually has a note**.
 *
 * SoT for Unbox notes-composer **Recent**:
 *   1. Walk `receiving_scans` newest-first (this operator when known, else org)
 *      skipping the open line's carton
 *   2. First carton that has a non-empty `receiving_line.label_note`
 *      (fallback `notes`) wins — never stop at a blank last-scan carton
 *
 * Table SoT: physical spine is `receiving_line` (singular). The legacy
 * plural compat view omits `label_note` — querying it for face text
 * throws and Recent paints nothing.
 *
 * Never device-local storage / MRU phrase bank.
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { pickLabelFaceNote } from './recent-label-note';

type RecentLabelNoteRow = {
  note: string;
  lineId: number;
  appliedAt: string | null;
  trackingNumber?: string | null;
  receivingId?: number | null;
};

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
): Promise<RecentLabelNoteRow | null> {
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
     candidate_scans AS (
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
     )
     SELECT rl.label_note,
            rl.notes,
            rl.id AS line_id,
            cs.scanned_at::text AS applied_at,
            cs.tracking_number,
            cs.receiving_id
       FROM candidate_scans cs
       JOIN receiving_line rl
         ON rl.receiving_id = cs.receiving_id
        AND rl.organization_id = $1
      WHERE NULLIF(BTRIM(rl.label_note), '') IS NOT NULL
         OR NULLIF(BTRIM(rl.notes), '') IS NOT NULL
      ORDER BY
        cs.scanned_at DESC NULLS LAST,
        cs.scan_id DESC,
        CASE WHEN NULLIF(BTRIM(rl.label_note), '') IS NOT NULL THEN 0 ELSE 1 END,
        rl.updated_at DESC NULLS LAST,
        rl.id DESC
      LIMIT 1`,
    [orgId, exclude, staffId],
  );

  const row = result.rows[0];
  if (!row) return null;
  const note = pickLabelFaceNote({
    labelNote: row.label_note,
    notes: row.notes,
  });
  if (!note) return null;
  return {
    note,
    lineId: row.line_id,
    appliedAt: row.applied_at,
    trackingNumber: row.tracking_number,
    receivingId: row.receiving_id,
  };
}
