/**
 * Per-aspect photo counts for ONE OPEN CARTON.
 *
 * The guided Unbox procedure has three steps that are all `unbox_carton` stage
 * evidence — shipping label · the box · packing material — and one item step
 * whose completion depends on which aspects the org made required. None of
 * those questions can be answered by a stage count, so this is the read the
 * gates in `derive-capture-step-states.ts` consume.
 *
 * ## Deliberately NOT in the queue SQL
 *
 * These counts are resolved for the carton the operator has OPEN, one carton at
 * a time. Folding ten per-aspect counts into the receiving list query would put
 * ten correlated subqueries on every row of a several-hundred-row queue to
 * serve a surface showing one of them — the altitude regression
 * `.claude/rules/build-gotchas.md` catalogues, and a Neon CU-hour bill for a
 * number nothing on that screen renders. One grouped query per open carton is
 * the whole cost.
 *
 * ## Shape
 *
 * A `Partial<Record<PhotoAspect, number>>`: a missing key is zero, and the
 * unclassified rows (`photo_aspect IS NULL` — every pre-2026-08-01b photo) are
 * excluded rather than bucketed. NULL means *unclassified evidence*, not
 * *evidence of aspect X*, so it must never inflate an aspect's count and thereby
 * complete a step nobody worked.
 *
 * `Deps`-injected per, so the unit test runs
 * with zero DB.
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { parsePhotoAspect, type PhotoAspect } from '@/lib/photos/photo-aspects';

export type PhotoAspectCounts = Partial<Record<PhotoAspect, number>>;

interface AspectCountRow {
  photo_aspect: string | null;
  n: string | number;
}

export interface AspectCountsDeps {
  query: (orgId: OrgId, sql: string, params: unknown[]) => Promise<{ rows: AspectCountRow[] }>;
}

const defaultDeps: AspectCountsDeps = {
  query: (orgId, sql, params) => tenantQuery<AspectCountRow>(orgId, sql, params),
};

/**
 * Rows → counts. Values that are not in the vocabulary are DROPPED, not coerced:
 * the CHECK constraint makes them impossible today, and a row that somehow
 * carried one is unclassifiable, not evidence of the nearest aspect.
 */
function toCounts(rows: AspectCountRow[]): PhotoAspectCounts {
  const out: PhotoAspectCounts = {};
  for (const row of rows) {
    const aspect = parsePhotoAspect(row.photo_aspect);
    if (!aspect) continue;
    const n = Number(row.n);
    if (!Number.isFinite(n) || n <= 0) continue;
    out[aspect] = (out[aspect] ?? 0) + n;
  }
  return out;
}

/**
 * Per-aspect counts of this carton's own (`RECEIVING`-linked) photos.
 *
 * Entity-scoped rather than photo_type-scoped on purpose: the aspect vocabulary
 * already separates arrival shots (`shipping_label` / `box_exterior` are legal
 * at both stages) from bench shots by which STAGE they were written at, and the
 * write waist enforces that pairing. Counting by entity keeps this one grouped
 * scan instead of a second join onto the type vocabulary.
 */
export async function cartonAspectCounts(
  orgId: OrgId,
  receivingId: number,
  deps: AspectCountsDeps = defaultDeps,
): Promise<PhotoAspectCounts> {
  const res = await deps.query(
    orgId,
    `SELECT p.photo_aspect, COUNT(DISTINCT p.id) AS n
       FROM photos p
       INNER JOIN photo_entity_links l
               ON l.photo_id = p.id AND l.organization_id = p.organization_id
      WHERE p.organization_id = $1
        AND l.entity_type = 'RECEIVING'
        AND l.entity_id = $2::int
        AND p.photo_aspect IS NOT NULL
      GROUP BY p.photo_aspect`,
    [orgId, receivingId],
  );
  return toCounts(res.rows);
}

/** Per-aspect counts of ONE LINE's item photos (`RECEIVING_LINE`-linked). */
export async function lineAspectCounts(
  orgId: OrgId,
  receivingLineId: number,
  deps: AspectCountsDeps = defaultDeps,
): Promise<PhotoAspectCounts> {
  const res = await deps.query(
    orgId,
    `SELECT p.photo_aspect, COUNT(DISTINCT p.id) AS n
       FROM photos p
       INNER JOIN photo_entity_links l
               ON l.photo_id = p.id AND l.organization_id = p.organization_id
      WHERE p.organization_id = $1
        AND l.entity_type = 'RECEIVING_LINE'
        AND l.entity_id = $2::int
        AND p.photo_aspect IS NOT NULL
      GROUP BY p.photo_aspect`,
    [orgId, receivingLineId],
  );
  return toCounts(res.rows);
}
