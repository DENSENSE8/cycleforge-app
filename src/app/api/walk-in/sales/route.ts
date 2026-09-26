import { NextRequest, NextResponse } from 'next/server';
import {
  getSquareTransactions,
  softDeleteSquareTransaction,
} from '@/lib/neon/square-transaction-queries';
import { listCounterSalesAsSaleRows } from '@/lib/counter/list-counter-sales';
import { isAllowedAdminOrigin } from '@/lib/security/allowed-origin';
import { withAuth } from '@/lib/auth/withAuth';

/** GET /api/walk-in/sales?q=&status=&weekStart=&weekEnd=&orderSource=&limit= Query local square_transactions table. */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  if (!isAllowedAdminOrigin(req)) {
    return NextResponse.json({ error: 'Origin not allowed' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('q')?.trim() || undefined;
  const status = searchParams.get('status')?.trim() || undefined;
  const weekStart = searchParams.get('weekStart')?.trim() || undefined;
  const weekEnd = searchParams.get('weekEnd')?.trim() || undefined;
  // Show all orders by default (sales + repair). Pass orderSource=walk_in_sale to filter.
  const orderSourceRaw = searchParams.get('orderSource')?.trim() || '';
  const orderSource = orderSourceRaw && orderSourceRaw !== 'all' ? orderSourceRaw : undefined;
  const limitRaw = Number(searchParams.get('limit') || 200);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, limitRaw)) : 200;
  // A SEARCH IS NOT A PAGE.
  const rowLimit = search ? 500 : limit;

  const rows = await getSquareTransactions(
    { search, status, weekStart, weekEnd, orderSource, limit: rowLimit },
    ctx.organizationId,
  );
  const squareOrderIds = new Set(
    rows.map((r) => r.square_order_id).filter((id): id is string => Boolean(id)),
  );
  const counterRows = await listCounterSalesAsSaleRows(
    ctx.organizationId,
    rowLimit,
    squareOrderIds,
    search,
  );
  const merged = [...rows, ...counterRows]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, rowLimit);

  return NextResponse.json({ rows: merged });
}, { permission: 'walk_in.view', feature: 'walkIn' });

/** DELETE /api/walk-in/sales?id=<uuid> — soft-delete (hide) a walk-in sale. */
export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  if (!isAllowedAdminOrigin(req)) {
    return NextResponse.json({ error: 'Origin not allowed' }, { status: 403 });
  }
  const id = new URL(req.url).searchParams.get('id')?.trim();
  if (!id) {
    return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
  }

  const hidden = await softDeleteSquareTransaction(id, ctx.organizationId);
  if (!hidden) {
    return NextResponse.json(
      { success: false, error: 'Sale not found or already removed' },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true, id });
}, { permission: 'walk_in.intake', feature: 'walkIn' });
