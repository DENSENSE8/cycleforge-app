import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { AUDIT_ACTION, AUDIT_ENTITY, recordAudit } from '@/lib/audit-logs';
import pool from '@/lib/db';
import { parseBody } from '@/lib/schemas/parse';
import { OrgTableLayoutPutBody } from '@/lib/schemas/table-layouts';
import {
  nextTableLayoutsMap,
  readOrgTableLayout,
  slotCatalogFor,
  slotMorphsFor,
} from '@/lib/tables/org-table-layouts';
import { parseSlotLayout } from '@/lib/tables/slot-layout';
import {
  getOrganization,
  invalidateOrgCache,
  mergeOrgSettingsRaw,
} from '@/lib/tenancy/organizations';
import type { OrgId } from '@/lib/tenancy/constants';

/** GET /api/tables/layouts?tableId=orders — this org's default slot layout for one table (`organizations.settings.tableLayouts[tableId]`),… */

export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    const tableId = new URL(req.url).searchParams.get('tableId') ?? '';
    if (!slotCatalogFor(tableId)) {
      return NextResponse.json(
        { success: false, error: 'UNKNOWN_TABLE', tableId },
        { status: 404 },
      );
    }
    const org = await getOrganization(ctx.organizationId as OrgId);
    const settings = (org?.settings ?? {}) as Record<string, unknown>;
    return NextResponse.json({
      success: true,
      tableId,
      layout: readOrgTableLayout(settings, tableId),
      canManage: ctx.permissions.has('admin.manage_features'),
    });
  },
  { permission: 'dashboard.view' },
);

export const PUT = withAuth(
  async (req: NextRequest, ctx) => {
    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(OrgTableLayoutPutBody, raw);
    if (parsed instanceof NextResponse) return parsed;
    const { tableId, layout } = parsed;

    const catalog = slotCatalogFor(tableId);
    if (!catalog) {
      return NextResponse.json(
        { success: false, error: 'UNKNOWN_TABLE', tableId },
        { status: 404 },
      );
    }
    if (layout !== null) {
      try {
        parseSlotLayout(layout, catalog);
      } catch (error) {
        return NextResponse.json(
          {
            success: false,
            error: error instanceof Error ? error.message : 'Invalid layout',
          },
          { status: 400 },
        );
      }
      // Refuse a morph this table's mount cannot paint — storing one puts a
      // header over blank cells in front of every staffer in the org.
      if (!slotMorphsFor(tableId).includes(layout.morph)) {
        return NextResponse.json(
          {
            success: false,
            error: `morph '${layout.morph}' is not supported on '${tableId}' yet`,
          },
          { status: 400 },
        );
      }
    }

    // Fresh read for the read-modify-write:
    invalidateOrgCache(ctx.organizationId as OrgId);
    const org = await getOrganization(ctx.organizationId as OrgId);
    const settings = (org?.settings ?? {}) as Record<string, unknown>;
    const before = readOrgTableLayout(settings, tableId);
    await mergeOrgSettingsRaw(ctx.organizationId as OrgId, {
      tableLayouts: nextTableLayoutsMap(settings, tableId, layout),
    });

    await recordAudit(pool, ctx, req, {
      source: 'table-layouts-api',
      action: AUDIT_ACTION.SETTINGS_UPDATE,
      entityType: AUDIT_ENTITY.SETTINGS,
      entityId: `tableLayouts.${tableId}`,
      before: { layout: before },
      after: { layout },
    });

    return NextResponse.json({ success: true, tableId, layout });
  },
  { permission: 'admin.manage_features' },
);
