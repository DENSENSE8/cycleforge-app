import { NextResponse, type NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parsePrintStationFnskuView } from '@/lib/print-station/fnsku';
import { listPrintStationFnskus } from '@/lib/print-station/fnsku-queries';

/**
 * GET /api/print-station/fnskus?q=&view= — the Print station's FNSKU list, the
 * same read the page renders first. The desk's query cache refetches it after
 * a print or a condition edit.
 */
export const GET = withAuth(
  async (request: NextRequest, ctx) => {
    const params = request.nextUrl.searchParams;
    const q = params.get('q')?.trim() || null;
    const view = parsePrintStationFnskuView(params.get('view'));
    return NextResponse.json(await listPrintStationFnskus(ctx.organizationId, { query: q, view }), {
      headers: { 'cache-control': 'private, no-store' },
    });
  },
  { permission: 'print.label' },
);
