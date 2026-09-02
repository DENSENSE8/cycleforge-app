/**
 * PATCH /api/nav/child-order — persist desk page tab order only.
 *
 * The editor is the DeskPageChrome tab row (hold-drag DeskTab). This route is
 * storage: existing child ids, no mint/delete, not a Studio screen.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { tenantQuery } from '@/lib/tenancy/db';
import { parseNavDefinition } from '@/lib/nav/org-nav';
import { persistActiveNavDefinition } from '@/lib/nav/persist-nav-definition';
import { reorderDeskTabs } from '@/lib/nav/reorder-desk-tabs';
import { parseBody } from '@/lib/schemas/parse';
import { NavChildOrderBody } from '@/lib/schemas/nav-child-order';
import { AUDIT_ACTION } from '@/lib/audit-logs';

export const dynamic = 'force-dynamic';

export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(NavChildOrderBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    const { rows } = await tenantQuery<{ config: unknown }>(
      ctx.organizationId,
      `SELECT config FROM nav_definitions
        WHERE organization_id = $1 AND is_active = TRUE
        ORDER BY version DESC LIMIT 1`,
      [ctx.organizationId],
    );
    const current = rows[0] ? parseNavDefinition(rows[0].config) : null;
    const next = reorderDeskTabs({
      pageId: parsed.pageId,
      orderedIds: parsed.orderedIds,
      current,
    });
    if (!next.ok) {
      const status = next.error === 'UNKNOWN_PAGE' ? 404 : 422;
      return NextResponse.json(
        { success: false, error: next.error },
        { status },
      );
    }

    const published = await persistActiveNavDefinition({
      organizationId: ctx.organizationId,
      staffId: ctx.staffId,
      definition: next.definition,
      ctx,
      req,
      action: AUDIT_ACTION.NAV_TAB_REORDER,
      after: {
        pageId: parsed.pageId,
        orderedIds: parsed.orderedIds,
        entries: next.definition.entries.length,
      },
    });

    if (!published) {
      return NextResponse.json({ success: false, error: 'Publish produced no row' }, { status: 500 });
    }
    return NextResponse.json({
      success: true,
      id: published.id,
      version: published.version,
      definition: next.definition,
    });
  } catch (error) {
    return errorResponse(error, 'PATCH /api/nav/child-order');
  }
}, { permission: 'dashboard.view' });
