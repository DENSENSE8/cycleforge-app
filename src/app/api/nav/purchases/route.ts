/** /api/nav/purchases — every inbound purchase in a window, read as the pasted list reads a number (Receiving › Purchasing, `/purchasing`; src/lib/nav/purchases). */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { getNavPurchases } from '@/lib/nav/purchases/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET ?axis=&from=&to=&source=&vendor=&unboxedBy=&status=&sort=&dir=&find= →
 * `NavPurchasesResponse` (`NavPurchasesQuery` names the params). Gated by the
 * Inbound ledger's permission (`receiving.view`); the service checks it too,
 * so the sidebar's facet counts answer the same way.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const result = await getNavPurchases(
      { orgId: ctx.organizationId, permissions: ctx.permissions },
      new URL(req.url).searchParams,
    );
    if (!result.ok) {
      const { ok: _ok, status, ...body } = result;
      return NextResponse.json(body, { status });
    }
    return NextResponse.json(result.body, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error, 'GET /api/nav/purchases');
  }
}, { permission: 'receiving.view' });
