import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { readRepairTicketLink } from '@/lib/repair/ticket-link';

/**
 * GET /api/repair-service/[id]/ticket-link — which helpdesk ticket (if any) a
 * customer update for this repair may be sent to. Read-only; only a `linked`
 * verdict permits sending (see `classifyRepairTicketLink`).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRoutePerm(request, 'repair.view');
  if (gate.denied) return gate.denied;
  const orgId = gate.ctx.organizationId;
  const { id } = await params;
  const repairId = Number(id);
  if (!Number.isSafeInteger(repairId) || repairId <= 0) {
    return NextResponse.json({ error: 'Valid repair id is required' }, { status: 400 });
  }

  try {
    const link = await readRepairTicketLink(orgId, repairId);
    if (!link) return NextResponse.json({ error: 'Repair not found' }, { status: 404 });
    return NextResponse.json({ link });
  } catch (err: unknown) {
    console.error('GET /api/repair-service/[id]/ticket-link failed:', err);
    return NextResponse.json({ error: 'Failed to read ticket link' }, { status: 500 });
  }
}
