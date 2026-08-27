import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { getPackerBoxCountsForDay } from '@/lib/packing/packer-box-counts';
import { getCurrentPSTDateKey, isDateKey } from '@/utils/date';

const QuerySchema = z
  .object({
    day: z.string().trim().min(1).optional(),
  })
  .strict();

/**
 * GET /api/packing/box-counts?day=YYYY-MM-DD
 *
 * One row per packer for the warehouse civil day: PACK_COMPLETED count.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const raw = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = parseBody(QuerySchema, raw);
  if (parsed instanceof NextResponse) return parsed;

  const day = parsed.day ?? getCurrentPSTDateKey();
  if (!isDateKey(day)) {
    return NextResponse.json({ ok: false, error: 'day must be YYYY-MM-DD' }, { status: 400 });
  }

  try {
    const report = await getPackerBoxCountsForDay(ctx.organizationId, day);
    return NextResponse.json({ ok: true, ...report });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load box counts';
    console.error('Error in GET /api/packing/box-counts:', error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}, { permission: 'operations.view' });
