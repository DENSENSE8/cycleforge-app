/**
 * Records sheet — the bottom bar's other verbs, each through the writer the
 * desks already use: note (outbound `order_notes`; inbound the line's
 * `receiving_line.notes`), ship-by (ORDER / TEST deadline), assign (the
 * picker / packer work assignment) and hold (the operator Hold flag,
 * `order_flags`). Ship-by, assign and hold are outbound-only: an inbound line
 * answers `refused`.
 */

import { AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import type { RecordActionBody } from '@/lib/records/sheet-actions-contract';
import { withTenantTransaction } from '@/lib/tenancy/db';
import * as repo from './repo';
import { RecordResults, splitTargets, type RecordWriteActor, type RecordWriteOutcome, type RunInTx, type Tx } from './types';

export interface RecordActionDeps {
  runInTx: RunInTx;
  addOrderNotes: typeof repo.addOrderNotes;
  appendInboundNotes: typeof repo.appendInboundNotes;
  orderShipBy: typeof repo.orderShipBy;
  setOrderShipBy: typeof repo.setOrderShipBy;
  orderAssignees: typeof repo.orderAssignees;
  assignOrders: typeof repo.assignOrders;
  activeStaffExists: typeof repo.activeStaffExists;
  orderFlags: typeof repo.orderFlags;
  setOrderFlags: typeof repo.setOrderFlags;
}

const defaultDeps: RecordActionDeps = {
  runInTx: withTenantTransaction,
  addOrderNotes: repo.addOrderNotes,
  appendInboundNotes: repo.appendInboundNotes,
  orderShipBy: repo.orderShipBy,
  setOrderShipBy: repo.setOrderShipBy,
  orderAssignees: repo.orderAssignees,
  assignOrders: repo.assignOrders,
  activeStaffExists: repo.activeStaffExists,
  orderFlags: repo.orderFlags,
  setOrderFlags: repo.setOrderFlags,
};

const OUTBOUND_ONLY: Record<Exclude<RecordActionBody['action'], 'note'>, string> = {
  ship_by: 'Ship-by is set on outbound lines only',
  assign: 'Pick / pack assignment is for outbound lines only',
  hold: 'Hold is for outbound lines only',
};

export async function runRecordAction(
  body: RecordActionBody,
  actor: RecordWriteActor,
  deps: RecordActionDeps = defaultDeps,
): Promise<RecordWriteOutcome> {
  const results = new RecordResults(body.targets);
  const { outboundIds, inboundIds } = splitTargets(body.targets);
  const changedOrders: number[] = [];
  const changedLines: number[] = [];
  if (body.action !== 'note') {
    for (const id of inboundIds) results.refuse('inbound', id, OUTBOUND_ONLY[body.action]);
  }

  const auditOrder = (tx: Tx, id: number, action: string, before: Record<string, unknown>, after: Record<string, unknown>) =>
    actor.audit(tx, { action, entityType: AUDIT_ENTITY.ORDER, entityId: id, before, after, extra: { verb: body.action } });

  await deps.runInTx(actor.orgId, async (tx) => {
    switch (body.action) {
      case 'note': {
        const outbound = await deps.addOrderNotes(tx, actor.orgId, outboundIds, body.text, actor.staffId);
        results.refuseMissing('outbound', outboundIds, outbound);
        for (const o of outbound) {
          await auditOrder(tx, o.id, AUDIT_ACTION.ORDER_UPDATE, { notes: o.before }, { notes: body.text });
          changedOrders.push(o.id);
        }
        const inbound = await deps.appendInboundNotes(tx, actor.orgId, inboundIds, body.text);
        results.refuseMissing('inbound', inboundIds, inbound);
        for (const l of inbound) {
          await actor.audit(tx, {
            action: AUDIT_ACTION.RECEIVING_LINE_NOTE_ADD,
            entityType: AUDIT_ENTITY.RECEIVING_LINE,
            entityId: l.id,
            before: { notes: l.before },
            after: { notes: l.after },
          });
          changedLines.push(l.id);
        }
        return;
      }
      case 'ship_by': {
        const current = await deps.orderShipBy(tx, actor.orgId, outboundIds);
        const found = [...current.keys()];
        results.refuseMissing('outbound', outboundIds, found.map((id) => ({ id })));
        const moving = found.filter((id) => current.get(id) !== body.date);
        await deps.setOrderShipBy(tx, actor.orgId, moving, body.date);
        for (const id of moving) {
          await auditOrder(tx, id, AUDIT_ACTION.ORDER_UPDATE, { ship_by: current.get(id) ?? null }, { ship_by: body.date });
          changedOrders.push(id);
        }
        return;
      }
      case 'assign': {
        const stage = body.stage === 'pack' ? 'PACK' : 'PICK';
        if (body.staffId != null && outboundIds.length > 0 && !(await deps.activeStaffExists(tx, body.staffId))) {
          for (const id of outboundIds) results.refuse('outbound', id, 'That staff member is not active here');
          return;
        }
        const current = await deps.orderAssignees(tx, actor.orgId, outboundIds, stage);
        const found = [...current.keys()];
        results.refuseMissing('outbound', outboundIds, found.map((id) => ({ id })));
        const moving = found.filter((id) => current.get(id) !== body.staffId);
        await deps.assignOrders(tx, actor.orgId, moving, stage, body.staffId);
        const column = stage === 'PACK' ? 'packer_id' : 'picker_id';
        for (const id of moving) {
          await auditOrder(tx, id, AUDIT_ACTION.ORDER_ASSIGNMENT_UPDATED, { [column]: current.get(id) ?? null }, { [column]: body.staffId });
          changedOrders.push(id);
        }
        return;
      }
      case 'hold': {
        const current = await deps.orderFlags(tx, actor.orgId, outboundIds);
        const found = [...current.keys()];
        results.refuseMissing('outbound', outboundIds, found.map((id) => ({ id })));
        // Release clears only a Hold — another flag (priority, damaged …) stays.
        const moving = found.filter((id) => (body.on ? current.get(id) !== 'hold' : current.get(id) === 'hold'));
        await deps.setOrderFlags(tx, actor.orgId, moving, body.on ? 'hold' : null, actor.staffId);
        for (const id of moving) {
          await auditOrder(tx, id, AUDIT_ACTION.ORDER_UPDATE, { flag: current.get(id) ?? null }, { flag: body.on ? 'hold' : null });
          changedOrders.push(id);
        }
        return;
      }
    }
  });
  return results.outcome({ orderIds: changedOrders, receivingLineIds: changedLines });
}
