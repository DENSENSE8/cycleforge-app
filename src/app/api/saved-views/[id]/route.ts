import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import {
  deleteSavedView,
  getSavedView,
  updateSavedView,
} from '@/lib/saved-views/saved-views-queries';
import { isGenericSavedViewSurface } from '@/lib/saved-views/surfaces';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';

/**
 * PATCH  /api/saved-views/[id] — rename / retune a generic (dashboard/station) view.
 * DELETE /api/saved-views/[id] — remove a view. Both are ownership-scoped: only
 *   the creating staffer's row is touched, so a non-owner gets 404. Ops/media
 *   views are rejected (those keep dedicated routes).
 */

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireRoutePerm(req, 'dashboard.view');
    if (gate.denied) return gate.denied;
    const id = parseId((await params).id);
    if (id === null) {
      return NextResponse.json({ success: false, error: 'Invalid ID' }, { status: 400 });
    }

    const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: {
      name?: string;
      filters?: Record<string, unknown>;
      isShared?: boolean;
      sortOrder?: number;
    } = {};
    if (typeof raw.name === 'string') {
      const name = raw.name.trim();
      if (!name) {
        return NextResponse.json({ success: false, error: 'View name cannot be empty' }, { status: 400 });
      }
      patch.name = name;
    }
    if (raw.filters && typeof raw.filters === 'object') {
      if (JSON.stringify(raw.filters).length > 8192) {
        return NextResponse.json({ success: false, error: 'Filter payload too large' }, { status: 400 });
      }
      patch.filters = raw.filters as Record<string, unknown>;
    }
    if (typeof raw.isShared === 'boolean') patch.isShared = raw.isShared;
    if (Number.isFinite(Number(raw.sortOrder))) patch.sortOrder = Number(raw.sortOrder);

    const before = await getSavedView(id, gate.ctx.organizationId);
    if (
      !before ||
      before.staff_id !== gate.ctx.staffId ||
      !isGenericSavedViewSurface(before.surface)
    ) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    const updated = await updateSavedView(
      id,
      gate.ctx.organizationId,
      gate.ctx.staffId,
      patch,
      before.surface,
    );
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    await recordAudit(pool, gate.ctx, req, {
      source: 'saved-views-api',
      action: AUDIT_ACTION.SAVED_VIEW_UPDATE,
      entityType: AUDIT_ENTITY.SAVED_VIEW,
      entityId: id,
      before: { ...before },
      after: { ...updated },
    });

    return NextResponse.json({ success: true, view: updated });
  } catch (error: unknown) {
    if ((error as { code?: string })?.code === '23505') {
      return NextResponse.json(
        { success: false, error: 'A view with that name already exists' },
        { status: 409 },
      );
    }
    const message = error instanceof Error ? error.message : 'Failed to update saved view';
    console.error('[PATCH /api/saved-views/[id]] error:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireRoutePerm(req, 'dashboard.view');
    if (gate.denied) return gate.denied;
    const id = parseId((await params).id);
    if (id === null) {
      return NextResponse.json({ success: false, error: 'Invalid ID' }, { status: 400 });
    }

    const before = await getSavedView(id, gate.ctx.organizationId);
    if (
      !before ||
      before.staff_id !== gate.ctx.staffId ||
      !isGenericSavedViewSurface(before.surface)
    ) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    await deleteSavedView(id, gate.ctx.organizationId, gate.ctx.staffId, before.surface);

    await recordAudit(pool, gate.ctx, req, {
      source: 'saved-views-api',
      action: AUDIT_ACTION.SAVED_VIEW_DELETE,
      entityType: AUDIT_ENTITY.SAVED_VIEW,
      entityId: id,
      before: { ...before },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete saved view';
    console.error('[DELETE /api/saved-views/[id]] error:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
