import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import type { OrgId } from '@/lib/tenancy/constants';
import { getShipStationV2 } from '@/lib/shipping/shipstation/config';
import { readIntakeLabelSource } from '@/lib/shipping/label-intake';
import { labelIntakeErrorResponse } from '@/lib/shipping/label-intake-errors';

/** GET /api/shipping/label-intake/labels/[labelId]/pdf — one purchased ledger row's label PDF, fetched from ShipStation on the Print click. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ labelId: string }> }) {
  try {
    const gate = await requireRoutePerm(req, 'shipping.view');
    if (gate.denied) return gate.denied;

    const { labelId: rawId } = await params;
    const rowId = Number(rawId);
    if (!Number.isInteger(rowId) || rowId <= 0) {
      return NextResponse.json({ ok: false, error: 'Invalid label id' }, { status: 400 });
    }

    const orgId = gate.ctx.organizationId as OrgId;
    const source = await readIntakeLabelSource(orgId, rowId);
    if (!source || (!source.labelUrl && !source.labelId)) {
      return NextResponse.json({ ok: false, error: 'No printable label on this row' }, { status: 404 });
    }

    const v2 = await getShipStationV2(orgId);
    let url = source.labelUrl;
    if (!url && source.labelId) {
      const label = await v2.getLabel(source.labelId);
      url = label?.labelDownload.pdf ?? label?.labelDownload.href ?? null;
    }
    if (!url) return NextResponse.json({ ok: false, error: 'ShipStation returned no PDF for this label' }, { status: 404 });

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
    return labelIntakeErrorResponse(error, 'GET /api/shipping/label-intake/labels/[labelId]/pdf');
  }
}
