import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { diagnosticCodeUpsertBodySchema, diagnosticCodesQuerySchema } from '@/lib/qc/contracts';
import { listDiagnosticCodes, upsertDiagnosticCode } from '@/lib/qc/diagnostics';

/** GET /api/qc/codes?family=&q=&includeInactive=1 — the org's diagnostic code catalog. */
export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    const query = parseBody(diagnosticCodesQuerySchema, Object.fromEntries(req.nextUrl.searchParams));
    if (query instanceof NextResponse) return query;
    const codes = await listDiagnosticCodes(ctx.organizationId, {
      family: query.family,
      q: query.q,
      includeInactive: query.includeInactive != null,
    });
    return NextResponse.json({ data: { codes } });
  },
  { permission: 'tech.view' },
);

/** POST /api/qc/codes — create or update the org's meaning for (deviceFamily, code). */
export const POST = withAuth(
  async (req: NextRequest, ctx) => {
    const body = parseBody(diagnosticCodeUpsertBodySchema, await req.json().catch(() => ({})));
    if (body instanceof NextResponse) return body;

    const result = await upsertDiagnosticCode(ctx.organizationId, body);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    await recordAudit(pool, ctx, req, {
      source: 'qc-codes-api',
      action: AUDIT_ACTION.DIAGNOSTIC_CODE_UPSERT,
      entityType: AUDIT_ENTITY.DIAGNOSTIC_CODE,
      entityId: result.code.id,
      method: 'manual',
      before: result.before ? { ...result.before } : undefined,
      after: { ...result.code },
    });
    return NextResponse.json({ data: { code: result.code, created: result.created } }, { status: result.created ? 201 : 200 });
  },
  { permission: 'sku_stock.manage' },
);
