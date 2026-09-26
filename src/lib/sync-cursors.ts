/** Per-org sync watermarks (`sync_cursors`). */
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
