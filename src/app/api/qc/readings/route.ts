import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { diagnosticReadingsBodySchema, diagnosticReadingsQuerySchema } from '@/lib/qc/contracts';
import { listDiagnosticReadings, recordDiagnosticReadings } from '@/lib/qc/diagnostics';

/** GET /api/qc/readings?unitId=|sessionId= — readings with their catalog meaning, newest read first (max 500). */
export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    const query = parseBody(diagnosticReadingsQuerySchema, Object.fromEntries(req.nextUrl.searchParams));
    if (query instanceof NextResponse) return query;
    return NextResponse.json({ data: { readings: await listDiagnosticReadings(ctx.organizationId, query) } });
  },
  { permission: 'tech.view' },
);

/**
 * POST /api/qc/readings — record a batch of hub / manual diagnostic readings. Idempotent per reading
 * via `clientEventId`; replays return the stored row. No audit row: diagnostic_readings is itself the
 * append-only, actor-stamped log.
 */
export const POST = withAuth(
  async (req: NextRequest, ctx) => {
    const body = parseBody(diagnosticReadingsBodySchema, await req.json().catch(() => ({})));
    if (body instanceof NextResponse) return body;

    const result = await recordDiagnosticReadings(ctx.organizationId, ctx.staffId, body.readings);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const { ok: _ok, ...data } = result;
    return NextResponse.json({ data }, { status: result.created > 0 ? 201 : 200 });
  },
  { permission: 'tech.qc_pass' },
);
