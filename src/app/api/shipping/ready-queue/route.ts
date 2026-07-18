import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { z } from 'zod';
import { getReadyQueue } from '@/lib/channel-allocation';

const QuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(500).optional(),
    disposition: z.enum(['FBA', 'PREBOX_STOCK', 'HOLD']).optional(),
    q: z.string().trim().max(200).optional(),
  })
  .strict();

/**
 * GET /api/shipping/ready-queue
 *
 * Recently-tested history with channel-allocation recommendations overlaid on
 * units that are still eligible for FBA vs pre-box/stock.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const raw = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = parseBody(QuerySchema, raw);
  if (parsed instanceof NextResponse) return parsed;

  try {
    const hits = await getReadyQueue(ctx.organizationId, {
      limit: parsed.limit,
      disposition: parsed.disposition ?? null,
      q: parsed.q ?? null,
    });
    return NextResponse.json({ ok: true, hits, count: hits.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load ready queue';
    console.error('Error in GET /api/shipping/ready-queue:', error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}, { permission: 'shipping.view' });
