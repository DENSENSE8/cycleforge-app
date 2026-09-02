import type { NextRequest } from 'next/server';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import type { AuthContext } from '@/lib/auth/auth-context';
import type { NavDefinition } from '@/lib/nav/org-nav';
import { withTenantTransaction } from '@/lib/tenancy/db';

export async function persistActiveNavDefinition(args: {
  organizationId: string;
  staffId: number;
  definition: NavDefinition;
  ctx: AuthContext;
  req: NextRequest;
  action: typeof AUDIT_ACTION.NAV_PUBLISH | typeof AUDIT_ACTION.NAV_TAB_REORDER;
  after: Record<string, unknown>;
}): Promise<{ id: number; version: number } | null> {
  return withTenantTransaction(args.organizationId, async (client) => {
    const { rows } = await client.query<{ id: number; version: number }>(
      `WITH deactivated AS (
         UPDATE nav_definitions
            SET is_active = FALSE, updated_at = NOW()
          WHERE organization_id = $1 AND is_active = TRUE
          RETURNING version
       )
       INSERT INTO nav_definitions (organization_id, config, version, is_active, updated_by)
       VALUES (
         $1, $2::jsonb,
         COALESCE((SELECT MAX(version) FROM nav_definitions WHERE organization_id = $1), 0) + 1,
         TRUE, $3
       )
       RETURNING id, version`,
      [args.organizationId, JSON.stringify(args.definition), args.staffId],
    );
    const row = rows[0];
    if (!row) return null;
    await recordAudit(client, args.ctx, args.req, {
      source: 'nav-api',
      action: args.action,
      entityType: AUDIT_ENTITY.NAV_DEFINITION,
      entityId: row.id,
      after: { version: row.version, ...args.after },
    });
    return row;
  });
}
