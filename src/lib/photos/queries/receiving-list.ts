import pool from '@/lib/db';
import type { PhotoAspect } from '@/lib/photos/photo-aspects';
import type { PhotoLinkRole } from '@/lib/photos/types';
import {
  receivingPhotoIntentSql,
  type ReceivingPhotoListIntent,
} from '@/lib/receiving/photo-intent';

const LINK_JOINS = `
  INNER JOIN photo_entity_links l ON l.photo_id = p.id AND l.organization_id = p.organization_id
  LEFT JOIN receiving_line rl
         ON l.entity_type = 'RECEIVING_LINE' AND rl.id = l.entity_id
`;

/** Secondary link roles surfaced as booleans. */
const CLAIM_EVIDENCE_ROLE: PhotoLinkRole = 'claim_evidence';
const INSURANCE_SHARE_ROLE: PhotoLinkRole = 'insurance_share';

interface ReceivingPhotoListRow {
  id: number;
  entityType: string;
  entityId: number;
  receivingIdResolved: number | null;
  url: string;
  caption: string | null;
  uploadedBy: number | null;
  createdAt: string;
  /** Device-reported shutter instant (`photos.client_captured_at`), BESIDE the server-INSERT `createdAt` — a queued mobile upload drains… */
  clientCapturedAt: string | null;
  /**
   * What this shot SHOWS, within its stage (`../photo-aspects.ts`). NULL means
   * unclassified evidence — it is the value every pre-2026-08-01b row carries
   * and must never be read as "the photo is missing".
   */
  photoAspect: string | null;
  /** `photos.photo_type` under its real name. */
  photoType: string | null;
  /** This photo also carries a `claim_evidence` link. */
  hasClaimEvidence: boolean;
  /** Same shape for `insurance_share` (carrier / external share packs). */
  hasInsuranceShare: boolean;
}

interface DbRow {
  id: string;
  entity_type: string;
  entity_id: string;
  receiving_id_resolved: string | null;
  caption: string | null;
  uploaded_by: number | null;
  created_at: string;
  client_captured_at: string | null;
  photo_aspect: string | null;
  has_claim_evidence: boolean | null;
  has_insurance_share: boolean | null;
}

/**
 * `$2` / `$3` are the two link roles, bound ahead of every caller-dependent
 * param so this list can stay a module const. Callers push from `$4` on.
 */
const SELECT = `
  DISTINCT ON (p.id)
  p.id,
  l.entity_type,
  l.entity_id,
  CASE
    WHEN l.entity_type = 'RECEIVING' THEN l.entity_id
    WHEN l.entity_type = 'RECEIVING_LINE' THEN rl.receiving_id
    ELSE NULL
  END AS receiving_id_resolved,
  p.photo_type AS caption,
  p.taken_by_staff_id AS uploaded_by,
  p.created_at,
  p.client_captured_at,
  p.photo_aspect,
  EXISTS (
    SELECT 1 FROM photo_entity_links cl
     WHERE cl.photo_id = p.id
       AND cl.organization_id = p.organization_id
       AND cl.link_role = $2
  ) AS has_claim_evidence,
  EXISTS (
    SELECT 1 FROM photo_entity_links il
     WHERE il.photo_id = p.id
       AND il.organization_id = p.organization_id
       AND il.link_role = $3
  ) AS has_insurance_share
`;

function mapRow(row: DbRow, contentUrl: (id: number) => string): ReceivingPhotoListRow {
  return {
    id: Number(row.id),
    entityType: row.entity_type,
    entityId: Number(row.entity_id),
    receivingIdResolved:
      row.receiving_id_resolved != null ? Number(row.receiving_id_resolved) : null,
    url: contentUrl(Number(row.id)),
    caption: row.caption,
    uploadedBy: row.uploaded_by != null ? Number(row.uploaded_by) : null,
    createdAt: row.created_at,
    clientCapturedAt: row.client_captured_at ?? null,
    photoAspect: row.photo_aspect ?? null,
    // Same value as `caption` by construction — see the field docs above.
    photoType: row.caption,
    hasClaimEvidence: row.has_claim_evidence === true,
    hasInsuranceShare: row.has_insurance_share === true,
  };
}

/** List receiving photos via photo_entity_links (Phase E — links only). */
export async function listReceivingPhotos(input: {
  organizationId: string;
  receivingId: number;
  lineId?: number | null;
  scope?: 'po' | 'all';
  /** Filter by capture stage — arrival package vs unbox carton vs item shots. */
  photoIntent?: ReceivingPhotoListIntent;
  /** Narrow WITHIN the intent to specific shots (`../photo-aspects.ts`). */
  photoAspects?: readonly PhotoAspect[];
  contentUrl?: (id: number) => string;
}): Promise<ReceivingPhotoListRow[]> {
  const toUrl = input.contentUrl ?? ((id: number) => `/api/photos/${id}/content`);
  // $1 org, $2/$3 the link roles the SELECT's EXISTS clauses read. Everything
  // caller-dependent pushes from $4 on via `params.length`.
  const params: unknown[] = [input.organizationId, CLAIM_EVIDENCE_ROLE, INSURANCE_SHARE_ROLE];
  let where: string;

  if (input.lineId != null) {
    params.push(input.lineId);
    const lineParam = `$${params.length}`;
    where = `
      p.organization_id = $1
      AND l.entity_type = 'RECEIVING_LINE'
      AND l.entity_id = ${lineParam}`;
  } else if (input.scope === 'po') {
    params.push(input.receivingId);
    const rid = `$${params.length}`;
    where = `
      p.organization_id = $1
      AND l.entity_type = 'RECEIVING'
      AND l.entity_id = ${rid}`;
  } else {
    params.push(input.receivingId);
    const rid = `$${params.length}`;
    where = `
      p.organization_id = $1
      AND (
        (l.entity_type = 'RECEIVING' AND l.entity_id = ${rid})
        OR (l.entity_type = 'RECEIVING_LINE' AND rl.receiving_id = ${rid})
      )`;
  }

  // Stage filter from the SoT — package/unbox_carton pin BOTH entity and type
  // (so mis-typed item-on-carton rows never leak into package peeks); item is
  // entity-only (line evidence is item evidence by the identity law).
  const intentSql = receivingPhotoIntentSql(input.photoIntent ?? 'all');

  // Aspect narrows within the intent; the two axes AND together. Parameterized
  // (unlike the intent fragment, whose values come from a closed TS union) —
  // these arrive from a query string.
  let aspectSql = '';
  if (input.photoAspects && input.photoAspects.length > 0) {
    params.push([...input.photoAspects]);
    aspectSql = ` AND p.photo_aspect = ANY($${params.length}::text[])`;
  }

  const res = await pool.query<DbRow>(
    `SELECT ${SELECT}
       FROM photos p
       ${LINK_JOINS}
      WHERE ${where}${intentSql}${aspectSql}
      ORDER BY p.id ASC, p.created_at ASC`,
    params,
  );

  return res.rows.map((r) => mapRow(r, toUrl));
}

export function sqlReceivingPhotoCount(receivingIdExpr: string, orgIdExpr: string): string {
  return `(SELECT COUNT(DISTINCT p.id)
     FROM photos p
     INNER JOIN photo_entity_links l ON l.photo_id = p.id AND l.organization_id = p.organization_id
     LEFT JOIN receiving_line rl_ph
            ON l.entity_type = 'RECEIVING_LINE' AND rl_ph.id = l.entity_id
    WHERE p.organization_id = ${orgIdExpr}
      AND ${receivingIdExpr} IS NOT NULL
      AND (
        (l.entity_type = 'RECEIVING' AND l.entity_id = ${receivingIdExpr})
        OR (l.entity_type = 'RECEIVING_LINE' AND rl_ph.receiving_id = ${receivingIdExpr})
      ))`;
}

/**
 * Parameterized photo count for one receiving carton. Bind `[orgId, receivingId]`.
 * `$2::int` is required — Postgres cannot infer the type inside the subquery.
 */
export const SQL_SELECT_RECEIVING_PHOTO_COUNT = `SELECT ${sqlReceivingPhotoCount('$2::int', '$1')}::int AS photo_count`;

export async function countReceivingPhotos(
  organizationId: string,
  receivingId: number,
): Promise<number> {
  const res = await pool.query<{ photo_count: string }>(SQL_SELECT_RECEIVING_PHOTO_COUNT, [
    organizationId,
    receivingId,
  ]);
  return Number(res.rows[0]?.photo_count ?? 0);
}

export function sqlPoLevelPhotoCount(receivingIdExpr: string, orgIdExpr: string): string {
  return `(SELECT COUNT(DISTINCT p.id)
     FROM photos p
     INNER JOIN photo_entity_links l ON l.photo_id = p.id AND l.organization_id = p.organization_id
    WHERE p.organization_id = ${orgIdExpr}
      AND ${receivingIdExpr} IS NOT NULL
      AND l.entity_type = 'RECEIVING'
      AND l.entity_id = ${receivingIdExpr})`;
}

/** Stage-filtered carton photo count — {@link sqlPoLevelPhotoCount} with the entity AND photo_type pinned via `receivingPhotoIntentSql`, so… */
export function sqlCartonStagePhotoCount(
  receivingIdExpr: string,
  orgIdExpr: string,
  intent: Extract<ReceivingPhotoListIntent, 'package' | 'unbox_carton'>,
): string {
  return `(SELECT COUNT(DISTINCT p.id)
     FROM photos p
     INNER JOIN photo_entity_links l ON l.photo_id = p.id AND l.organization_id = p.organization_id
    WHERE p.organization_id = ${orgIdExpr}
      AND ${receivingIdExpr} IS NOT NULL
      AND l.entity_id = ${receivingIdExpr}${receivingPhotoIntentSql(intent)})`;
}

export function sqlLinePhotoCount(lineIdExpr: string, orgIdExpr: string): string {
  return `(SELECT COUNT(DISTINCT p.id)
     FROM photos p
     INNER JOIN photo_entity_links l ON l.photo_id = p.id AND l.organization_id = p.organization_id
    WHERE p.organization_id = ${orgIdExpr}
      AND l.entity_type = 'RECEIVING_LINE'
      AND l.entity_id = ${lineIdExpr})`;
}

export function sqlLineIdsPhotoCount(lineIdsParam: string, orgIdExpr: string): string {
  return `(SELECT COUNT(DISTINCT p.id)
     FROM photos p
     INNER JOIN photo_entity_links l ON l.photo_id = p.id AND l.organization_id = p.organization_id
    WHERE p.organization_id = ${orgIdExpr}
      AND l.entity_type = 'RECEIVING_LINE'
      AND l.entity_id = ANY(${lineIdsParam}))`;
}

export async function getReceivingPhotosByIds(input: {
  organizationId: string;
  receivingId: number;
  photoIds: number[];
}): Promise<Array<{ id: number; url: string | null }>> {
  if (input.photoIds.length === 0) return [];
  const res = await pool.query<{ id: string }>(
    `SELECT DISTINCT ON (p.id) p.id
       FROM photos p
       ${LINK_JOINS}
      WHERE p.organization_id = $1
        AND p.id = ANY($2::int[])
        AND (
          (l.entity_type = 'RECEIVING' AND l.entity_id = $3)
          OR (l.entity_type = 'RECEIVING_LINE' AND rl.receiving_id = $3)
        )
      ORDER BY p.id ASC`,
    [input.organizationId, input.photoIds, input.receivingId],
  );
  return res.rows.map((r) => ({
    id: Number(r.id),
    url: `/api/photos/${r.id}/content`,
  }));
}

export async function listAllReceivingPhotoIds(
  organizationId: string,
  receivingId: number,
): Promise<number[]> {
  const rows = await listReceivingPhotos({ organizationId, receivingId, scope: 'all' });
  return rows.map((r) => r.id);
}

export async function getReceivingPhotoDeleteMeta(
  photoId: number,
  organizationId: string,
): Promise<{
  receivingId: number | null;
  receivingLineId: number | null;
} | null> {
  const res = await pool.query<{
    entity_type: string;
    entity_id: string;
    receiving_id_resolved: string | null;
  }>(
    `SELECT
       l.entity_type,
       l.entity_id,
       CASE
         WHEN l.entity_type = 'RECEIVING' THEN l.entity_id
         WHEN l.entity_type = 'RECEIVING_LINE' THEN rl.receiving_id
         ELSE NULL
       END AS receiving_id_resolved
       FROM photos p
       ${LINK_JOINS}
      WHERE p.id = $1
        AND p.organization_id = $2
        AND l.entity_type IN ('RECEIVING', 'RECEIVING_LINE')`,
    [photoId, organizationId],
  );
  const row = res.rows[0];
  if (!row) return null;
  const isLine = row.entity_type === 'RECEIVING_LINE';
  return {
    receivingId:
      row.receiving_id_resolved != null ? Number(row.receiving_id_resolved) : null,
    receivingLineId: isLine ? Number(row.entity_id) : null,
  };
}
