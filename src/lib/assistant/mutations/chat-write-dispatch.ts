/**
 * Apply paths for the chat's order-status and task writes (review class:
 * reached through the operator's confirmation, a reviewer, or a revert). Each
 * reuses the domain write the desk uses; the payload carries ids only — the
 * model never supplies what is written beyond which records and which flag.
 */

import type { PoolClient } from 'pg';
import { z } from 'zod';
import type { OrgId } from '@/lib/tenancy/constants';
import { ORDER_ROW_FLAG_IDS } from '@/lib/orders/order-row-flags';
import { restoreOrderFlagsInTx, setOrderFlagsInTx } from '@/lib/orders/order-flags';
import {
  clearOrderLineShortages,
  reopenOrderLineShortages,
  upsertOrderLineShortage,
} from '@/lib/orders/order-line-shortage';
import { listingShortageIdentity } from '@/lib/orders/order-shortage-identity';
import { scanOutLabel } from '@/lib/outbound/scan-out';
import { createTask } from '@/lib/tasks/create-task';
import { createTaskLink } from '@/lib/tasks/task-links-db';
import { patchTaskDeskRowInTx } from '@/lib/tasks/list-tasks';

export const CHAT_WRITE_KINDS = [
  'order.set_flag',
  'order.mark_out_of_stock',
  'order.clear_out_of_stock',
  'order.scan_out',
  'task.create',
] as const;
export type ChatWriteKind = (typeof CHAT_WRITE_KINDS)[number];

type Payload = Record<string, unknown>;
type Inverse = { kind: string; payload: Payload } | null;
type DispatchResult =
  | { ok: true; inverse: Inverse; targetRef: string | null }
  | { ok: false; status: 400 | 404 | 409; error: string };

const ids = z.array(z.number().int().positive()).min(1).max(500);
const staffId = z.number().int().positive().nullable();

const FlagPayload = z.union([
  z.object({ orderIds: ids, flag: z.enum(ORDER_ROW_FLAG_IDS).nullable(), staffId }).strict(),
  z.object({ restore: z.array(z.object({ orderId: z.number().int().positive(), flag: z.enum(ORDER_ROW_FLAG_IDS).nullable() }).strict()).min(1).max(500), staffId }).strict(),
]);
const MarkOosPayload = z.object({ orderIds: ids }).strict();
const ClearOosPayload = z.union([
  z.object({ orderIds: ids }).strict(),
  z.object({ reopenShortageIds: z.array(z.string().min(1)).min(1).max(2000) }).strict(),
]);
const ScanOutPayload = z
  .object({
    shipments: z.array(z.object({ shipmentId: z.number().int().positive(), tracking: z.string().min(4).max(80) }).strict()).min(1).max(500),
    staffId,
  })
  .strict();
export const taskDraftSchema = z
  .object({
    note: z.string().trim().min(1).max(5000),
    assigneeStaffIds: z.array(z.number().int().positive()).min(1).max(20),
    orderRowId: z.number().int().positive().nullable(),
    ticket: z.string().trim().min(1).max(40).nullable(),
    deadlineAt: z.string().datetime().nullable(),
    remindAt: z.string().datetime().nullable(),
    actorStaffId: staffId,
  })
  .strict();
export type TaskDraft = z.infer<typeof taskDraftSchema>;
const TaskPayload = z.union([
  z.object({ task: taskDraftSchema, display: z.record(z.string(), z.unknown()).optional() }).strict(),
  z.object({ cancelTaskId: z.number().int().positive() }).strict(),
]);

function invalid(kind: string, error: z.ZodError): DispatchResult {
  const detail = error.issues.map((i) => `${i.path.map(String).join('.') || '(payload)'}: ${i.message}`).join('; ');
  return { ok: false, status: 400, error: `invalid ${kind} payload — ${detail}` };
}

export function isChatWriteKind(kind: string): kind is ChatWriteKind {
  return (CHAT_WRITE_KINDS as readonly string[]).includes(kind);
}

export async function dispatchChatWrite(
  client: Pick<PoolClient, 'query'>,
  orgId: OrgId,
  kind: ChatWriteKind,
  payload: Payload,
): Promise<DispatchResult> {
  switch (kind) {
    case 'order.set_flag': {
      const p = FlagPayload.safeParse(payload);
      if (!p.success) return invalid(kind, p.error);
      if ('restore' in p.data) {
        const restored = await restoreOrderFlagsInTx(client, orgId, p.data.restore, p.data.staffId);
        return { ok: true, inverse: null, targetRef: `${restored.length} orders` };
      }
      const r = await setOrderFlagsInTx(client, orgId, p.data.orderIds, p.data.flag, p.data.staffId);
      if (r.updatedIds.length === 0) return { ok: false, status: 404, error: 'None of those orders exist in this organization. Nothing was changed.' };
      return {
        ok: true,
        inverse: { kind, payload: { restore: r.prior, staffId: p.data.staffId } },
        targetRef: r.updatedIds.length === 1 ? String(r.updatedIds[0]) : `${r.updatedIds.length} orders`,
      };
    }
    case 'order.mark_out_of_stock': {
      const p = MarkOosPayload.safeParse(payload);
      if (!p.success) return invalid(kind, p.error);
      const lines = await client.query<{ id: number; sku: string | null; product_title: string | null; sku_catalog_id: number | null; already: boolean }>(
        `SELECT o.id, o.sku, o.product_title, o.sku_catalog_id,
                EXISTS (SELECT 1 FROM order_line_shortages s
                         WHERE s.organization_id = o.organization_id AND s.order_id = o.id AND s.status <> 'cleared') AS already
           FROM orders o
          WHERE o.organization_id = $1 AND o.id = ANY($2::int[])`,
        [orgId, p.data.orderIds],
      );
      if (lines.rows.length === 0) return { ok: false, status: 404, error: 'None of those order lines exist in this organization. Nothing was changed.' };
      const opened: number[] = [];
      for (const line of lines.rows) {
        if (line.already) continue;
        await upsertOrderLineShortage(client, {
          orgId,
          orderId: Number(line.id),
          identity: listingShortageIdentity({ sku: line.sku, skuCatalogId: line.sku_catalog_id, title: line.product_title, qtyShort: 1 }),
          createdBy: 'assistant',
        });
        opened.push(Number(line.id));
      }
      return {
        ok: true,
        inverse: opened.length > 0 ? { kind: 'order.clear_out_of_stock', payload: { orderIds: opened } } : null,
        targetRef: opened.length === 1 ? String(opened[0]) : `${opened.length} orders`,
      };
    }
    case 'order.clear_out_of_stock': {
      const p = ClearOosPayload.safeParse(payload);
      if (!p.success) return invalid(kind, p.error);
      if ('reopenShortageIds' in p.data) {
        const orders = await reopenOrderLineShortages(client, { orgId, shortageIds: p.data.reopenShortageIds });
        return { ok: true, inverse: null, targetRef: `${orders.length} orders` };
      }
      const cleared: string[] = [];
      for (const orderId of p.data.orderIds) {
        cleared.push(...(await clearOrderLineShortages(client, { orgId, orderId, clearedBy: 'assistant' })));
      }
      return {
        ok: true,
        inverse: cleared.length > 0 ? { kind, payload: { reopenShortageIds: cleared } } : null,
        targetRef: `${cleared.length} shortages`,
      };
    }
    case 'order.scan_out': {
      const p = ScanOutPayload.safeParse(payload);
      if (!p.success) return invalid(kind, p.error);
      // The dock path, per carton, on its own connections: idempotent (a
      // carton already out reports duplicate), and a refusal (cancelled,
      // delivered) is reported by the read-back, never forced.
      let confirmed = 0;
      for (const s of p.data.shipments) {
        const r = await scanOutLabel({ organizationId: orgId, scan: s.tracking, actorStaffId: p.data.staffId, createdAt: null, origin: 'bulk' });
        if (r.kind === 'confirmed') confirmed += 1;
      }
      return { ok: true, inverse: null, targetRef: `${confirmed} shipments` };
    }
    case 'task.create': {
      const p = TaskPayload.safeParse(payload);
      if (!p.success) return invalid(kind, p.error);
      if ('cancelTaskId' in p.data) {
        const r = await patchTaskDeskRowInTx(orgId, p.data.cancelTaskId, { status: 'CANCELED' }, {
          query: async (sql, params) => {
            const res = await client.query(sql, params as unknown[]);
            return { rows: res.rows as Array<Record<string, unknown>>, rowCount: res.rowCount };
          },
        });
        if (!r.ok) return { ok: false, status: r.reason === 'not_found' ? 404 : 409, error: `The task could not be cancelled (${r.reason}).` };
        return { ok: true, inverse: null, targetRef: String(p.data.cancelTaskId) };
      }
      const t = p.data.task;
      const created = await createTask(orgId, {
        entityType: t.orderRowId ? 'order' : null,
        entityId: t.orderRowId,
        assigneeStaffId: t.assigneeStaffIds[0],
        assigneeStaffIds: t.assigneeStaffIds,
        note: t.note,
        deadlineAt: t.deadlineAt,
        remindAt: t.remindAt,
        actorStaffId: t.actorStaffId,
      });
      if (!created.ok) return { ok: false, status: 400, error: `The task was not created (${created.reason}).` };
      const taskId = created.task.id;
      // The task already exists (createTask commits on its own), so a ticket
      // link the helpdesk refuses cannot roll it back — the read-back shows
      // the links that landed, and the operator can pair the ticket on the task.
      if (t.ticket) await createTaskLink(orgId, t.actorStaffId, taskId, { kind: 'ticket', value: t.ticket }).catch(() => null);
      return { ok: true, inverse: { kind, payload: { cancelTaskId: taskId } }, targetRef: String(taskId) };
    }
  }
}
