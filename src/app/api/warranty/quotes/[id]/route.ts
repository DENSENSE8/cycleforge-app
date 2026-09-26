import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { recordAudit } from '@/lib/audit-logs';
import pool from '@/lib/db';
import { setQuoteStatus } from '@/lib/warranty/quotes';
import { claimIdFromPath, warrantyFlagEnabled, warrantyFlagOff } from '@/lib/warranty/route-helpers';
import { WarrantyQuoteStatusBody } from '@/lib/schemas/warranty';

/** PATCH /api/warranty/quotes/[id] */
export const PATCH = withAuth(async (request, ctx) => {
  if (!warrantyFlagEnabled()) return warrantyFlagOff();
  const quoteId = claimIdFromPath(request, 1);
  if (quoteId == null) return NextResponse.json({ ok: false, error: 'invalid quote id' }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const parsed = WarrantyQuoteStatusBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid body', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Tenant isolation:
  const result = await setQuoteStatus(quoteId, parsed.data.status, ctx.staffId ?? null, ctx.organizationId);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  await recordAudit(pool, ctx, request, {
    source: 'warranty-logger',
    action: 'warranty.quote_status',
    entityType: 'warranty_quote',
    entityId: quoteId,
    after: { status: parsed.data.status, repairServiceId: result.repairServiceId ?? null },
  });
  return NextResponse.json({ ok: true, quote: result.quote, repairServiceId: result.repairServiceId ?? null });
}, { permission: 'warranty.manage', feature: 'repair' });
