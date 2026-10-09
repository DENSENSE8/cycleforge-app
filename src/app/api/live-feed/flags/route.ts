import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import pool from '@/lib/db';
import { addLiveFeedFlags, clearLiveFeedFlags } from '@/lib/live-feed/card-writes';
import { LIVE_FEED_FLAG_NOTE_MAX, LIVE_FEED_FLAG_NOTE_REQUIRED, LIVE_FEED_FLAG_REASON_IDS } from '@/lib/live-feed/flags';
import { publishOrderChanged } from '@/lib/realtime/publish';
import { parseBody } from '@/lib/schemas/parse';
import { withTenantTransaction } from '@/lib/tenancy/db';

/**
 * Live feed flags (`live_feed_flags`, `src/lib/live-feed/flags.ts`) — `POST`
 * flags the cards with a reason (+ note); `DELETE` clears one reason, or every
 * reason when none is named. Card ids: order rows, unlinked boxes, unmatched
 * scans (`src/lib/live-feed/subjects.ts`). Open boards hear the change.
 */

const CardIds = z.array(z.number().int().refine((id) => id !== 0)).min(1).max(500);

const FlagBody = z
  .object({
    cardIds: CardIds,
    reason: z.enum(LIVE_FEED_FLAG_REASON_IDS),
    note: z.string().trim().max(LIVE_FEED_FLAG_NOTE_MAX).nullish(),
  })
  .refine((body) => !LIVE_FEED_FLAG_NOTE_REQUIRED[body.reason] || Boolean(body.note), { message: 'Say why in the note', path: ['note'] });

const ClearBody = z.object({ cardIds: CardIds, reason: z.string().trim().min(1).max(40).nullish() });

async function write(req: NextRequest, op: 'flag' | 'clear') {
  const gate = await requireRoutePerm(req, 'orders.create');
  if (gate.denied) return gate.denied;
  const orgId = gate.ctx.organizationId;
  const staffId = gate.ctx.staffId ?? null;
  const raw = await req.json().catch(() => null);

  let changed: number[];
  let after: Record<string, unknown>;
  if (op === 'flag') {
    const parsed = parseBody(FlagBody, raw);
    if (parsed instanceof NextResponse) return parsed;
    const note = parsed.note || null;
    changed = await withTenantTransaction(orgId, (tx) =>
      addLiveFeedFlags(tx, { orgId, cardIds: parsed.cardIds, reason: parsed.reason, note, staffId }),
    );
    after = { flagged: parsed.reason, note, cardIds: changed };
  } else {
    const parsed = parseBody(ClearBody, raw);
    if (parsed instanceof NextResponse) return parsed;
    const reason = parsed.reason ?? null;
    changed = await withTenantTransaction(orgId, (tx) => clearLiveFeedFlags(tx, { orgId, cardIds: parsed.cardIds, reason, staffId }));
    after = { cleared: reason ?? 'all', cardIds: changed };
  }

  if (changed.length > 0) {
    await publishOrderChanged({ organizationId: orgId, orderIds: changed, source: `live-feed.${op}` });
    const first = changed[0]!;
    await recordAudit(pool, gate.ctx, req, {
      source: 'live-feed-flag',
      action: AUDIT_ACTION.ORDER_UPDATE,
      entityType: first > 0 ? AUDIT_ENTITY.ORDER : AUDIT_ENTITY.SHIPMENT,
      entityId: Math.abs(first),
      after,
    });
  }
  // A card already holding (or already clear of) the reason is not an error — the board already agrees.
  return NextResponse.json({ changedIds: changed });
}

export async function POST(req: NextRequest) {
  try {
    return await write(req, 'flag');
  } catch (error: unknown) {
    console.error('[POST /api/live-feed/flags] error:', error);
    return NextResponse.json({ error: 'Failed to flag' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    return await write(req, 'clear');
  } catch (error: unknown) {
    console.error('[DELETE /api/live-feed/flags] error:', error);
    return NextResponse.json({ error: 'Failed to clear the flag' }, { status: 500 });
  }
}
