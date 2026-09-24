import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { PaperworkPrintBody } from '@/lib/schemas/documents';
import { recordAudit, AUDIT_ACTION } from '@/lib/audit-logs';
import { buildPaperworkPackets } from '@/lib/documents/paperwork-packet';
import type { OrgId } from '@/lib/tenancy/constants';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * POST /api/orders/print-packet — "the packer print station is down": the
 * paperwork for one order (the Labels walk's Print all) or many (the orders
 * verb catalog's Print paperwork), in pack order, for the browser to print in
 * one dialog. Each page is ledgered in `document_print_jobs` as
 * `fallback_browser` so pack history stays true. Never buys postage and never
 * dispatches to a print station.
 *
 * Body: { orderIds: number[] (1..100), batchId: string }
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(PaperworkPrintBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    const orgId = ctx.organizationId as OrgId;
    const packets = await buildPaperworkPackets(orgId, {
      orderIds: parsed.orderIds,
      batchId: parsed.batchId,
      actorStaffId: ctx.staffId ?? null,
    });

    for (const packet of packets) {
      if (packet.items.length === 0) continue;
      await recordAudit(pool, ctx, req, {
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

    return NextResponse.json({ success: true, packets });
  } catch (error) {
    console.error('[POST /api/orders/print-packet]', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Could not build the paperwork packet' },
      { status: 500 },
    );
  }
}, { permission: 'shipping.view' });
