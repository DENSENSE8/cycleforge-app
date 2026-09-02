/**
 * PUT /api/nav — persist a full nav override (hide / rename / child order).
 * Desk tabs still reorder on the tab row; PATCH /api/nav/child-order is the
 * order-only write. This PUT remains the full-document publish.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { tenantQuery } from '@/lib/tenancy/db';
import { parseNavDefinition } from '@/lib/nav/org-nav';
import { persistActiveNavDefinition } from '@/lib/nav/persist-nav-definition';
import { AUDIT_ACTION } from '@/lib/audit-logs';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (_req: NextRequest, ctx) => {
  try {
    const { rows } = await tenantQuery<{ config: unknown; version: number }>(
      ctx.organizationId,
      `SELECT config, version FROM nav_definitions
        WHERE organization_id = $1 AND is_active = TRUE
        ORDER BY version DESC LIMIT 1`,
      [ctx.organizationId],
    );
    const definition = rows[0] ? parseNavDefinition(rows[0].config) : null;
    return NextResponse.json({ success: true, definition, version: rows[0]?.version ?? null });
  } catch (error) {
    return errorResponse(error, 'GET /api/nav');
  }
}, { permission: 'dashboard.view' });

export const PUT = withAuth(async (req: NextRequest, ctx) => {
  try {
    const raw = await req.json().catch(() => ({}));
    const definition = parseNavDefinition(raw);
    if (!definition) {
      return NextResponse.json(
        { success: false, error: 'INVALID_NAV_DEFINITION', hint: 'expected { entries: [...] }' },
        { status: 422 },
      );
    }

    const published = await persistActiveNavDefinition({
      organizationId: ctx.organizationId,
      staffId: ctx.staffId,
      definition,
      ctx,
      req,
      action: AUDIT_ACTION.NAV_PUBLISH,
      after: { entries: definition.entries.length },
    });

    if (!published) {
      return NextResponse.json({ success: false, error: 'Publish produced no row' }, { status: 500 });
    }
    return NextResponse.json({ success: true, id: published.id, version: published.version });
  } catch (error) {
    return errorResponse(error, 'PUT /api/nav');
  }
}, { permission: 'studio.manage', stepUp: true });
