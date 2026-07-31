import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { ImportExceptionActionBody } from '@/lib/schemas/import-exception';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';
import {
  ignoreImportException,
  listOpenImportExceptions,
  resolveImportException,
} from '@/lib/inventory/order-import-exceptions';

/**
 * GET /api/review/import-exceptions — open Review · Missing item number rows
 * (explicitly enqueued on sheet import `noItemNumber` skip; not a scan of
 * historical orphans).
 */
export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const { searchParams } = new URL(req.url);
      const q = searchParams.get('q') || '';
      const limit = Math.max(1, Math.min(500, Number(searchParams.get('limit') || 100)));
      const offset = Math.max(0, Number(searchParams.get('offset') || 0));

      const { rows, total } = await listOpenImportExceptions(ctx.organizationId, {
        q,
        limit,
        offset,
      });

      return NextResponse.json({ success: true, items: rows, total });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to list import exceptions';
      console.error('[review/import-exceptions] GET', error);
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
  { permission: 'packing.review' },
);

/**
 * POST /api/review/import-exceptions — resolve a row by supplying the
 * Item Number (re-runs the exact sheet-import ingest path for that one row)
 * or ignore it permanently.
 */
export const POST = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const raw = await req.json().catch(() => ({}));
      const parsed = parseBody(ImportExceptionActionBody, raw);
      if (parsed instanceof NextResponse) return parsed;

      if (parsed.action === 'ignore') {
        const result = await ignoreImportException(ctx.organizationId, parsed.id);
        if (!result.ok) {
          return NextResponse.json(
            { success: false, error: result.error },
            { status: result.status },
          );
        }
        await recordAudit(pool, ctx, req, {
          source: 'review-import-exceptions',
          action: AUDIT_ACTION.ORDER_IMPORT_EXCEPTION_IGNORE,
          entityType: AUDIT_ENTITY.ORDER,
          entityId: parsed.id,
          after: { id: parsed.id, status: 'ignored' },
        });
        return NextResponse.json({ success: true, ignored: true });
      }

      const result = await resolveImportException(ctx.organizationId, {
        id: parsed.id,
        itemNumber: parsed.itemNumber,
      });
      if (!result.ok) {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: result.status },
        );
      }

      await recordAudit(pool, ctx, req, {
        source: 'review-import-exceptions',
        action: AUDIT_ACTION.ORDER_IMPORT_EXCEPTION_RESOLVE,
        entityType: AUDIT_ENTITY.ORDER,
        entityId: result.orderId ?? parsed.id,
        after: { id: parsed.id, itemNumber: parsed.itemNumber, orderId: result.orderId },
      });

      return NextResponse.json({ success: true, resolved: true, orderId: result.orderId });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update import exception';
      console.error('[review/import-exceptions] POST', error);
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
  { permission: 'packing.review' },
);
