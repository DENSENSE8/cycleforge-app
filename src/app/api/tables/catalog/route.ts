import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import { AUDIT_ACTION, AUDIT_ENTITY, recordAudit } from '@/lib/audit-logs';
import pool from '@/lib/db';
import { listOrgTables, replaceOrgTables } from '@/lib/tables/org-tables-queries';
import { resolveOrgCatalog } from '@/lib/tables/org-tables';
import { PRODUCT_TABLES } from '@/lib/tables/table-catalog';

/** GET /api/tables/catalog — what this org runs, resolved against what the product offers. */

/** The offering. Already de-duplicated by sheet — see `table-catalog.ts`. */
function offeredTables() {
  return PRODUCT_TABLES;
}

const putSchema = z.object({
  tables: z
    .array(
      z.object({
        tableId: z.string().min(1).max(64),
        enabled: z.boolean(),
        sortOrder: z.number().int().min(0).max(999),
      }),
    )
    .max(200),
});

export const GET = withAuth(
  async (_req: NextRequest, ctx) => {
    try {
      const stored = await listOrgTables(ctx.organizationId);
      return NextResponse.json({
        success: true,
        tables: resolveOrgCatalog(offeredTables(), stored),
      });
    } catch (error) {
      console.error('[GET /api/tables/catalog] error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to load the table catalog' },
        { status: 500 },
      );
    }
  },
  { permission: 'dashboard.view' },
);

export const PUT = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const parsed = putSchema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid catalog' },
          { status: 400 },
        );
      }
      const offered = offeredTables();
      const known = new Set(offered.map((e) => e.tableId));
      // Drop rows naming a table the product does not offer. Storing one would
      // put an unopenable tab in someone's strip the moment `resolveOrgCatalog`
      // stopped filtering — better to never write it.
      const rows = parsed.data.tables.filter((t) => known.has(t.tableId));

      const written = await replaceOrgTables(ctx.organizationId, rows, ctx.staffId);

      await recordAudit(pool, ctx, req, {
        source: 'table-catalog-api',
        action: AUDIT_ACTION.ORG_TABLE_CATALOG_SET,
        entityType: AUDIT_ENTITY.ORG_TABLE_CATALOG,
        entityId: String(ctx.organizationId),
        after: {
          enabled: written.filter((t) => t.enabled).map((t) => t.tableId),
          disabled: written.filter((t) => !t.enabled).map((t) => t.tableId),
        },
      });

      return NextResponse.json({
        success: true,
        tables: resolveOrgCatalog(offered, written),
      });
    } catch (error) {
      console.error('[PUT /api/tables/catalog] error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to save the table catalog' },
        { status: 500 },
      );
    }
  },
  { permission: 'admin.manage_features' },
);
