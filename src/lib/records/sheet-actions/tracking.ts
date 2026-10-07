/**
 * Records sheet — tracking edits at LINE grain (handoff §4.2 / §4.3 row 2).
 * Only the named lines move: lines 1–2 → A then line 3 → B leaves 1–2 on A.
 * The tracking row (`shipping_tracking_numbers`) is never rewritten or deleted;
 * lines gain or lose LINKS to it (outbound `orders.shipment_id` + ORDER link,
 * inbound `receiving_line.shipment_id` + RECEIVING_LINE link — never the carton).
 */

import { AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import type { RecordTarget, RecordTrackingBody, RecordTrackingUnlinkBody } from '@/lib/records/sheet-actions-contract';
import type { OrgId } from '@/lib/tenancy/constants';
import { withTenantTransaction } from '@/lib/tenancy/db';
import * as repo from './repo';
import { RecordResults, splitTargets, type RecordWriteActor, type RecordWriteOutcome, type RunInTx, type Tx } from './types';

export interface RecordTrackingDeps {
  runInTx: RunInTx;
  registerTracking: typeof repo.registerTracking;
  loadOutboundLines: typeof repo.loadOutboundLines;
  loadInboundLines: typeof repo.loadInboundLines;
  shipmentOrderOwners: typeof repo.shipmentOrderOwners;
  linkLineTracking: typeof repo.linkLineTracking;
  unlinkLineTracking: typeof repo.unlinkLineTracking;
}

const defaultDeps: RecordTrackingDeps = {
  runInTx: withTenantTransaction,
  registerTracking: repo.registerTracking,
  loadOutboundLines: repo.loadOutboundLines,
  loadInboundLines: repo.loadInboundLines,
  shipmentOrderOwners: repo.shipmentOrderOwners,
  linkLineTracking: repo.linkLineTracking,
  unlinkLineTracking: repo.unlinkLineTracking,
};

interface LineTracking {
  target: RecordTarget;
  orderKey: string | null;
  primaryShipmentId: number | null;
  linkedShipmentIds: number[];
}

/** Lock and load the named lines of both directions; refuse the ones not found. */
async function loadLines(
  tx: Tx,
  orgId: OrgId,
  targets: RecordTarget[],
  results: RecordResults,
  deps: RecordTrackingDeps,
): Promise<LineTracking[]> {
  const { outboundIds, inboundIds } = splitTargets(targets);
  const outbound = await deps.loadOutboundLines(tx, orgId, outboundIds);
  const inbound = await deps.loadInboundLines(tx, orgId, inboundIds);
  results.refuseMissing('outbound', outboundIds, outbound);
  results.refuseMissing('inbound', inboundIds, inbound);
  return [
    ...outbound.map((l) => ({
      target: { direction: 'outbound' as const, id: l.id },
      orderKey: `${l.accountSource ?? ''}|${l.orderNumber ?? ''}`,
      primaryShipmentId: l.primaryShipmentId,
      linkedShipmentIds: l.linkedShipmentIds,
    })),
    ...inbound.map((l) => ({
      target: { direction: 'inbound' as const, id: l.id },
      orderKey: null,
      primaryShipmentId: l.primaryShipmentId,
      linkedShipmentIds: l.linkedShipmentIds,
    })),
  ];
}

/** `set` / `add` one tracking number on the named lines. */
export async function applyRecordTracking(
  body: RecordTrackingBody,
  actor: RecordWriteActor,
  deps: RecordTrackingDeps = defaultDeps,
): Promise<RecordWriteOutcome> {
  const results = new RecordResults(body.targets);
  const shipmentId = await deps.registerTracking(body.tracking, actor.orgId);
  if (shipmentId == null) {
    for (const t of body.targets) results.refuse(t.direction, t.id, `${body.tracking} is not a tracking number`);
    return results.outcome({ orderIds: [], receivingLineIds: [] });
  }

  const changedOrders: number[] = [];
  const changedLines: number[] = [];
  await deps.runInTx(actor.orgId, async (tx) => {
    const lines = await loadLines(tx, actor.orgId, body.targets, results, deps);

    // An outbound tracking belongs to one order: refuse a line when another
    // order — none of whose lines are named here — already ships on it.
    const outbound = lines.filter((l) => l.orderKey != null);
    if (outbound.length > 0) {
      const named = new Set(outbound.map((l) => l.target.id));
      const owners = (await deps.shipmentOrderOwners(tx, actor.orgId, shipmentId)).filter((o) => !named.has(o.id));
      for (const line of outbound) {
        const foreign = owners.find((o) => `${o.accountSource ?? ''}|${o.orderNumber ?? ''}` !== line.orderKey);
        if (foreign) {
          results.refuse('outbound', line.target.id, `${body.tracking} already ships order ${foreign.orderNumber ?? `#${foreign.id}`} — remove it there first`);
        }
      }
    }

    for (const line of lines) {
      const { target, primaryShipmentId: oldPrimary, linkedShipmentIds: linked } = line;
      if (results.isRefused(target.direction, target.id)) continue;
      let after: { shipment_id: number | null; shipment_ids: number[] };

      if (body.mode === 'set') {
        if (oldPrimary === shipmentId) continue; // already this line's primary
        if (oldPrimary != null) await deps.unlinkLineTracking(tx, actor.orgId, target, oldPrimary);
        await deps.linkLineTracking(tx, actor.orgId, target, shipmentId, true, actor.staffId);
        after = { shipment_id: shipmentId, shipment_ids: [shipmentId, ...linked.filter((s) => s !== shipmentId && s !== oldPrimary)] };
      } else {
        if (oldPrimary === shipmentId || linked.includes(shipmentId)) continue; // already a box on this line
        const primary = oldPrimary == null;
        await deps.linkLineTracking(tx, actor.orgId, target, shipmentId, primary, actor.staffId);
        after = { shipment_id: primary ? shipmentId : oldPrimary, shipment_ids: [...linked, shipmentId] };
      }

      const outboundLine = target.direction === 'outbound';
      await actor.audit(tx, {
        action: !outboundLine
          ? AUDIT_ACTION.RECEIVING_LINE_TRACKING_SET
          : body.mode === 'set' && oldPrimary != null
            ? AUDIT_ACTION.TRACKING_REPLACED
            : AUDIT_ACTION.TRACKING_ADDED,
        entityType: outboundLine ? AUDIT_ENTITY.ORDER : AUDIT_ENTITY.RECEIVING_LINE,
        entityId: target.id,
        before: { shipment_id: oldPrimary, shipment_ids: linked },
        after,
        extra: { tracking: body.tracking, mode: body.mode, source: repo.RECORDS_LINK_SOURCE },
      });
      (outboundLine ? changedOrders : changedLines).push(target.id);
    }
  });
  return results.outcome({ orderIds: changedOrders, receivingLineIds: changedLines });
}

/** Unlink one tracking from the named lines; the tracking row stays. */
export async function unlinkRecordTracking(
  body: RecordTrackingUnlinkBody,
  actor: RecordWriteActor,
  deps: RecordTrackingDeps = defaultDeps,
): Promise<RecordWriteOutcome> {
  const results = new RecordResults(body.targets);
  const changedOrders: number[] = [];
  const changedLines: number[] = [];
  await deps.runInTx(actor.orgId, async (tx) => {
    const lines = await loadLines(tx, actor.orgId, body.targets, results, deps);
    for (const { target, primaryShipmentId, linkedShipmentIds } of lines) {
      if (primaryShipmentId !== body.shipmentId && !linkedShipmentIds.includes(body.shipmentId)) {
        results.refuse(target.direction, target.id, 'That tracking is not on this line');
        continue;
      }
      await deps.unlinkLineTracking(tx, actor.orgId, target, body.shipmentId);
      const outboundLine = target.direction === 'outbound';
      await actor.audit(tx, {
        action: outboundLine ? AUDIT_ACTION.TRACKING_UNLINKED : AUDIT_ACTION.RECEIVING_LINE_TRACKING_UNLINK,
        entityType: outboundLine ? AUDIT_ENTITY.ORDER : AUDIT_ENTITY.RECEIVING_LINE,
        entityId: target.id,
        before: { shipment_id: primaryShipmentId, shipment_ids: linkedShipmentIds },
        after: {
          shipment_id: primaryShipmentId === body.shipmentId ? null : primaryShipmentId,
          shipment_ids: linkedShipmentIds.filter((s) => s !== body.shipmentId),
        },
        extra: { unlinkedShipmentId: body.shipmentId },
      });
      (outboundLine ? changedOrders : changedLines).push(target.id);
    }
  });
  return results.outcome({ orderIds: changedOrders, receivingLineIds: changedLines });
}
