import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import type { OrgId } from '@/lib/tenancy/constants';
import { listSquareInvoiceImports } from '@/lib/orders/square-invoice-import';

export const dynamic = 'force-dynamic';

/**
 * GET /api/orders/intake/square-invoices
 * → `{ ok, connected, invoices: SquareInvoiceImport[] }` — the org's newest
 * Square invoices (drafts / cancelled skipped) as sales-order prefills, each
 * marked `importedAs` when it already lives in CycleForge.
 */
export const GET = withAuth(async (_req, ctx) => {
  const result = await listSquareInvoiceImports(ctx.organizationId as OrgId);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  return NextResponse.json(result);
}, { permission: 'orders.create' });
