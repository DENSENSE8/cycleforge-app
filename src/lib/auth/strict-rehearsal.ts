import type { NextRequest } from 'next/server';
import type { AuthContext } from './auth-context';
import type { AuthorizationMode } from './authorization-mode';
import type { PermissionString } from './permissions-shared';
import { AUDIT_ACTION, AUDIT_ENTITY, recordAudit } from '@/lib/audit-logs';

type Queryable = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

type TenantQuery = (
  organizationId: string,
  text: string,
  params?: ReadonlyArray<unknown>,
) => Promise<{ rows: Array<Record<string, unknown>> }>;

export const STRICT_REHEARSAL_WINDOW_DAYS = 30;
export const STRICT_REHEARSAL_MAX_ROWS = 100;

export function isProspectiveStrictDenial(input: {
  mode: AuthorizationMode;
  storedPermissions: ReadonlySet<PermissionString>;
  permission: PermissionString;
}): boolean {
  return input.mode === 'authenticated-only' && !input.storedPermissions.has(input.permission);
}

/** Record a non-blocking signal for a request that strict mode would refuse. */
export async function recordProspectiveStrictDenial(
  db: Queryable,
  ctx: AuthContext,
  req: Pick<NextRequest, 'headers' | 'method' | 'nextUrl'>,
  permission: PermissionString,
): Promise<boolean> {
  if (!isProspectiveStrictDenial({
    mode: ctx.authorizationMode,
    storedPermissions: ctx.storedPermissions,
    permission,
  })) return false;

  await recordAudit(db, ctx, req, {
    source: 'authorization-rehearsal',
    action: AUDIT_ACTION.AUTHORIZATION_PROSPECTIVE_DENIAL,
    entityType: AUDIT_ENTITY.AUTHORIZATION_POLICY,
    entityId: permission,
    method: 'system',
    extra: {
      authorization_mode: ctx.authorizationMode,
      path: req.nextUrl.pathname,
      request_method: req.method,
      role_keys: ctx.user.roles.map((role) => role.key),
    },
  });
  return true;
}

export interface StrictRehearsalIssue {
  permission: string;
  staffId: number | null;
  staffName: string;
  actorRole: string | null;
  path: string;
  requestMethod: string;
  requestCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface StrictRehearsalReport {
  windowDays: number;
  totalRequests: number;
  permissionCount: number;
  affectedStaffCount: number;
  issues: StrictRehearsalIssue[];
}

/** Aggregate tenant-scoped rehearsal signals into role-repair work. */
export async function loadStrictRehearsalReport(
  query: TenantQuery,
  organizationId: string,
  windowDays = STRICT_REHEARSAL_WINDOW_DAYS,
): Promise<StrictRehearsalReport> {
  const days = Math.max(1, Math.min(90, Math.floor(windowDays)));
  const result = await query(
    organizationId,
    `WITH grouped AS (
       SELECT
         al.entity_id AS permission,
         al.actor_staff_id,
         COALESCE(s.name, 'Unknown staff') AS staff_name,
         al.actor_role,
         COALESCE(al.metadata->>'path', 'Unknown route') AS path,
         COALESCE(al.metadata->>'request_method', 'UNKNOWN') AS request_method,
         COUNT(*)::int AS request_count,
         MIN(al.created_at) AS first_seen_at,
         MAX(al.created_at) AS last_seen_at
       FROM audit_logs al
       LEFT JOIN staff s
         ON s.id = al.actor_staff_id
        AND s.organization_id = al.organization_id
       WHERE al.organization_id = $1
         AND al.action = $2
         AND al.created_at >= NOW() - make_interval(days => $3::int)
       GROUP BY
         al.entity_id,
         al.actor_staff_id,
         s.name,
         al.actor_role,
         al.metadata->>'path',
         al.metadata->>'request_method'
     ), summary AS (
       SELECT
         COALESCE(SUM(request_count), 0)::int AS total_requests,
         COUNT(DISTINCT permission)::int AS permission_count,
         COUNT(DISTINCT actor_staff_id)::int AS affected_staff_count
       FROM grouped
     )
     SELECT grouped.*, summary.total_requests, summary.permission_count, summary.affected_staff_count
       FROM grouped
       CROSS JOIN summary
      ORDER BY grouped.last_seen_at DESC, grouped.request_count DESC
      LIMIT $4`,
    [
      organizationId,
      AUDIT_ACTION.AUTHORIZATION_PROSPECTIVE_DENIAL,
      days,
      STRICT_REHEARSAL_MAX_ROWS,
    ],
  );

  const first = result.rows[0];
  return {
    windowDays: days,
    totalRequests: Number(first?.total_requests ?? 0),
    permissionCount: Number(first?.permission_count ?? 0),
    affectedStaffCount: Number(first?.affected_staff_count ?? 0),
    issues: result.rows.map((row) => ({
      permission: String(row.permission),
      staffId: row.actor_staff_id == null ? null : Number(row.actor_staff_id),
      staffName: String(row.staff_name),
      actorRole: row.actor_role == null ? null : String(row.actor_role),
      path: String(row.path),
      requestMethod: String(row.request_method),
      requestCount: Number(row.request_count),
      firstSeenAt: new Date(String(row.first_seen_at)).toISOString(),
      lastSeenAt: new Date(String(row.last_seen_at)).toISOString(),
    })),
  };
}
