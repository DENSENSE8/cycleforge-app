/**
 * `nav_recents` store — the server home of the sidebar's "recently opened"
 * lists that used to live only in localStorage (see surfaces.ts for which).
 *
 * One upsert statement per open: the MRU bump AND the per-surface cap trim run
 * in a single SQL statement (data-modifying CTE), so a staffer's list for a
 * surface never exceeds its cap and costs one statement inside one tenant
 * transaction. Every predicate is a leakproof text/int/uuid equality on the
 * `(organization_id, staff_id, surface, …)` index prefix, so it stays an Index
 * Cond under forced RLS as app_tenant (phase0-findings §Schema 0).
 */

import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

export interface NavRecentDbRow {
  entity_type: string;
  entity_id: string;
  label_snapshot: string;
  opened_at: Date | string;
}

export interface NavRecentKey {
  orgId: OrgId;
  staffId: number;
  surface: string;
}

export interface NavRecentWrite extends NavRecentKey {
  entityType: string;
  entityId: string;
  label: string;
  /** Rows kept for (org, staff, surface) after this write, including it. */
  cap: number;
}

export interface NavRecentsStoreDeps {
  /** Read on the tenant GUC path. */
  read(orgId: OrgId, sql: string, params: readonly unknown[]): Promise<NavRecentDbRow[]>;
  /** Write inside one tenant transaction. */
  write(orgId: OrgId, sql: string, params: readonly unknown[]): Promise<void>;
}

export const defaultNavRecentsStoreDeps: NavRecentsStoreDeps = {
  read: async (orgId, sql, params) => (await tenantQuery<NavRecentDbRow & Record<string, unknown>>(orgId, sql, params)).rows,
  write: async (orgId, sql, params) => {
    await withTenantTransaction(orgId, (client) => client.query(sql, params as unknown[]));
  },
};

/*
 * All CTEs of one statement read the same pre-statement snapshot, and a row
 * the upsert touched must not be touched again by the DELETE. So `keep` is the
 * newest (cap − 1) OTHER entities from that snapshot, and the DELETE spares the
 * upserted entity by key: net result = the opened entity + its cap − 1 newest
 * neighbours. `$7` is cap − 1 (computed by the caller, never negative).
 */
export const UPSERT_AND_TRIM_SQL = `
  WITH upsert AS (
    INSERT INTO nav_recents
      (organization_id, staff_id, surface, entity_type, entity_id, label_snapshot, opened_at)
    VALUES ($1, $2, $3, $4, $5, $6, now())
    ON CONFLICT (organization_id, staff_id, surface, entity_type, entity_id)
    DO UPDATE SET label_snapshot = EXCLUDED.label_snapshot, opened_at = EXCLUDED.opened_at
    RETURNING id
  ),
  keep AS (
    SELECT id
      FROM nav_recents
     WHERE organization_id = $1 AND staff_id = $2 AND surface = $3
       AND NOT (entity_type = $4 AND entity_id = $5)
     ORDER BY opened_at DESC, id DESC
     LIMIT $7
  )
  DELETE FROM nav_recents d
   WHERE d.organization_id = $1 AND d.staff_id = $2 AND d.surface = $3
     AND NOT (d.entity_type = $4 AND d.entity_id = $5)
     AND d.id NOT IN (SELECT id FROM keep)
`;

export const LIST_SQL = `
  SELECT entity_type, entity_id, label_snapshot, opened_at
    FROM nav_recents
   WHERE organization_id = $1 AND staff_id = $2 AND surface = $3
   ORDER BY opened_at DESC, id DESC
   LIMIT $4
`;

export async function upsertNavRecent(
  input: NavRecentWrite,
  deps: NavRecentsStoreDeps = defaultNavRecentsStoreDeps,
): Promise<void> {
  const cap = Math.max(1, Math.floor(input.cap));
  await deps.write(input.orgId, UPSERT_AND_TRIM_SQL, [
    input.orgId,
    input.staffId,
    input.surface,
    input.entityType,
    input.entityId,
    input.label,
    cap - 1,
  ]);
}

export async function listNavRecentRows(
  key: NavRecentKey & { limit: number },
  deps: NavRecentsStoreDeps = defaultNavRecentsStoreDeps,
): Promise<NavRecentDbRow[]> {
  return deps.read(key.orgId, LIST_SQL, [key.orgId, key.staffId, key.surface, key.limit]);
}
