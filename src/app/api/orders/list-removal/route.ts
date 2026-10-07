import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { parseBody } from '@/lib/schemas/parse';
import pool from '@/lib/db';
import { invalidateAllOrdersApiCaches } from '@/lib/orders/invalidation';
import {
  LIST_REMOVAL_NOTE_MAX,
  LIST_REMOVAL_NOTE_REQUIRED,
  LIST_REMOVAL_REASON_IDS,
} from '@/lib/orders/list-removal';
import { removeOrdersFromList, restoreOrdersToList } from '@/lib/orders/list-removal-store';
import { publishOrderChanged } from '@/lib/realtime/publish';
import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

/**
 * Remove from list (`POST`) / put back (`DELETE`) — orders leave the To-ship
 * list (Allocate + Live feed) with a reason; the rows stay. See
 * `src/lib/orders/list-removal.ts`.
 */

const OrderIds = z.array(z.number().int().positive()).min(1).max(500);

const RemoveBody = z
  .object({
    orderIds: OrderIds,
    reason: z.enum(LIST_REMOVAL_REASON_IDS),
    note: z.string().trim().max(LIST_REMOVAL_NOTE_MAX).nullish(),
  })
  .refine((body) => !LIST_REMOVAL_NOTE_REQUIRED.has(body.reason) || Boolean(body.note), {
    message: 'Say why in the note',
    path: ['note'],
  });

const RestoreBody = z.object({ orderIds: OrderIds });

/** Every orders list re-reads, and open boards (Allocate, Live feed) hear the change. */
async function afterWrite(orgId: OrgId, ids: number[], source: string) {
  await invalidateAllOrdersApiCaches(['shipped', 'packing-logs'], orgId);
  await publishOrderChanged({ organizationId: orgId, orderIds: ids, source });
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requireRoutePerm(req, 'orders.create');
    if (gate.denied) return gate.denied;

    const parsed = parseBody(RemoveBody, await req.json().catch(() => null));
    if (parsed instanceof NextResponse) return parsed;

    const orgId = gate.ctx.organizationId;
    const removedIds = await withTenantTransaction(orgId, (client) =>
      removeOrdersFromList(client, {
        orgId,
        orderIds: parsed.orderIds,
        reason: parsed.reason,
        note: parsed.note || null,
        staffId: gate.ctx.staffId ?? null,
      }),
    );

    if (removedIds.length > 0) {
      await afterWrite(orgId, removedIds, 'orders.list-removal');
      await recordAudit(pool, gate.ctx, req, {
        source: 'orders-list-removal',
        action: AUDIT_ACTION.ORDER_UPDATE,
        entityType: AUDIT_ENTITY.ORDER,
        entityId: removedIds[0] ?? 0,
        after: { removedFromList: true, reason: parsed.reason, note: parsed.note || null, orderIds: removedIds },
      });
    }

    // An order already off the list is not an error — the list already agrees.
    return NextResponse.json({ success: true, removedIds });
  } catch (error: unknown) {
    console.error('[POST /api/orders/list-removal] error:', error);
    const details = error instanceof Error ? error.message : 'Failed to remove from list';
    return NextResponse.json({ error: 'Failed to remove from list', details }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const gate = await requireRoutePerm(req, 'orders.create');
    if (gate.denied) return gate.denied;

    const parsed = parseBody(RestoreBody, await req.json().catch(() => null));
    if (parsed instanceof NextResponse) return parsed;

    const orgId = gate.ctx.organizationId;
    const restoredIds = await withTenantTransaction(orgId, (client) =>
      restoreOrdersToList(client, { orgId, orderIds: parsed.orderIds, staffId: gate.ctx.staffId ?? null }),
    );

    if (restoredIds.length > 0) {
      await afterWrite(orgId, restoredIds, 'orders.list-restore');
      await recordAudit(pool, gate.ctx, req, {
        source: 'orders-list-restore',
        action: AUDIT_ACTION.ORDER_UPDATE,
        entityType: AUDIT_ENTITY.ORDER,
        entityId: restoredIds[0] ?? 0,
        after: { removedFromList: false, orderIds: restoredIds },
      });
    }

    return NextResponse.json({ success: true, restoredIds });
  } catch (error: unknown) {
    console.error('[DELETE /api/orders/list-removal] error:', error);
    const details = error instanceof Error ? error.message : 'Failed to put back on the list';
    return NextResponse.json({ error: 'Failed to put back on the list', details }, { status: 500 });
  }
}
