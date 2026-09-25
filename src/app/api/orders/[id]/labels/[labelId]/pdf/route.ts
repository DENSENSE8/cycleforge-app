import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { readLabelPrintSource } from '@/lib/shipping/order-label-links';
import { getShipStationV2, ShipStationNotConnectedError } from '@/lib/shipping/shipstation/config';
import { ShipStationApiError } from '@/lib/shipping/shipstation/client';
import type { OrgId } from '@/lib/tenancy/constants';

/**
 * GET /api/orders/[id]/labels/[labelId]/pdf — the label's PDF, fetched from
 * ShipStation on the operator's Print click (never on render). For labels with
 * no stored document: returns and paired ShipStation labels. The v2 download
 * URL needs the account API key, which only this server holds (and only ever
 * sends to ShipStation hosts — `downloadLabel`). Read-only.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; labelId: string }> },
) {
  try {
    const gate = await requireRoutePerm(req, 'shipping.view');
    if (gate.denied) return gate.denied;

    const { id: rawId, labelId: rawLabel } = await params;
    const orderId = Number(rawId);
    const rowId = Number(rawLabel);
    if (!Number.isInteger(orderId) || orderId <= 0 || !Number.isInteger(rowId) || rowId <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 });
    }

    const orgId = gate.ctx.organizationId as OrgId;
    const source = await readLabelPrintSource(orgId, orderId, rowId);
    if (!source || (!source.labelUrl && !source.labelId)) {
      return NextResponse.json({ success: false, error: 'No printable label on this order row' }, { status: 404 });
    }

    const v2 = await getShipStationV2(orgId);
    let url = source.labelUrl;
    if (!url && source.labelId) {
      const label = await v2.getLabel(source.labelId);
      if (!label) return NextResponse.json({ success: false, error: 'ShipStation has no such label' }, { status: 404 });
      url = label.labelDownload.pdf ?? label.labelDownload.href ?? null;
    }
    if (!url) return NextResponse.json({ success: false, error: 'ShipStation returned no PDF for this label' }, { status: 404 });

    const { buffer, contentType } = await v2.downloadLabel(url);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': contentType || 'application/pdf',
        'Content-Disposition': `inline; filename="label-${rowId}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof ShipStationNotConnectedError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    if (error instanceof ShipStationApiError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 502 });
    }
    console.error('Error in GET /api/orders/[id]/labels/[labelId]/pdf:', error);
    return NextResponse.json({ success: false, error: 'Could not fetch the label.' }, { status: 500 });
  }
}
