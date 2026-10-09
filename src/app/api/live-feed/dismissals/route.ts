import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import pool from '@/lib/db';
import { dismissUnlinkedCards, restoreUnlinkedCards } from '@/lib/live-feed/card-writes';
import { UNLINKED_DISMISS_NOTE_MAX, UNLINKED_DISMISS_NOTE_REQUIRED, UNLINKED_DISMISS_REASON_IDS } from '@/lib/live-feed/dismissals';
import { publishOrderChanged } from '@/lib/realtime/publish';
import { parseBody } from '@/lib/schemas/parse';
import { withTenantTransaction } from '@/lib/tenancy/db';

/**
 * Remove from list (`POST`) / put back (`DELETE`) for Live feed cards no order
 * owns — unlinked boxes and unmatched dock scans (`live_feed_dismissals`,
 * `src/lib/live-feed/dismissals.ts`). Order cards use `/api/orders/list-removal`.
 */

const UnlinkedIds = z.array(z.number().int().negative()).min(1).max(500);

const DismissBody = z
  .object({
    cardIds: UnlinkedIds,
    reason: z.enum(UNLINKED_DISMISS_REASON_IDS),
    note: z.string().trim().max(UNLINKED_DISMISS_NOTE_MAX).nullish(),
  })
  .refine((body) => !UNLINKED_DISMISS_NOTE_REQUIRED[body.reason] || Boolean(body.note), { message: 'Say why in the note', path: ['note'] });

const RestoreBody = z.object({ cardIds: UnlinkedIds });

async function write(req: NextRequest, op: 'dismiss' | 'restore') {
  const gate = await requireRoutePerm(req, 'orders.create');
  if (gate.denied) return gate.denied;
  const orgId = gate.ctx.organizationId;
  const staffId = gate.ctx.staffId ?? null;
  const raw = await req.json().catch(() => null);

  let changed: number[];
  let after: Record<string, unknown>;
  if (op === 'dismiss') {
    const parsed = parseBody(DismissBody, raw);
    if (parsed instanceof NextResponse) return parsed;
    const note = parsed.note || null;
    changed = await withTenantTransaction(orgId, (tx) =>
      dismissUnlinkedCards(tx, { orgId, cardIds: parsed.cardIds, reason: parsed.reason, note, staffId }),
    );
    after = { removedFromList: true, reason: parsed.reason, note, cardIds: changed };
  } else {
    const parsed = parseBody(RestoreBody, raw);
    if (parsed instanceof NextResponse) return parsed;
    changed = await withTenantTransaction(orgId, (tx) => restoreUnlinkedCards(tx, { orgId, cardIds: parsed.cardIds, staffId }));
    after = { removedFromList: false, cardIds: changed };
  }

  if (changed.length > 0) {
    await publishOrderChanged({ organizationId: orgId, orderIds: changed, source: `live-feed.${op}` });
    await recordAudit(pool, gate.ctx, req, {
      source: 'live-feed-dismissal',
      action: AUDIT_ACTION.ORDER_UPDATE,
      entityType: AUDIT_ENTITY.SHIPMENT,
      entityId: Math.abs(changed[0]!),
      after,
    });
  }
  return NextResponse.json({ changedIds: changed });
}

export async function POST(req: NextRequest) {
  try {
    return await write(req, 'dismiss');
  } catch (error: unknown) {
    console.error('[POST /api/live-feed/dismissals] error:', error);
    return NextResponse.json({ error: 'Failed to remove from list' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    return await write(req, 'restore');
  } catch (error: unknown) {
    console.error('[DELETE /api/live-feed/dismissals] error:', error);
    return NextResponse.json({ error: 'Failed to put it back' }, { status: 500 });
  }
}
