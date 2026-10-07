/**
 * Records sheet — "Change order number" (handoff §4.2). Outbound re-keys the
 * named `orders` rows under the new number; the WHOLE request is refused (the
 * route answers 409) when any line would collide on the unique key
 * `(organization_id, order_id, account_source, external_line_id)` — checked
 * first, then written in the same transaction. Payment requests
 * (`order_payments.order_number`) follow when every line of the old number
 * moved. ShipStation refs keep the channel's own number (linked by row id).
 *
 * Inbound renames the line's inbound order (`inbound_order.order_number`, and
 * the purchase mirror's number through the desk's identity writer) — an
 * order-scoped value, so every line of that order must be named.
 */

import { AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import type { RecordOrderNumberBody } from '@/lib/records/sheet-actions-contract';
import { withTenantTransaction } from '@/lib/tenancy/db';
import * as repo from './repo';
import { RecordResults, splitTargets, type RecordWriteActor, type RecordWriteOutcome, type RunInTx } from './types';

export interface RecordOrderNumberDeps {
  runInTx: RunInTx;
  loadOutboundLines: typeof repo.loadOutboundLines;
  loadInboundLines: typeof repo.loadInboundLines;
  findOrderNumberCollision: typeof repo.findOrderNumberCollision;
  orderRowCounts: typeof repo.orderRowCounts;
  openPaymentOrderNumbers: typeof repo.openPaymentOrderNumbers;
  rekeyOrderLines: typeof repo.rekeyOrderLines;
  moveOrderPayments: typeof repo.moveOrderPayments;
  loadInboundOrders: typeof repo.loadInboundOrders;
  renameInboundOrder: typeof repo.renameInboundOrder;
}

const defaultDeps: RecordOrderNumberDeps = {
  runInTx: withTenantTransaction,
  loadOutboundLines: repo.loadOutboundLines,
  loadInboundLines: repo.loadInboundLines,
  findOrderNumberCollision: repo.findOrderNumberCollision,
  orderRowCounts: repo.orderRowCounts,
  openPaymentOrderNumbers: repo.openPaymentOrderNumbers,
  rekeyOrderLines: repo.rekeyOrderLines,
  moveOrderPayments: repo.moveOrderPayments,
  loadInboundOrders: repo.loadInboundOrders,
  renameInboundOrder: repo.renameInboundOrder,
};

export type RecordOrderNumberResult = { ok: true; outcome: RecordWriteOutcome } | { ok: false; error: string };

export async function changeRecordOrderNumber(
  body: RecordOrderNumberBody,
  actor: RecordWriteActor,
  deps: RecordOrderNumberDeps = defaultDeps,
): Promise<RecordOrderNumberResult> {
  const next = body.orderNumber;
  const results = new RecordResults(body.targets);
  const { outboundIds, inboundIds } = splitTargets(body.targets);

  return deps.runInTx(actor.orgId, async (tx): Promise<RecordOrderNumberResult> => {
    // ── Read + check everything before writing anything ──────────────────
    const outbound = await deps.loadOutboundLines(tx, actor.orgId, outboundIds);
    const inbound = await deps.loadInboundLines(tx, actor.orgId, inboundIds);
    results.refuseMissing('outbound', outboundIds, outbound);
    results.refuseMissing('inbound', inboundIds, inbound);

    const moving = outbound.filter((l) => l.orderNumber !== next);
    const keys = new Set<string>();
    for (const line of moving) {
      if (line.accountSource == null || line.externalLineId == null) continue;
      const key = `${line.accountSource}|${line.externalLineId}`;
      if (keys.has(key)) {
        return { ok: false, error: `Order ${next} already has a line ${line.externalLineId} on ${line.platformLabel ?? line.accountSource}` };
      }
      keys.add(key);
    }
    const collision = await deps.findOrderNumberCollision(tx, actor.orgId, next, moving);
    if (collision) {
      return { ok: false, error: `Order ${next} already has a line ${collision.externalLineId} on ${collision.platformLabel}` };
    }

    // Payment requests are keyed by number: they follow an order that moves whole.
    const movingByOld = new Map<string, number>();
    for (const line of moving) {
      if (line.orderNumber) movingByOld.set(line.orderNumber, (movingByOld.get(line.orderNumber) ?? 0) + 1);
    }
    const rowCounts = await deps.orderRowCounts(tx, actor.orgId, [...movingByOld.keys()]);
    const movedWhole = [...movingByOld].filter(([old, n]) => rowCounts.get(old) === n).map(([old]) => old);
    if (movedWhole.length > 0) {
      const open = await deps.openPaymentOrderNumbers(tx, actor.orgId, [next, ...movedWhole]);
      const openOld = movedWhole.filter((old) => open.has(old));
      if (openOld.length > 1 || (openOld.length === 1 && open.has(next))) {
        return { ok: false, error: `Order ${openOld[0]} and order ${next} would both have an open payment request — settle or cancel one first` };
      }
    }

    // Inbound: the number belongs to the inbound order.
    const namedInbound = new Set(inbound.map((l) => l.id));
    for (const line of inbound) {
      if (line.inboundOrderId == null) results.refuse('inbound', line.id, 'This line has no inbound order to rename');
    }
    const inboundOrders = await deps.loadInboundOrders(
      tx,
      actor.orgId,
      [...new Set(inbound.flatMap((l) => (l.inboundOrderId != null ? [l.inboundOrderId] : [])))],
    );
    const renames: Array<{ order: repo.InboundOrderRow; identityLineId: number | null }> = [];
    for (const order of inboundOrders) {
      const named = order.lineIds.filter((id) => namedInbound.has(id));
      let reason: string | null = null;
      if (order.sourceType === 'zoho') reason = 'Zoho purchase orders are renamed in Zoho';
      else if (named.length < order.lineIds.length) {
        reason = `Change all ${order.lineIds.length} lines of this inbound order together`;
      }
      if (reason) {
        for (const id of named) results.refuse('inbound', id, reason);
        continue;
      }
      if (order.orderNumber === next) continue;
      const identityLine = inbound.find((l) => l.inboundOrderId === order.id && l.sourceType && l.sourceOrderId);
      renames.push({ order, identityLineId: identityLine?.id ?? null });
    }

    // ── Write ────────────────────────────────────────────────────────────
    if (moving.length > 0) {
      await deps.rekeyOrderLines(tx, actor.orgId, moving.map((l) => l.id), next);
      if (movedWhole.length > 0) await deps.moveOrderPayments(tx, actor.orgId, movedWhole, next);
      for (const line of moving) {
        await actor.audit(tx, {
          action: AUDIT_ACTION.ORDER_RENUMBER,
          entityType: AUDIT_ENTITY.ORDER,
          entityId: line.id,
          before: { order_id: line.orderNumber },
          after: { order_id: next },
          extra: { account_source: line.accountSource, external_line_id: line.externalLineId },
        });
      }
    }
    const renamedLines: number[] = [];
    for (const { order, identityLineId } of renames) {
      await deps.renameInboundOrder(tx, actor.orgId, order.id, next, identityLineId);
      for (const lineId of order.lineIds) {
        await actor.audit(tx, {
          action: AUDIT_ACTION.INBOUND_ORDER_RENUMBER,
          entityType: AUDIT_ENTITY.RECEIVING_LINE,
          entityId: lineId,
          before: { order_number: order.orderNumber },
          after: { order_number: next },
          extra: { inbound_order_id: order.id },
        });
        renamedLines.push(lineId);
      }
    }
    return { ok: true, outcome: results.outcome({ orderIds: moving.map((l) => l.id), receivingLineIds: renamedLines }) };
  });
}
