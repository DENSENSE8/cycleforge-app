/**
 * Records sheet — Delete at line / order grain (handoff §4.3, binding). Each
 * named line is deleted with its dependents, or refused — never both, never
 * widened. A line something physical happened to (picked, packed, labelled,
 * scanned out; inbound: scanned at the door, unboxed, received, units,
 * history) is refused with "use Remove from list".
 *
 * Outbound goes through the one order delete path (`deleteOrderInTx`, which
 * also clears assignments, feed rows, ORDER links and customers made for the
 * order alone); inbound through `deleteInboundLinesInTx` (RECEIVING_LINE links,
 * emptied never-scanned cartons), then any inbound order left with no lines.
 */

import { AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { OrderDeleteBlockedError } from '@/lib/neon/orders-queries';
import type { RecordDeleteBody } from '@/lib/records/sheet-actions-contract';
import { withTenantTransaction } from '@/lib/tenancy/db';
import * as repo from './repo';
import { RecordResults, splitTargets, type RecordWriteActor, type RecordWriteOutcome, type RunInTx } from './types';

export interface RecordDeleteDeps {
  runInTx: RunInTx;
  loadOutboundDeleteCandidates: typeof repo.loadOutboundDeleteCandidates;
  deleteOutboundLine: typeof repo.deleteOutboundLine;
  loadInboundDeleteCandidates: typeof repo.loadInboundDeleteCandidates;
  deleteInboundLines: typeof repo.deleteInboundLines;
}

const defaultDeps: RecordDeleteDeps = {
  runInTx: withTenantTransaction,
  loadOutboundDeleteCandidates: repo.loadOutboundDeleteCandidates,
  deleteOutboundLine: repo.deleteOutboundLine,
  loadInboundDeleteCandidates: repo.loadInboundDeleteCandidates,
  deleteInboundLines: repo.deleteInboundLines,
};

const OUTBOUND_BLOCKER_WORDS: Record<repo.OutboundDeleteBlocker, string> = {
  scanned_out: 'Scanned out',
  label_applied: 'Label applied',
  packed: 'Packed',
  picked: 'Picked',
};

const REMOVE_INSTEAD = 'use Remove from list';

export async function deleteRecordLines(
  body: RecordDeleteBody,
  actor: RecordWriteActor,
  deps: RecordDeleteDeps = defaultDeps,
): Promise<RecordWriteOutcome> {
  const results = new RecordResults(body.targets);
  const { outboundIds, inboundIds } = splitTargets(body.targets);
  const deletedOrders: number[] = [];
  const deletedLines: number[] = [];

  await deps.runInTx(actor.orgId, async (tx) => {
    const outbound = await deps.loadOutboundDeleteCandidates(tx, actor.orgId, outboundIds);
    results.refuseMissing('outbound', outboundIds, outbound);
    for (const line of outbound) {
      if (line.blocker) {
        results.refuse('outbound', line.id, `${OUTBOUND_BLOCKER_WORDS[line.blocker]} — ${REMOVE_INSTEAD}`);
        continue;
      }
      try {
        if (!(await deps.deleteOutboundLine(tx, actor.orgId, line.id, actor.staffId))) {
          results.refuse('outbound', line.id, 'Not found — it may have been deleted');
          continue;
        }
      } catch (err) {
        // Raised before the delete writes anything, so the transaction stays good.
        if (!(err instanceof OrderDeleteBlockedError)) throw err;
        results.refuse('outbound', line.id, err.message);
        continue;
      }
      await actor.audit(tx, {
        action: AUDIT_ACTION.ORDER_DELETE,
        entityType: AUDIT_ENTITY.ORDER,
        entityId: line.id,
        before: line.snapshot,
        after: null,
      });
      deletedOrders.push(line.id);
    }

    const inbound = await deps.loadInboundDeleteCandidates(tx, actor.orgId, inboundIds);
    results.refuseMissing('inbound', inboundIds, inbound);
    const deletable = inbound.filter((line) => {
      if (!line.blocker) return true;
      results.refuse('inbound', line.id, `${line.blocker.charAt(0).toUpperCase()}${line.blocker.slice(1)} — ${REMOVE_INSTEAD}`);
      return false;
    });
    if (deletable.length === 0) return;
    const { deletedCartonIds, deletedInboundOrderIds } = await deps.deleteInboundLines(
      tx,
      actor.orgId,
      deletable.map((l) => l.id),
      [...new Set(deletable.flatMap((l) => (l.cartonId != null ? [l.cartonId] : [])))],
      [...new Set(deletable.flatMap((l) => (l.inboundOrderId != null ? [l.inboundOrderId] : [])))],
    );
    for (const line of deletable) {
      await actor.audit(tx, {
        action: AUDIT_ACTION.RECEIVING_LINE_DELETE,
        entityType: AUDIT_ENTITY.RECEIVING_LINE,
        entityId: line.id,
        before: line.snapshot,
        after: null,
        extra: {
          cartonDeleted: line.cartonId != null && deletedCartonIds.includes(line.cartonId),
          inboundOrderDeleted: line.inboundOrderId != null && deletedInboundOrderIds.includes(line.inboundOrderId),
        },
      });
      deletedLines.push(line.id);
    }
  });
  return results.outcome({ orderIds: deletedOrders, receivingLineIds: deletedLines });
}
