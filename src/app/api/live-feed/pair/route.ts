import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import pool from '@/lib/db';
import { LIVE_FEED_PAIR_SOURCE, pairLiveFeedCard } from '@/lib/live-feed/pair';
import { publishOrderChanged } from '@/lib/realtime/publish';
import { parseBody } from '@/lib/schemas/parse';

/**
 * Pair (`POST { cardId, orderRowId }`) — link a Live feed card no order owns
 * (an unlinked box or an unmatched dock scan) to an order, backfilling the
 * scan-out onto its box (`src/lib/live-feed/pair.ts`). Answers the order row
 * the card became, so the board can follow it.
 */

const PairBody = z.object({
  cardId: z.number().int().negative(),
  orderRowId: z.number().int().positive(),
});

export async function POST(req: NextRequest) {
  try {
    const gate = await requireRoutePerm(req, 'orders.create');
    if (gate.denied) return gate.denied;
    const parsed = parseBody(PairBody, await req.json().catch(() => null));
    if (parsed instanceof NextResponse) return parsed;
    const orgId = gate.ctx.organizationId;

    const out = await pairLiveFeedCard({ orgId, staffId: gate.ctx.staffId ?? null, cardId: parsed.cardId, orderRowId: parsed.orderRowId });
    if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status });

    await invalidateCacheTags(['orders', 'shipped', 'packing-logs']);
    await publishOrderChanged({ organizationId: orgId, orderIds: [out.orderRowId, parsed.cardId], source: LIVE_FEED_PAIR_SOURCE });
    await recordAudit(pool, gate.ctx, req, {
      source: 'live-feed-pair',
      action: AUDIT_ACTION.TRACKING_ADDED,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: out.orderRowId,
      after: { shipment_id: out.shipmentId, tracking: out.tracking, card_id: parsed.cardId, backfilled_scans: out.backfilledScans },
    });

    return NextResponse.json({ orderRowId: out.orderRowId, shipmentId: out.shipmentId, tracking: out.tracking });
  } catch (error: unknown) {
    console.error('[POST /api/live-feed/pair] error:', error);
    return NextResponse.json({ error: 'Failed to pair' }, { status: 500 });
  }
}
