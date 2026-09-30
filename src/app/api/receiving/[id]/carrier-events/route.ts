import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { readCarrierEvents } from '@/lib/shipping/carrier-events-read';
import type { OrgId } from '@/lib/tenancy/constants';

/**
 * GET /api/receiving/[id]/carrier-events — the inbound record's External
 * fulfillment: the carton's shipment scans (`receiving_carton.shipment_id` →
 * `shipment_tracking_events`), newest first. The inbound twin of
 * `/api/orders/[id]/carrier-events` — one tenant-scoped query, no carton fan-out.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRoutePerm(req, 'receiving.view');
  if (gate.denied) return gate.denied;

  const { id: rawId } = await params;
  const receivingId = Number(rawId);
  if (!Number.isInteger(receivingId) || receivingId <= 0) {
    return NextResponse.json({ error: 'Invalid carton id' }, { status: 400 });
  }

  try {
    const payload = await readCarrierEvents(gate.ctx.organizationId as OrgId, { kind: 'carton', receivingId });
    if (!payload) return NextResponse.json({ error: 'Carton not found' }, { status: 404 });
    return NextResponse.json(payload);
  } catch (error) {
    console.error('Error in GET /api/receiving/[id]/carrier-events:', error);
    return NextResponse.json({ error: 'Could not read carrier events.' }, { status: 500 });
  }
}
