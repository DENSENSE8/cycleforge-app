/**
 * POST /api/orders/import/suggest-mapping
 *
 * Proposes column mappings for an uploaded order list, for the canonical fields
 * the deterministic alias map did not claim. The response is a SUGGESTION set —
 * the operator confirms each one in the mapping panel before anything imports.
 *
 * Generation, not mutation (backend-patterns.md → AI generation routes): no
 * audit row, but a per-org rate limit and a capability gate. Reuses the existing
 * `orders.import` permission because this is a step inside that flow, not a new
 * capability — an operator who may not import has no use for a mapping hint.
 *
 * Nothing here writes: the file never leaves the request, no staging row is
 * touched, and a failed model call degrades to "no suggestions" rather than
 * blocking the import the operator can still do by hand.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import { checkRateLimitForOrg } from '@/lib/api-guard';
import { proposeColumnMapping } from '@/lib/orders/ai-column-mapping';

export const runtime = 'nodejs';

const Body = z.object({
  headers: z.array(z.string()).min(1).max(200),
  /** Capped: a mapping hint needs a few rows, never the whole file. */
  sampleRows: z.array(z.record(z.string(), z.string())).max(20).default([]),
  deterministicMapping: z.record(z.string(), z.string()).default({}),
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const rate = await checkRateLimitForOrg({
    headers: req.headers,
    routeKey: 'orders-import-suggest-mapping',
    limit: Number(process.env.AI_CHAT_RATE_LIMIT || 25),
    windowMs: 60 * 1000,
    organizationId: ctx.organizationId,
  });
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again shortly.' },
      {
        status: 429,
        headers: rate.retryAfterSec ? { 'Retry-After': String(rate.retryAfterSec) } : undefined,
      },
    );
  }

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'INVALID_INPUT', detail: err instanceof Error ? err.message : 'bad request' },
      { status: 400 },
    );
  }

  try {
    const proposal = await proposeColumnMapping(ctx.organizationId, {
      headers: parsed.headers,
      sampleRows: parsed.sampleRows,
      deterministicMapping: parsed.deterministicMapping,
    });
    return NextResponse.json({ success: true, ...proposal });
  } catch (err) {
    // No provider connected, whole chain down, or a malformed tool call. The
    // operator can still map by hand, so this is an empty suggestion set with a
    // stated reason — never a 500 that reads like the import itself broke.
    return NextResponse.json({
      success: false,
      suggestions: [],
      stillUnmapped: [],
      rejectedHallucinations: [],
      detail: err instanceof Error ? err.message : 'Mapping suggestions are unavailable.',
    });
  }
}, { permission: 'orders.import' });
