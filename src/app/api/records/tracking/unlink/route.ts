import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { RecordTrackingUnlinkBodySchema, type RecordActionResponse } from '@/lib/records/sheet-actions-contract';
import { unlinkRecordTracking } from '@/lib/records/sheet-actions/tracking';
import {
  RECORD_EDIT_PERMISSIONS,
  publishRecordWrite,
  gateRecordTargets,
  recordWriteActor,
} from '@/lib/records/sheet-actions/route-support';

/**
 * POST /api/records/tracking/unlink — unlink one tracking from the named
 * Records lines (handoff §4.3: the tracking row stays). Permission per
 * direction, enforced in-handler by gateRecordTargets.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const parsed = parseBody(RecordTrackingUnlinkBodySchema, await req.json().catch(() => ({})));
  if (parsed instanceof NextResponse) return parsed;
  const denied = await gateRecordTargets(req, ctx, parsed.targets, RECORD_EDIT_PERMISSIONS);
  if (denied) return denied;

  const outcome = await unlinkRecordTracking(parsed, recordWriteActor(req, ctx));
  await publishRecordWrite(ctx, outcome, {
    source: 'records.tracking-unlink',
    receivingAction: 'update',
    orderCacheTags: ['shipped', 'orders-next', 'desk-pick-logs', 'packing-logs', 'need-to-order'],
    recomputeEnrichment: true,
  });
  return NextResponse.json({ results: outcome.results } satisfies RecordActionResponse);
}); // permission enforced in-handler per target direction (RECORD_EDIT_PERMISSIONS)
