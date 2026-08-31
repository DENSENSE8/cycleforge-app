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

/**
 * GET /api/tables/layouts?tableId=orders — this org's default slot layout for
 *   one table (`organizations.settings.tableLayouts[tableId]`), or null when
 *   the org runs the product default. Read once per table mount.
 * PUT /api/tables/layouts — replace (or reset with `layout: null`) the org's
 *   default layout for one table, whole-document.
 *
 * Sibling of `/api/tables/catalog`, same gates and for the same reason: the
 * read is what every operator's grid resolves through (`dashboard.view`),
 * while the write changes which columns EVERY staffer in the org sees — the
 * same altitude as enabling a feature (`admin.manage_features`), not a
 * per-operator display preference (those stay in `staff_preferences`).
 *
 * Layout documents validate in two stages: structural zod in the body schema,
 * then `parseSlotLayout` against the table's field catalog — an org default
 * naming a field the product does not ship must be refused at write time,
 * never stored to be soft-dropped on every read.
 */

export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    try {
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
    } catch (error) {
      console.error('[GET /api/tables/layouts] error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to load the table layout' },
        { status: 500 },
      );
    }
  },
  { permission: 'dashboard.view' },
);

export const PUT = withAuth(
  async (req: NextRequest, ctx) => {
    try {
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

      // Fresh read for the read-modify-write: the org row is cached 30s
      // per-instance, and seeding the whole-map merge (and the audit
      // before-image) from a stale copy would resurrect a layout another
      // admin just replaced.
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
    } catch (error) {
      console.error('[PUT /api/tables/layouts] error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to save the table layout' },
        { status: 500 },
      );
    }
  },
  { permission: 'admin.manage_features' },
);
