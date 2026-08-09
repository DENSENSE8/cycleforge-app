import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { archiveCustomFieldDef } from '@/lib/custom-fields/queries';
import pool from '@/lib/db';

/**
 * DELETE /api/custom-fields/defs/[id] — soft-archive a custom column definition.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRoutePerm(req, 'settings.custom_fields');
  if (gate.denied) return gate.denied;

  try {
    const { id: idRaw } = await params;
    const id = Number(idRaw);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 });
    }

    const archived = await archiveCustomFieldDef(gate.ctx.organizationId, id);
    if (!archived) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    await recordAudit(pool, gate.ctx, req, {
      source: 'custom-fields-api',
      action: AUDIT_ACTION.CUSTOM_FIELD_DEF_ARCHIVE,
      entityType: AUDIT_ENTITY.CUSTOM_FIELD_DEF,
      entityId: archived.id,
      after: { ...archived },
    });

    return NextResponse.json({ success: true, item: archived });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to archive custom field';
    console.error('DELETE /api/custom-fields/defs/[id]:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
