import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import {
  listImportSourcesForRange,
  listImportedOrders,
} from '@/lib/orders/import-history';
import {
  groupImportedOrdersByDay,
  importDayRangeForOffset,
  importHistoryToday,
  normalizeImportDayRange,
} from '@/lib/orders/import-history-core';
import type { OrgId } from '@/lib/tenancy/constants';

export const dynamic = 'force-dynamic';

/**
 * GET /api/orders/imports — the per-day import record.
 *
 * "What was imported on this day?" Every ingest path already stamps
 * `orders.created_at` and names its channel in `orders.account_source`, so this
 * is a READ over facts that exist — no import-log table, nothing to backfill.
 *
 * | Param | Means |
 * |---|---|
 * | `from` / `to` (`YYYY-MM-DD`) | explicit civil-day range, inclusive |
 * | `dayOffset` | N days back from today, when no range is given (0 = today) |
 * | `source` | narrow to one `account_source` |
 * | `limit` | row cap (default 500, max 2000) |
 *
 * Days come back pre-banded newest-first, which is the shape `LedgerGrid`'s day
 * headers consume — the surface does not regroup what SQL already grouped.
 *
 * `orders.view`, and the range is normalized server-side: the calendar can hand
 * back reversed ends or a future `to`, and neither should reach SQL.
 */
export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    const orgId = ctx.organizationId as OrgId;
    const { searchParams } = new URL(req.url);

    try {
      const today = importHistoryToday();
      const picked = normalizeImportDayRange(
        { from: searchParams.get('from'), to: searchParams.get('to') },
        today,
      );
      const range =
        picked ?? importDayRangeForOffset(Number(searchParams.get('dayOffset')) || 0, today);

      const limitRaw = Number(searchParams.get('limit'));
      const [{ records, truncated }, sources] = await Promise.all([
        listImportedOrders(orgId, range, {
          source: searchParams.get('source'),
          limit: Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined,
        }),
        listImportSourcesForRange(orgId, range),
      ]);

      return NextResponse.json({
        success: true,
        range,
        today,
        // `[dayKey, records][]`, newest day first — the grid's band shape.
        days: groupImportedOrdersByDay(records),
        count: records.length,
        truncated,
        sources,
      });
    } catch (error) {
      console.error('Error in GET /api/orders/imports:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to load import records' },
        { status: 500 },
      );
    }
  },
  { permission: 'orders.view' },
);
