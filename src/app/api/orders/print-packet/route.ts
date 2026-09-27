import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { PaperworkPrintBody } from '@/lib/schemas/documents';
import { recordAudit, AUDIT_ACTION } from '@/lib/audit-logs';
import { buildPaperworkPackets } from '@/lib/documents/paperwork-packet';
import { listDocumentPrintJobsForBatch } from '@/lib/documents/document-print-jobs';
import type { OrgId } from '@/lib/tenancy/constants';
import { withTenantTransaction } from '@/lib/tenancy/db';

export const dynamic = 'force-dynamic';

/** POST /api/orders/print-packet — "the packer print station is down": */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const raw = await req.json().catch(() => ({}));
  const parsed = parseBody(PaperworkPrintBody, raw);
  if (parsed instanceof NextResponse) return parsed;

  const orgId = ctx.organizationId as OrgId;
  const packets = await buildPaperworkPackets(orgId, {
    orderIds: parsed.orderIds,
    batchId: parsed.batchId,
    actorStaffId: ctx.staffId ?? null,
  });

  const printed = packets.filter((packet) => packet.items.length > 0);
  if (printed.length > 0) {
    await withTenantTransaction(orgId, async (client) => {
      for (const packet of printed) {
        await recordAudit(client, ctx, req, {
          source: 'api.orders.print-packet',
          action: AUDIT_ACTION.ORDER_DOCUMENT_BUNDLE_PRINT,
          entityType: 'ORDER',
          entityId: String(packet.orderId),
          extra: {
            fallback: 'browser',
            batch_id: parsed.batchId,
            pages: packet.items.length,
            missing_types: packet.missingTypes,
          },
        });
      }
    });
  }

  return NextResponse.json({ success: true, packets });
}, { permission: 'shipping.view' });

/**
 * GET /api/orders/print-packet?batch=<id> — the ledger rows one station print
 * batch wrote (a chat paperwork print reads back what was recorded).
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const batch = req.nextUrl.searchParams.get('batch') ?? '';
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(batch)) {
    return NextResponse.json({ error: 'Invalid batch' }, { status: 400 });
  }
  const rows = await listDocumentPrintJobsForBatch(ctx.organizationId as OrgId, batch);
  return NextResponse.json({
    rows: rows.map((r) => ({
      id: Number(r.id),
      orderId: r.order_id,
      documentType: r.document_type,
      status: r.status,
      isReprint: r.is_reprint,
    })),
  });
}, { permission: 'shipping.view' });
