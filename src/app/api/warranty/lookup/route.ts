import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { isWarrantyLogger } from '@/lib/feature-flags';
import { lookupCoverage } from '@/lib/warranty/coverage';
import { WarrantyCoverageQuery } from '@/lib/schemas/warranty';

function flagOff() {
  return NextResponse.json(
    { ok: false, error: 'WARRANTY_LOGGER flag is OFF', flag: 'WARRANTY_LOGGER' },
    { status: 503 },
  );
}

/** GET /api/warranty/lookup?q=<order#|serial|sku> */
export const GET = withAuth(async (request, ctx) => {
  if (!isWarrantyLogger()) return flagOff();

  const parsed = WarrantyCoverageQuery.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid query', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const coverage = await lookupCoverage(parsed.data.q, ctx.organizationId ?? null);
  return NextResponse.json({ ok: true, coverage });
}, { permission: 'warranty.view', feature: 'repair' });
