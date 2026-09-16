/**
 * Per-org sync watermarks (`sync_cursors`).
 *
 * The table is keyed on the COMPOSITE (organization_id, resource) — see
 * migration 2026-07-11c_sync_cursors_per_org_key.sql, applied in prod. The
 * caller change landed late: between 2026-07-11 and 2026-09-15 these helpers
 * still said `ON CONFLICT (resource)`, so EVERY cursor advance threw
 * "no unique or exclusion constraint matching the ON CONFLICT specification".
 * Consequences observed in prod: `zoho.po_sync` failed 173 times and the
 * `zoho_po_mirror` cursor froze at 2026-07-11, so each 15-minute "delta" run
 * replayed two months of Zoho POs. Keep the ON CONFLICT target and the PK in
 * lockstep.
 *
 * `orgId` defaults to the transitional USAV org for session-less jobs that have
 * no tenant in hand; every caller that knows its org MUST pass it, otherwise a
 * second tenant's watermark lands on USAV's row.
 */
import pool from '@/lib/db';
import { transitionalDogfoodOrgId } from '@/lib/tenancy/db';

export async function getSyncCursor(resource: string, orgId?: string): Promise<Date | null> {
  const org = orgId ?? transitionalDogfoodOrgId();
  const res = await pool.query<{ last_synced_at: string | null }>(
    `SELECT last_synced_at
     FROM sync_cursors
     WHERE organization_id = $2::uuid
       AND resource = $1
     LIMIT 1`,
    [resource, org]
  ).catch(() => ({ rows: [] as Array<{ last_synced_at: string | null }> }));

  const raw = res.rows[0]?.last_synced_at;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function updateSyncCursor(
  resource: string,
  lastSyncedAt: Date,
  orgId?: string,
): Promise<void> {
  const org = orgId ?? transitionalDogfoodOrgId();
  await pool.query(
    `INSERT INTO sync_cursors (resource, last_synced_at, organization_id)
     VALUES ($1, $2, $3::uuid)
     ON CONFLICT (organization_id, resource) DO UPDATE SET
       last_synced_at = EXCLUDED.last_synced_at,
       updated_at = NOW()`,
    [resource, lastSyncedAt.toISOString(), org]
  );
}
