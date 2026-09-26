/** Per-aspect photo counts for ONE OPEN CARTON. */

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

/** Per-aspect counts of this carton's own (`RECEIVING`-linked) photos. */
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
