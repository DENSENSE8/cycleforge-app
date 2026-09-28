import 'server-only';
import type { PoolClient } from 'pg';
import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { QcProcedureScope, QcProcedures, QcProcedureVersion } from '@/lib/qc/contracts';

/**
 * Versioned QC procedures (`qc_procedure_versions`). A procedure is the published `qc_check_templates`
 * steps of one scope (a SKU, or a category's SKU-less steps). A version is an immutable snapshot of
 * those steps, cut by `qc_procedure_live_steps()` — the one definition of the snapshot shape (see
 * 2026-09-28u). Every unit checklist answer records the version in force for its step's scope
 * (`tech_verifications.procedure_version_id`); if the live steps drifted from the latest version
 * (a step edited since the last publish) a new version is cut first, so the recorded version is
 * always exactly what the tech answered against.
 */

const VERSION_SELECT = `
  SELECT v.id::int              AS "id",
         v.sku_catalog_id       AS "skuCatalogId",
         v.category             AS "category",
         v.version              AS "version",
         to_json(v.published_at) #>> '{}' AS "publishedAt",
         v.published_by         AS "publishedBy",
         s.name                 AS "publishedByName",
         v.supersedes_id::int   AS "supersedesId",
         v.notes                AS "notes",
         v.steps                AS "steps"
    FROM qc_procedure_versions v
    LEFT JOIN staff s ON s.id = v.published_by`;

/** `v` rows of one scope; params $1 = org, $2 = sku_catalog_id, $3 = category (exactly one non-null). */
const SCOPE_WHERE = `v.organization_id = $1
  AND (($2::int IS NOT NULL AND v.sku_catalog_id = $2) OR ($2::int IS NULL AND v.category = $3))`;

/**
 * SQL expression: the latest procedure version of the scope of the `qc_check_templates` row aliased
 * `qc`. Callers stamp it into tech_verifications after `ensureProcedureVersion` ran for that scope.
 */
export const STEP_PROCEDURE_VERSION_SQL = `(
  SELECT v.id FROM qc_procedure_versions v
   WHERE v.organization_id = qc.organization_id
     AND ((qc.sku_catalog_id IS NOT NULL AND v.sku_catalog_id = qc.sku_catalog_id)
       OR (qc.sku_catalog_id IS NULL AND v.category = qc.category))
   ORDER BY v.version DESC
   LIMIT 1)`;

/**
 * The scope's current version, cutting a new one when the live published steps differ from the
 * latest snapshot. Returns null when the scope has never had published steps. Serialized per scope
 * with a transaction-scoped advisory lock so two concurrent cuts can't race to the same number.
 */
export async function ensureProcedureVersion(
  client: PoolClient,
  orgId: OrgId,
  scope: QcProcedureScope,
  cut: { staffId?: number | null; notes?: string | null } = {},
): Promise<{ version: QcProcedureVersion; changed: boolean } | null> {
  const sku = scope.skuCatalogId ?? null;
  const category = scope.skuCatalogId == null ? scope.category : null;
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
    `qc_procedure:${orgId}:${sku != null ? `sku:${sku}` : `cat:${category}`}`,
  ]);
  const latest = await client.query<{ id: number; version: number; same: boolean }>(
    `SELECT v.id::int AS id, v.version, v.steps = qc_procedure_live_steps($1, $2, $3) AS same
       FROM qc_procedure_versions v
      WHERE ${SCOPE_WHERE}
      ORDER BY v.version DESC
      LIMIT 1`,
    [orgId, sku, category],
  );
  const prev = latest.rows[0];
  let versionId = prev?.id ?? null;
  if (!prev?.same) {
    const inserted = await client.query<{ id: number }>(
      `INSERT INTO qc_procedure_versions
         (organization_id, sku_catalog_id, category, version, published_by, supersedes_id, steps, notes)
       SELECT $1, $2, $3, $4, $5, $6, live.steps, $7
         FROM (SELECT qc_procedure_live_steps($1, $2, $3) AS steps) live
        WHERE $6::bigint IS NOT NULL OR jsonb_array_length(live.steps) > 0
       RETURNING id::int AS id`,
      [orgId, sku, category, (prev?.version ?? 0) + 1, cut.staffId ?? null, prev?.id ?? null, cut.notes ?? null],
    );
    if (inserted.rows.length === 0) return null;
    versionId = inserted.rows[0].id;
  }
  const row = await client.query<QcProcedureVersion>(`${VERSION_SELECT} WHERE v.organization_id = $1 AND v.id = $2`, [
    orgId,
    versionId,
  ]);
  return { version: row.rows[0], changed: !prev?.same };
}

/** Current version id for one step's scope (cutting a new version on drift) — what a checklist answer records. */
export async function currentProcedureVersionId(orgId: OrgId, scope: QcProcedureScope): Promise<number | null> {
  return withTenantTransaction(orgId, async (client) => (await ensureProcedureVersion(client, orgId, scope))?.version.id ?? null);
}

export async function listProcedureVersions(orgId: OrgId, scope: QcProcedureScope): Promise<QcProcedures> {
  const sku = scope.skuCatalogId ?? null;
  const category = scope.skuCatalogId == null ? scope.category : null;
  return withTenantTransaction(orgId, async (client) => {
    const versions = await client.query<QcProcedureVersion>(
      `${VERSION_SELECT} WHERE ${SCOPE_WHERE} ORDER BY v.version DESC`,
      [orgId, sku, category],
    );
    const live = await client.query<{ same: boolean | null; drafts: number; live_steps: number }>(
      `SELECT (SELECT v.steps = qc_procedure_live_steps($1, $2, $3)
                 FROM qc_procedure_versions v WHERE ${SCOPE_WHERE} ORDER BY v.version DESC LIMIT 1) AS same,
              (SELECT COUNT(*)::int FROM qc_check_templates qc
                WHERE qc.organization_id = $1 AND qc.status = 'draft'
                  AND (($2::int IS NOT NULL AND qc.sku_catalog_id = $2)
                    OR ($2::int IS NULL AND qc.sku_catalog_id IS NULL AND qc.category = $3))) AS drafts,
              jsonb_array_length(qc_procedure_live_steps($1, $2, $3)) AS live_steps`,
      [orgId, sku, category],
    );
    const current = versions.rows[0] ?? null;
    const { same, drafts, live_steps: liveSteps } = live.rows[0];
    return {
      versions: versions.rows,
      current,
      dirty: current ? same === false : liveSteps > 0,
      draftSteps: drafts,
    };
  });
}

export type PublishProcedureResult =
  | { ok: true; version: QcProcedureVersion; changed: boolean; publishedDrafts: number }
  | { ok: false; status: 404 | 409; error: string };

/**
 * Publish a scope's procedure: flip its draft steps to published, then cut a version from the live
 * published steps (no new version when nothing changed since the current one).
 */
export async function publishProcedure(
  orgId: OrgId,
  staffId: number,
  scope: QcProcedureScope,
  notes: string | null,
): Promise<PublishProcedureResult> {
  const sku = scope.skuCatalogId ?? null;
  const category = scope.skuCatalogId == null ? scope.category : null;
  return withTenantTransaction(orgId, async (client) => {
    if (sku != null) {
      const exists = await client.query(`SELECT 1 FROM sku_catalog WHERE id = $1 AND organization_id = $2`, [sku, orgId]);
      if (exists.rowCount === 0) return { ok: false, status: 404, error: 'SKU not found' };
    }
    const flipped = await client.query(
      `UPDATE qc_check_templates SET status = 'published'
        WHERE organization_id = $1 AND status = 'draft'
          AND (($2::int IS NOT NULL AND sku_catalog_id = $2)
            OR ($2::int IS NULL AND sku_catalog_id IS NULL AND category = $3))`,
      [orgId, sku, category],
    );
    const cut = await ensureProcedureVersion(client, orgId, scope, { staffId, notes });
    if (!cut) return { ok: false, status: 409, error: 'This procedure has no steps to publish.' };
    return { ok: true, version: cut.version, changed: cut.changed, publishedDrafts: flipped.rowCount ?? 0 };
  });
}
