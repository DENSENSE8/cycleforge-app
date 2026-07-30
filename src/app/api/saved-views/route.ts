import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { createSavedView, listSavedViews, type SavedViewRow } from '@/lib/saved-views/saved-views-queries';
import { isGenericSavedViewSurface } from '@/lib/saved-views/surfaces';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';

/**
 * GET  /api/saved-views?surface=… — caller's own + org-shared views for one
 *   dashboard/station surface (not operations / media_library — those keep
 *   their dedicated routes).
 * POST /api/saved-views — create a named view (body must include `surface`).
 *
 * Gated on `dashboard.view` — the same read permission Outbound / station
 * history operators already hold to see these surfaces. Ownership boundary is
 * `staff_id`; no new RBAC permission.
 */

function readSurface(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const surface = readSurface(req.nextUrl.searchParams.get('surface'));
      if (!surface || !isGenericSavedViewSurface(surface)) {
        return NextResponse.json(
          { success: false, error: 'A valid generic surface query param is required' },
          { status: 400 },
        );
      }
      const views: SavedViewRow[] = await listSavedViews(
        ctx.organizationId,
        ctx.staffId,
        surface,
      );
      return NextResponse.json({ success: true, views });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list saved views';
      console.error('[GET /api/saved-views] error:', error);
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
  { permission: 'dashboard.view' },
);

export const POST = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      const surface = readSurface(raw.surface);
      if (!surface || !isGenericSavedViewSurface(surface)) {
        return NextResponse.json(
          { success: false, error: 'A valid generic surface is required' },
          { status: 400 },
        );
      }
      const name = typeof raw.name === 'string' ? raw.name.trim() : '';
      if (!name) {
        return NextResponse.json({ success: false, error: 'A view name is required' }, { status: 400 });
      }
      const filters =
        raw.filters && typeof raw.filters === 'object' ? (raw.filters as Record<string, unknown>) : {};
      if (JSON.stringify(filters).length > 8192) {
        return NextResponse.json({ success: false, error: 'Filter payload too large' }, { status: 400 });
      }
      const isShared = raw.isShared === true;
      const sortOrder = Number.isFinite(Number(raw.sortOrder)) ? Number(raw.sortOrder) : 0;

      const view = await createSavedView(
        { surface, name, filters, isShared, sortOrder },
        ctx.organizationId,
        ctx.staffId,
      );

      await recordAudit(pool, ctx, req, {
        source: 'saved-views-api',
        action: AUDIT_ACTION.SAVED_VIEW_CREATE,
        entityType: AUDIT_ENTITY.SAVED_VIEW,
        entityId: view.id,
        after: { ...view },
      });

      return NextResponse.json({ success: true, view }, { status: 201 });
    } catch (error: unknown) {
      if ((error as { code?: string })?.code === '23505') {
        return NextResponse.json(
          { success: false, error: 'A view with that name already exists' },
          { status: 409 },
        );
      }
      const message = error instanceof Error ? error.message : 'Failed to create saved view';
      console.error('[POST /api/saved-views] error:', error);
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
  { permission: 'dashboard.view' },
);
