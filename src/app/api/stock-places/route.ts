import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { ensureToteStockLocation, listStockTotes, TOTE_LOCATION_KIND } from '@/lib/inventory/stock-places';
import { StockPlaceEnsureBody } from '@/lib/schemas/stock-places';
import { parseBody } from '@/lib/schemas/parse';
import { withTenantTransaction } from '@/lib/tenancy/db';

/**
 * GET /api/stock-places — the org's open totes (`H-{id}` plates) as stock
 * places, each with its stock location barcode once it has one. Barcoded
 * shelf locations come from `GET /api/locations`; the picker merges both.
 */
export const GET = withAuth(
  async (_req: NextRequest, ctx) => {
    const totes = await withTenantTransaction(ctx.organizationId, (client) => listStockTotes(client, ctx.organizationId));
    return NextResponse.json({ success: true, totes });
  },
  { permission: 'sku_stock.view' },
);

/**
 * POST /api/stock-places — body `{ tote }`: the tote's stock location barcode,
 * creating its `locations` row (`location_kind = 'TOTE'`) on first use, so a
 * SKU can be put into / paired to the tote like any bin. Idempotent.
 */
export const POST = withAuth(
  async (req: NextRequest, ctx) => {
    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(StockPlaceEnsureBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    const result = await withTenantTransaction(ctx.organizationId, (client) =>
      ensureToteStockLocation(client, ctx.organizationId, parsed.tote),
    );
    if (result.kind === 'not_found') {
      return NextResponse.json({ success: false, error: `No tote ${parsed.tote}` }, { status: 404 });
    }
    if (result.kind === 'taken') {
      return NextResponse.json(
        { success: false, error: `Another location already uses ${result.barcode}` },
        { status: 409 },
      );
    }

    if (result.created) {
      await recordAudit(pool, ctx, req, {
        source: 'stock-places-api',
        action: AUDIT_ACTION.BIN_CREATE,
        entityType: AUDIT_ENTITY.BIN,
        entityId: result.locationId,
        before: null,
        after: { barcode: result.barcode, location_kind: TOTE_LOCATION_KIND, handling_unit_id: result.toteId },
      });
    }
    return NextResponse.json(
      { success: true, barcode: result.barcode, locationId: result.locationId, created: result.created },
      { status: result.created ? 201 : 200 },
    );
  },
  { permission: 'bin.adjust' },
);
