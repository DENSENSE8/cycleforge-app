import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import type { OrgId } from '@/lib/tenancy/constants';
import { searchEcwidOrderImports } from '@/lib/orders/ecwid-order-import';

export const dynamic = 'force-dynamic';

/**
 * GET /api/orders/intake/ecwid-orders?q=<number, buyer or product>
 * → `{ ok, connected, orders: EcwidOrderImport[] }` — storefront orders as
 * sales-order prefills (every line), each marked `importedAs` when it already
 * lives in CycleForge. Read-only.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (q.length > 160) return NextResponse.json({ ok: false, error: 'Search is limited to 160 characters.' }, { status: 400 });
  try {
    const result = await searchEcwidOrderImports(ctx.organizationId as OrgId, { query: q });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('[orders/intake/ecwid-orders] Ecwid lookup failed', error);
    return NextResponse.json({ ok: false, error: 'Ecwid did not answer — try again.' }, { status: 502 });
  }
}, { permission: 'orders.create' });
