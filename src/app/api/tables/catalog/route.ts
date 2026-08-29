import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import { AUDIT_ACTION, AUDIT_ENTITY, recordAudit } from '@/lib/audit-logs';
import pool from '@/lib/db';
import { listOrgTables, replaceOrgTables } from '@/lib/tables/org-tables-queries';
import { resolveOrgCatalog } from '@/lib/tables/org-tables';
import { PRODUCT_TABLES } from '@/lib/tables/table-catalog';

/**
 * GET /api/tables/catalog — what this org runs, resolved against what the
 *   product offers. Read once per shell mount.
 * PUT /api/tables/catalog — replace the org's catalog wholesale.
 *
 * ## What the product offers is CODE, not database rows
 *
 * The offering comes from `PRODUCT_TABLES`, a server-safe restatement of
 * `REGISTERED_BINDINGS` pinned to it by `table-catalog.test.ts`. Mirroring the
 * offering into a database TABLE would create a second answer to "does this
 * surface exist" that drifts the first time a binding lands without a seed row.
 *
 * It does not import the registry directly, and that is not fussiness: it did,
 * and the production build failed —
 * `Failed to collect page data for /api/tables/catalog`,
 * `ZodError: columns[5] expected object, received function`. The registry pulls
 * every family's `'use client'` cells and headers, whose module-init order in
 * the SERVER bundle differs from the client's, so `parseTableDefinition` was
 * handed a half-initialised module. Typecheck and unit tests both pass on that
 * code; only `next build` sees it.
 *
 * Read is gated on `dashboard.view` (an operator has to see the strip to use
 * the app). Write is gated on `admin.manage_features`: turning a table off
 * removes it for **everyone in the org**, which is the same altitude as
 * enabling a feature — not a per-operator display preference like column widths
 * or zoom, which stay in `staff_preferences`.
 */

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
