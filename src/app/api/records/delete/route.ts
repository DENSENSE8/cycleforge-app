import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { RecordDeleteBodySchema, type RecordActionResponse } from '@/lib/records/sheet-actions-contract';
import { deleteRecordLines } from '@/lib/records/sheet-actions/delete';
import {
  RECORD_DELETE_PERMISSIONS,
  publishRecordWrite,
  gateRecordTargets,
  recordWriteActor,
} from '@/lib/records/sheet-actions/route-support';

/**
 * POST /api/records/delete — delete the named Records lines under the
 * handoff §4.3 refusals; one result per line. Permission per direction —
 * outbound `orders.void` (with its step-up, as DELETE /api/orders/[id]),
 * inbound `receiving.mark_received` (as DELETE /api/receiving-lines).
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const parsed = parseBody(RecordDeleteBodySchema, await req.json().catch(() => ({})));
  if (parsed instanceof NextResponse) return parsed;
  const denied = await gateRecordTargets(req, ctx, parsed.targets, RECORD_DELETE_PERMISSIONS);
  if (denied) return denied;

  const outcome = await deleteRecordLines(parsed, recordWriteActor(req, ctx));
  await publishRecordWrite(ctx, outcome, {
    source: 'records.delete',
    receivingAction: 'delete',
    recomputeEnrichment: true,
  });
  return NextResponse.json({ results: outcome.results } satisfies RecordActionResponse);
}); // permission enforced in-handler per target direction (RECORD_DELETE_PERMISSIONS)
