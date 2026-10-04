import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { listPairedLabelIngestionsForOrder } from '@/lib/documents/print-bundle';
import { LabelIngestionServiceError, readLabelIngestionPdf } from '@/lib/label-ingestions/ingestion-service';
import type { OrgId } from '@/lib/tenancy/constants';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * GET /api/orders/[id]/documents/label-ingestions/[ingestionId] — the PDF of a
 * label paired to this order but not applied yet (no documents row), for the
 * pack bundle's browser print. Same gate as `/api/documents/[id]/content`; the
 * ingestion must be one of the order's paired labels.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; ingestionId: string }> },
) {
  const gate = await requireRoutePerm(req, 'orders.view');
  if (gate.denied) return gate.denied;

  const { id: rawOrderId, ingestionId: rawIngestionId } = await params;
  const orderId = parseId(rawOrderId);
  const ingestionId = parseId(rawIngestionId);
  if (orderId === null || ingestionId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const orgId = gate.ctx.organizationId as OrgId;
  const paired = await listPairedLabelIngestionsForOrder(orgId, orderId);
  if (!paired.some((li) => li.id === ingestionId)) {
    return NextResponse.json({ error: 'Label not paired to this order' }, { status: 404 });
  }

  try {
    const { bytes, fileBasename } = await readLabelIngestionPdf(orgId, ingestionId);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="${fileBasename.replace(/["\\\r\n]/g, '_')}"`,
        'cache-control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof LabelIngestionServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.code === 'INGESTION_NOT_FOUND' ? 404 : 409 });
    }
    console.error('[GET /api/orders/[id]/documents/label-ingestions/[ingestionId]]', error);
    return NextResponse.json({ error: 'The label PDF could not be read' }, { status: 500 });
  }
}
