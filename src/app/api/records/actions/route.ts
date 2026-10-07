import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import pool from '@/lib/db';
import { parseBody } from '@/lib/schemas/parse';
import { readIdempotencyKey, withIdempotencyClaim } from '@/lib/api-idempotency';
import { publishOrderAssignmentsUpdated } from '@/lib/realtime/publish';
import { RecordActionBodySchema, type RecordActionResponse } from '@/lib/records/sheet-actions-contract';
import { runRecordAction } from '@/lib/records/sheet-actions/actions';
import {
  RECORD_EDIT_PERMISSIONS,
  gateRecordTargets,
  publishRecordWrite,
  recordWriteActor,
} from '@/lib/records/sheet-actions/route-support';
import {
  getOrderAssignmentSnapshotsByOrderIds,
  getStaffNameMap,
} from '@/lib/work-assignments/order-assignment-snapshot';

/** Replay key for the `Idempotency-Key` header (a retried note must not append twice). */
const ROUTE_RECORDS_ACTIONS_POST = 'records.actions.post';

/**
 * POST /api/records/actions — the Records bottom bar's note / ship_by /
 * assign / hold on the named lines; one result per line (inbound lines
 * answer `refused` for the outbound-only verbs). Permission per direction,
 * enforced in-handler by gateRecordTargets.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const parsed = parseBody(RecordActionBodySchema, await req.json().catch(() => ({})));
  if (parsed instanceof NextResponse) return parsed;
  const denied = await gateRecordTargets(req, ctx, parsed.targets, RECORD_EDIT_PERMISSIONS);
  if (denied) return denied;

  const { status, body } = await withIdempotencyClaim<RecordActionResponse & Record<string, unknown>>(
    pool,
    {
      orgId: ctx.organizationId,
      idempotencyKey: readIdempotencyKey(req),
      route: ROUTE_RECORDS_ACTIONS_POST,
      staffId: ctx.staffId,
    },
    async () => {
      const outcome = await runRecordAction(parsed, recordWriteActor(req, ctx));
      await publishRecordWrite(ctx, outcome, { source: `records.${parsed.action}`, receivingAction: 'update' });
      // The desks' Up Next / stage rows listen for picker, packer and deadline changes.
      if ((parsed.action === 'assign' || parsed.action === 'ship_by') && outcome.changedOrderIds.length > 0) {
        const snaps = await getOrderAssignmentSnapshotsByOrderIds(ctx.organizationId, outcome.changedOrderIds);
        const names = await getStaffNameMap([...snaps.values()].flatMap((s) => [s.pickerId, s.packerId]));
        for (const orderId of outcome.changedOrderIds) {
          const snap = snaps.get(orderId) ?? { pickerId: null, packerId: null, deadlineAt: null };
          await publishOrderAssignmentsUpdated({
            organizationId: ctx.organizationId,
            orderId,
            pickerId: snap.pickerId,
            packerId: snap.packerId,
            pickerName: snap.pickerId != null ? names.get(snap.pickerId) ?? null : null,
            packerName: snap.packerId != null ? names.get(snap.packerId) ?? null : null,
            deadlineAt: snap.deadlineAt,
            source: `records.${parsed.action}`,
          });
        }
      }
      return { status: 200, body: { results: outcome.results } };
    },
  );
  return NextResponse.json(body, { status });
}); // permission enforced in-handler per target direction (RECORD_EDIT_PERMISSIONS)
