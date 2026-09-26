import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { getShipmentRecord } from '@/lib/shipments/shipment-record';

/** GET /api/shipments/[id]/record — the package record (`ShipmentRecord`): */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRoutePerm(req, 'shipping.view');
  if (gate.denied) return gate.denied;

  const { id: rawId } = await params;
  const shipmentId = Number(rawId);
  if (!Number.isSafeInteger(shipmentId) || shipmentId <= 0) {
    return NextResponse.json({ error: 'Invalid shipment id' }, { status: 400 });
  }

  try {
    const record = await getShipmentRecord(gate.ctx.organizationId, shipmentId);
    if (!record) return NextResponse.json({ error: 'Package not found' }, { status: 404 });
    return NextResponse.json(record, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Error in GET /api/shipments/[id]/record:', error);
    return NextResponse.json({ error: 'Failed to load the package record' }, { status: 500 });
  }
}
