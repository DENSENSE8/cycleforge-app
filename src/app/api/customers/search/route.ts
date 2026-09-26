import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import type { OrgId } from '@/lib/tenancy/constants';
import { searchCustomers } from '@/lib/neon/customer-queries';

export const dynamic = 'force-dynamic';

/** GET /api/customers/search?q=<name | email | phone>&limit=20 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  // Two chars minimum: a 1-char trgm/ILIKE pattern is a guaranteed full scan.
  if (q.length < 2) {
    return NextResponse.json(
      { ok: false, error: 'q must be at least 2 characters' },
      { status: 400 },
    );
  }
  const limitParam = Number(req.nextUrl.searchParams.get('limit'));
  const customers = await searchCustomers(q, ctx.organizationId as OrgId, limitParam);
  return NextResponse.json({ ok: true, query: q, customers });
}, { permission: 'orders.view' });
