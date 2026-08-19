/**
 * Server-only: the label face the bench WROTE most recently.
 *
 * SoT for Unbox notes-composer **Recent**:
 *   1. Two candidate sources, ACROSS THE ORG, both skipping the open carton:
 *      lines whose face was written most recently (`face_noted_at`), and the
 *      newest scanned cartons (the legacy source, which still answers for every
 *      row written before the face clock existed)
 *   2. Rank them on ONE axis — `COALESCE(face_noted_at, scanned_at)` — so a
 *      note typed today always outranks an older one, whatever the carton's
 *      scan time
 *   3. Within the winning carton, the freshest face wins — see
 *      {@link pickRecentFaceRow}
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
 * WHY THE WALK IS ORG-WIDE, not "prefer my own scans" (ruled 2026-08-19):
 *
 * Recent repeats the phrase THIS BENCH just put on a sticker, and the bench is
 * shared — one operator scans cartons in at the dock, another unboxes and
 * labels them. Scoping the walk to `scanned_by = me` therefore answered with
 * the newest carton *I* scanned, which on a dogfood bench was **nine days
 * old**: the operator clicked Recent expecting yesterday's phrase and got a
 * sentence from the week before, then saved it onto the carton in hand.
 *
 * The old shape hid it — the org-wide walk existed only as a FALLBACK for an
 * operator with no scans at all, so a stale personal answer always won over a
 * fresh bench one. Staleness is the failure mode that costs a wrong sticker;
 * another operator's phrase from an hour ago never is.
 */

/**
 * WHY THERE IS A SECOND CANDIDATE SOURCE (ruled 2026-08-19):
 *
 * The scan walk alone answers "the newest carton that has a note", which is not
 * the same question as "the note written most recently". An operator who works
 * cartons out of Recent / Queue instead of scanning each one in could type a
 * phrase and never see it again — a carton scanned last week sits far down a
 * walk ordered by scan time, however fresh its note is.
 *
 * `receiving_line.face_noted_at` (2026-08-19a) is the honest clock: it moves
 * only when the face text actually CHANGES, so it cannot be confused with
 * `updated_at`, which bumps on every condition / serial / qty patch and would
 * resurface an ancient sentence the moment someone grades an old carton.
 *
 * It is a SECOND source rather than a replacement because the column was never
 * backfilled — a pre-2026-08-19 row has no honest value to carry, so it keeps
 * ranking by its carton's scan time and nothing regresses for it.
 */

/**
 * Enough rows to cover every line on the newest few scanned cartons. Scans are
 * deduped to one row per carton, so this is a line budget, not a scan budget.
 */
const CANDIDATE_LIMIT = 40;

/**
 * How many recently-written faces to consider. Small on purpose: this is the
 * top of a partial index (`idx_receiving_line_face_noted_at`), and Recent only
 * ever shows one phrase — the rest exist so the carton-level pick below has its
 * siblings to choose from.
 */
const NOTED_FACE_LIMIT = 20;

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
  } = {},
): Promise<RecentFaceRow | null> {
  const exclude =
    opts.excludeLineId != null &&
    Number.isFinite(opts.excludeLineId) &&
    opts.excludeLineId > 0
      ? opts.excludeLineId
      : null;

  const result = await tenantQuery<{
    label_note: string | null;
    notes: string | null;
    line_id: number;
    applied_at: string | null;
    tracking_number: string | null;
    receiving_id: number | null;
    line_updated_at: string | null;
    face_noted_at: string | null;
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
     ),
     scan_faces AS (
       -- Source A — faces on recently SCANNED cartons (the legacy source; the
       -- only one that answers for rows written before the face clock).
       SELECT rl.id AS line_id,
              rl.label_note,
              rl.notes,
              rl.receiving_id,
              rl.updated_at,
              rl.face_noted_at,
              cs.scanned_at,
              cs.tracking_number,
              cs.scan_id
         FROM candidate_scans cs
         JOIN receiving_line rl
           ON rl.receiving_id = cs.receiving_id
          AND rl.organization_id = $1
        WHERE NULLIF(BTRIM(rl.label_note), '') IS NOT NULL
           OR NULLIF(BTRIM(rl.notes), '') IS NOT NULL
     ),
     noted_faces AS (
       -- Source B — faces WRITTEN recently, whatever their carton's scan time.
       -- The lateral picks the carton's newest scan purely for the row's scan
       -- identity (tracking / appliedAt); ranking never uses it when the face
       -- clock is present.
       SELECT rl.id AS line_id,
              rl.label_note,
              rl.notes,
              rl.receiving_id,
              rl.updated_at,
              rl.face_noted_at,
              s.scanned_at,
              s.tracking_number,
              s.scan_id
         FROM receiving_line rl
         LEFT JOIN LATERAL (
           SELECT rs.scanned_at, rs.tracking_number, rs.id AS scan_id
             FROM receiving_scans rs
            WHERE rs.organization_id = $1
              AND rs.receiving_id = rl.receiving_id
            ORDER BY rs.scanned_at DESC NULLS LAST, rs.id DESC
            LIMIT 1
         ) s ON TRUE
        WHERE rl.organization_id = $1
          AND rl.face_noted_at IS NOT NULL
          AND ($2::int IS NULL OR rl.id IS DISTINCT FROM $2)
          AND (
            NOT EXISTS (SELECT 1 FROM exclude_carton)
            OR rl.receiving_id IS DISTINCT FROM (SELECT receiving_id FROM exclude_carton)
          )
          AND (
            NULLIF(BTRIM(rl.label_note), '') IS NOT NULL
            OR NULLIF(BTRIM(rl.notes), '') IS NOT NULL
          )
        ORDER BY rl.face_noted_at DESC
        LIMIT ${NOTED_FACE_LIMIT}
     ),
     faces AS (
       SELECT * FROM scan_faces
       UNION
       SELECT * FROM noted_faces
     )
     SELECT f.label_note,
            f.notes,
            f.line_id,
            f.scanned_at::text AS applied_at,
            f.tracking_number,
            f.receiving_id,
            f.updated_at::text AS line_updated_at,
            f.face_noted_at::text AS face_noted_at
       FROM faces f
      ORDER BY
        -- ONE ranking axis: when the face was written, or when its carton was
        -- scanned for the un-stamped legacy rows.
        COALESCE(f.face_noted_at, f.scanned_at) DESC NULLS LAST,
        f.scan_id DESC NULLS LAST,
        f.updated_at DESC NULLS LAST,
        f.line_id DESC
      LIMIT ${CANDIDATE_LIMIT}`,
    [orgId, exclude],
  );

  const candidates: RecentFaceCandidate[] = result.rows.map((row) => ({
    lineId: row.line_id,
    labelNote: row.label_note,
    notes: row.notes,
    receivingId: row.receiving_id,
    appliedAt: row.applied_at,
    trackingNumber: row.tracking_number,
    lineUpdatedAt: row.line_updated_at,
    faceNotedAt: row.face_noted_at,
  }));

  return pickRecentFaceRow(candidates);
}
