import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { markDocumentPrintJobsDispatched } from '@/lib/documents/document-print-jobs';
import type { OrgId } from '@/lib/tenancy/constants';

/**
 * POST /api/orders/[id]/documents/print/ack-local
 *
 * Packing Chrome finished loopback `127.0.0.1:8787/print` after a
 * `fallback_browser` bundle — promote those ledger rows to `dispatched`.
 *
 * Body: { jobIds: number[] }
 */

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRoutePerm(req, 'packing.complete_order');
  if (gate.denied) return gate.denied;

  const { id: rawId } = await params;
  const orderId = parseId(rawId);
  if (orderId === null) {
    return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const jobIds = Array.isArray(body?.jobIds)
    ? body.jobIds.map((n: unknown) => Number(n)).filter((n: number) => Number.isFinite(n) && n > 0)
    : [];
  if (jobIds.length === 0) {
    return NextResponse.json({ error: 'jobIds required' }, { status: 400 });
  }

  const orgId = gate.ctx.organizationId as OrgId;
  const updated = await markDocumentPrintJobsDispatched(orgId, orderId, jobIds);
  return NextResponse.json({ success: true, updated });
}
