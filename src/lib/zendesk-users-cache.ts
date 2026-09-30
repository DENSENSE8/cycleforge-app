/** DB cache of Zendesk users (id → name/email/photo) so the support thread can resolve comment authors WITHOUT pinging the Zendesk API on… */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { ZendeskUser } from '@/lib/zendesk';

interface CachedZendeskUser {
  id: number;
  name: string;
  email: string | null;
  photo: string | null;
  role: string | null;
}

/** Cached identities for the given ids, keyed by Zendesk user id. Misses are absent. */
export async function getCachedUsers(
  organizationId: OrgId,
  ids: number[],
): Promise<Map<number, CachedZendeskUser>> {
  const unique = Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0)));
  const out = new Map<number, CachedZendeskUser>();
  if (!unique.length) return out;

  const r = await tenantQuery<{
    zendesk_user_id: string | number;
    name: string | null;
    email: string | null;
    photo_url: string | null;
    role: string | null;
  }>(
    organizationId,
    `SELECT zendesk_user_id, name, email, photo_url, role
       FROM zendesk_users
      WHERE organization_id = $1
        AND zendesk_user_id = ANY($2::bigint[])`,
    [organizationId, unique],
  );
  for (const row of r.rows) {
    const id = Number(row.zendesk_user_id);
    out.set(id, {
      id,
      name: row.name ?? `User #${id}`,
      email: row.email,
      photo: row.photo_url,
      role: row.role,
    });
  }
  return out;
}

/** Upsert a batch of resolved Zendesk users (one statement), refreshing synced_at. */
export async function upsertCachedUsers(
  organizationId: OrgId,
  users: ZendeskUser[],
): Promise<void> {
  // Last entry per id wins — ON CONFLICT cannot touch one row twice.
  const byId = new Map<number, ZendeskUser>();
  for (const u of users) if (Number.isInteger(u.id) && u.id > 0) byId.set(u.id, u);
  if (!byId.size) return;
  await tenantQuery(
    organizationId,
    `INSERT INTO zendesk_users (organization_id, zendesk_user_id, name, email, photo_url, role)
     SELECT $1::uuid, x.id, x.name, x.email, x.photo, x.role
       FROM jsonb_to_recordset($2::jsonb) AS x(id bigint, name text, email text, photo text, role text)
     ON CONFLICT (organization_id, zendesk_user_id)
     DO UPDATE SET name = EXCLUDED.name,
                   email = EXCLUDED.email,
                   photo_url = EXCLUDED.photo_url,
                   role = EXCLUDED.role,
                   synced_at = NOW()`,
    [
      organizationId,
      JSON.stringify(
        [...byId.values()].map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          photo: u.photo,
          role: u.role,
        })),
      ),
    ],
  );
}

/**
 * Given the helpdesk's current assignable roster, clear the agent/admin role on
 * cached users no longer on it (role unknown until next resolved), so a roster
 * read from this cache matches the live one.
 */
export async function demoteFormerAgents(
  organizationId: OrgId,
  agentIds: number[],
): Promise<void> {
  await tenantQuery(
    organizationId,
    `UPDATE zendesk_users
        SET role = NULL, synced_at = NOW()
      WHERE organization_id = $1
        AND role IN ('agent', 'admin')
        AND NOT (zendesk_user_id = ANY($2::bigint[]))`,
    [organizationId, agentIds],
  );
}
