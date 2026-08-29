import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import { AUDIT_ACTION, AUDIT_ENTITY, recordAudit } from '@/lib/audit-logs';
import pool from '@/lib/db';
import {
  SHEET_FILL_SWATCH_KEYS,
  SHEET_TEXT_SWATCH_KEYS,
  type ColumnFormat,
} from '@/lib/tables/column-formats';
import {
  clearColumnFormats,
  listColumnFormats,
  upsertColumnFormat,
} from '@/lib/tables/column-formats-queries';
import { TABLE_COLUMNS, type TableId } from '@/lib/tables/table-columns';

/**
 * GET    /api/tables/[tableId]/column-formats — every column format for one
 *   sheet, in this org. Read once per sheet mount.
 * PUT    /api/tables/[tableId]/column-formats — write ONE column's format.
 * DELETE /api/tables/[tableId]/column-formats — clear every format on the sheet.
 *
 * Gated on `dashboard.view` — the same read permission an operator already holds
 * to see these surfaces, matching the `/api/saved-views` precedent, which also
 * writes org-shared display state (`is_shared`) under it. Formatting changes
 * what a table LOOKS like, never what it contains or what it dispatches, so it
 * does not earn a new RBAC leaf; the write is audited instead, because an
 * org-shared format needs an author when two people disagree about it.
 *
 * `orgId` comes from `ctx.organizationId` — never from the body.
 *
 * The `[tableId]` segment is read off `req.nextUrl.pathname` rather than from a
 * `params` argument: `withAuth` handlers are `(req, ctx)` by contract (the
 * wrapper swallows Next's route context), so every dynamic route in this repo
 * parses the path. See `withAuth.ts` → `RouteContext`.
 */

/** Prefs-bucket ids, derived from the registry rather than re-typed. */
const TABLE_IDS = Object.keys(TABLE_COLUMNS) as TableId[];

const formatSchema = z.object({
  columnKey: z.string().min(1).max(64),
  bold: z.boolean().default(false),
  italic: z.boolean().default(false),
  strike: z.boolean().default(false),
  // The token vocabulary IS the validation. A hex cannot pass, which is what
  // keeps the design-token law enforceable at the boundary rather than hoped for
  // at the call site.
  textColor: z.enum(SHEET_TEXT_SWATCH_KEYS as [string, ...string[]]).nullable().default(null),
  fillColor: z.enum(SHEET_FILL_SWATCH_KEYS as [string, ...string[]]).nullable().default(null),
  align: z.enum(['left', 'center', 'right']).nullable().default(null),
});

/** `/api/tables/orders/column-formats` → `orders`, or null if unknown. */
function tableIdFromPath(req: NextRequest): TableId | null {
  const segments = req.nextUrl.pathname.split('/').filter(Boolean);
  const i = segments.indexOf('tables');
  const raw = i >= 0 ? segments[i + 1] : undefined;
  if (!raw) return null;
  const decoded = decodeURIComponent(raw);
  return (TABLE_IDS as string[]).includes(decoded) ? (decoded as TableId) : null;
}

const UNKNOWN_TABLE = NextResponse.json(
  { success: false, error: 'Unknown table' },
  { status: 404 },
);

export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const tableId = tableIdFromPath(req);
      if (!tableId) return UNKNOWN_TABLE;
      const formats = await listColumnFormats(ctx.organizationId, tableId);
      return NextResponse.json({ success: true, formats });
    } catch (error) {
      console.error('[GET /api/tables/[tableId]/column-formats] error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to load column formats' },
        { status: 500 },
      );
    }
  },
  { permission: 'dashboard.view' },
);

export const PUT = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const tableId = tableIdFromPath(req);
      if (!tableId) return UNKNOWN_TABLE;
      const parsed = formatSchema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid format' },
          { status: 400 },
        );
      }
      const { columnKey, ...rest } = parsed.data;
      const format = await upsertColumnFormat(
        ctx.organizationId,
        tableId,
        columnKey,
        rest as ColumnFormat,
        ctx.staffId,
      );

      await recordAudit(pool, ctx, req, {
        source: 'table-column-formats-api',
        action: AUDIT_ACTION.TABLE_COLUMN_FORMAT_SET,
        entityType: AUDIT_ENTITY.TABLE_COLUMN_FORMAT,
        entityId: `${tableId}:${columnKey}`,
        after: { tableId, columnKey, ...rest },
      });

      return NextResponse.json({ success: true, columnKey, format });
    } catch (error) {
      console.error('[PUT /api/tables/[tableId]/column-formats] error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to save column format' },
        { status: 500 },
      );
    }
  },
  { permission: 'dashboard.view' },
);

export const DELETE = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const tableId = tableIdFromPath(req);
      if (!tableId) return UNKNOWN_TABLE;
      const cleared = await clearColumnFormats(ctx.organizationId, tableId);

      await recordAudit(pool, ctx, req, {
        source: 'table-column-formats-api',
        action: AUDIT_ACTION.TABLE_COLUMN_FORMAT_CLEAR,
        entityType: AUDIT_ENTITY.TABLE_COLUMN_FORMAT,
        entityId: tableId,
        after: { tableId, cleared },
      });

      return NextResponse.json({ success: true, cleared });
    } catch (error) {
      console.error('[DELETE /api/tables/[tableId]/column-formats] error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to clear column formats' },
        { status: 500 },
      );
    }
  },
  { permission: 'dashboard.view' },
);
