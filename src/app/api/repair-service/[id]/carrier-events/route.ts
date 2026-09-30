import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { readCarrierEvents } from '@/lib/shipping/carrier-events-read';
import type { OrgId } from '@/lib/tenancy/constants';

/**
 * GET /api/repair-service/[id]/carrier-events — the repair record's inbound
 * shipment scans (`repair_service.source_tracking_number` → the matching
 * `shipping_tracking_numbers` row → `shipment_tracking_events`), newest first.
 * No tracking / no matching shipment → 200 with empty events.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRoutePerm(req, 'repair.view');
  if (gate.denied) return gate.denied;

  const { id: rawId } = await params;
  const repairId = Number(rawId);
  if (!Number.isInteger(repairId) || repairId <= 0) {
    return NextResponse.json({ error: 'Invalid repair id' }, { status: 400 });
  }

  try {
    const payload = await readCarrierEvents(gate.ctx.organizationId as OrgId, { kind: 'repair', repairId });
    if (!payload) return NextResponse.json({ error: 'Repair not found' }, { status: 404 });
    return NextResponse.json(payload);
  } catch (error) {
    console.error('Error in GET /api/repair-service/[id]/carrier-events:', error);
    return NextResponse.json({ error: 'Could not read carrier events.' }, { status: 500 });
  }
}
