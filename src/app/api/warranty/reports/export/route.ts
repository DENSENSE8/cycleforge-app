import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { isWarrantyLogger } from '@/lib/feature-flags';
import { buildWarrantyReportRows, toCsv, WARRANTY_REPORT_COLUMNS } from '@/lib/warranty/reports';
import { WarrantyReportQuery } from '@/lib/schemas/warranty';

/** GET /api/warranty/reports/export */
export const GET = withAuth(async (request, ctx) => {
  if (!isWarrantyLogger()) {
    return NextResponse.json(
      { ok: false, error: 'WARRANTY_LOGGER flag is OFF', flag: 'WARRANTY_LOGGER' },
      { status: 503 },
    );
  }

  const parsed = WarrantyReportQuery.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid query', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    // Tenant isolation:
    const rows = await buildWarrantyReportRows(
      {
        status: parsed.data.status ?? null,
        sku: parsed.data.sku ?? null,
        from: parsed.data.from ?? null,
        to: parsed.data.to ?? null,
        outcome: parsed.data.outcome ?? null,
      },
      ctx.organizationId,
    );

    if (parsed.data.format === 'json') {
      return NextResponse.json({ ok: true, rows });
    }

    const csv = toCsv(rows, WARRANTY_REPORT_COLUMNS);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="warranty-claims-report.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'warranty report failed';
    console.error('[GET /api/warranty/reports/export] error:', err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}, { permission: 'warranty.view', feature: 'repair' });
