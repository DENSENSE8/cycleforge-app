import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { getRepairActivity } from '@/lib/repair/repair-activity';

/** GET /api/repair-service/[id]/activity — tenant-scoped repair audit history. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRoutePerm(req, 'repair.view');
  if (gate.denied) return gate.denied;
  const repairId = Number((await params).id);
  if (!Number.isInteger(repairId) || repairId <= 0) {
    return NextResponse.json({ error: 'Invalid repair id' }, { status: 400 });
  }
  try {
    const activity = await getRepairActivity(repairId, gate.ctx.organizationId);
    return NextResponse.json({ activity });
  } catch (cause) {
    console.error(`GET /api/repair-service/${repairId}/activity failed`, cause);
    return NextResponse.json({ error: 'Failed to load repair activity' }, { status: 500 });
  }
}
