import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { RecordOrderNumberBodySchema, type RecordActionResponse } from '@/lib/records/sheet-actions-contract';
import { changeRecordOrderNumber } from '@/lib/records/sheet-actions/order-number';
import {
  RECORD_EDIT_PERMISSIONS,
  publishRecordWrite,
  gateRecordTargets,
  recordWriteActor,
} from '@/lib/records/sheet-actions/route-support';

/**
 * POST /api/records/order-number — re-key the named Records lines under a new
 * order number. 409 `{ error }` (nothing written) when a line would collide on
 * the order-line unique key. Permission per direction, enforced in-handler.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const parsed = parseBody(RecordOrderNumberBodySchema, await req.json().catch(() => ({})));
  if (parsed instanceof NextResponse) return parsed;
  const denied = await gateRecordTargets(req, ctx, parsed.targets, RECORD_EDIT_PERMISSIONS);
  if (denied) return denied;

  const result = await changeRecordOrderNumber(parsed, recordWriteActor(req, ctx));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  await publishRecordWrite(ctx, result.outcome, { source: 'records.order-number', receivingAction: 'update' });
  return NextResponse.json({ results: result.outcome.results } satisfies RecordActionResponse);
}); // permission enforced in-handler per target direction (RECORD_EDIT_PERMISSIONS)
