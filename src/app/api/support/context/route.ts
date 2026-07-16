import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import { resolveSupportContext } from '@/lib/support/context';

export const dynamic = 'force-dynamic';

/**
 * GET /api/support/context
 *   ?order=…&tracking=…&ticket=…&receivingId=…&lineId=…
 *
 * One read for the Support Context Hub: linkage loop, primary ticket, entity
 * thread, connections, and merged activity timeline. Anchor-agnostic so
 * GlobalHeaderSearch can deep-link later without API changes.
 */

const Query = z.object({
  order: z.string().trim().min(1).optional(),
  tracking: z.string().trim().min(1).optional(),
  ticket: z.string().trim().min(1).optional(),
  receivingId: z.coerce.number().int().positive().optional(),
  lineId: z.coerce.number().int().optional(),
  ensureThread: z
    .enum(['0', '1', 'true', 'false'])
    .optional()
    .transform((v) => v == null || v === '1' || v === 'true'),
});

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const context = 'GET /api/support/context';
  try {
    const sp = req.nextUrl.searchParams;
    const parsed = Query.parse({
      order: sp.get('order') ?? undefined,
      tracking: sp.get('tracking') ?? undefined,
      ticket: sp.get('ticket') ?? undefined,
      receivingId: sp.get('receivingId') ?? undefined,
      lineId: sp.get('lineId') ?? undefined,
      ensureThread: sp.get('ensureThread') ?? undefined,
    });

    if (
      !parsed.order &&
      !parsed.tracking &&
      !parsed.ticket &&
      parsed.receivingId == null &&
      parsed.lineId == null
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Provide order, tracking, ticket, receivingId, or lineId',
        },
        { status: 400 },
      );
    }

    const bundle = await resolveSupportContext(ctx.organizationId, {
      order: parsed.order,
      tracking: parsed.tracking,
      ticket: parsed.ticket,
      receivingId: parsed.receivingId,
      lineId: parsed.lineId,
      ensureThread: parsed.ensureThread,
      staffId: ctx.staffId,
    });

    return NextResponse.json({ success: true, ...bundle });
  } catch (err) {
    return errorResponse(err, context);
  }
}, { permission: 'integrations.zendesk', feature: 'support' });
