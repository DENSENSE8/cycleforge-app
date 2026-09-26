import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { z } from 'zod';
import { getCurrentPSTDateKey } from '@/utils/date';
import { getPackingKpisForDay } from '@/lib/packing/packer-kpi-queries';

const QuerySchema = z
  .object({
    day: z.string().trim().min(1).optional(), // YYYY-MM-DD in PST
  })
  .strict();

/**
 * GET /api/packing/kpi?day=YYYY-MM-DD
 *
 * Manager-facing packing KPI summary: per-packer counts by tier and weighted minutes,
 * plus capacity used/remaining and an advisory FBA fill suggestion.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const raw = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = parseBody(QuerySchema, raw);
  if (parsed instanceof NextResponse) return parsed;

  const day = parsed.day ?? getCurrentPSTDateKey();
  const summary = await getPackingKpisForDay(ctx.organizationId, day);
  return NextResponse.json({ ok: true, ...summary });
}, { permission: 'operations.view' });

