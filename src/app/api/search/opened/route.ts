import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { errorResponse } from '@/lib/api/errors';
import { withAuth } from '@/lib/auth/withAuth';
import { markSearchResultOpened } from '@/lib/search/query-log';

/**
 * The click half of search telemetry.
 *
 * POST /api/search/opened  { query, entityType, entityId }
 *
 * WHY A SEPARATE CALL
 *   The search itself is logged server-side when it runs, but the thing that
 *   makes the log worth keeping is which row ANSWERED it — and only the client
 *   knows that, because it happens after the response. A search with no open is
 *   the abandonment signal; a search whose open lands on the fourth row says the
 *   ranking is wrong even though the record was found. Neither is visible from
 *   the server alone.
 *
 * FIRE AND FORGET
 *   Responds 202 without waiting for the write. The caller is a `sendBeacon`
 *   on a navigation path and must never be blocked, and a lost beacon costs a
 *   data point, not correctness.
 */

const bodySchema = z.object({
  /** The query the row was found with — matched on its normalized form. */
  query: z.string().min(1).max(512),
  entityType: z.string().min(1).max(64),
  entityId: z.coerce.number().int().positive(),
});

export const POST = withAuth(async (req, ctx) => {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }

    // orgId comes from the verified session, never the body.
    after(() =>
      markSearchResultOpened({
        orgId: ctx.organizationId,
        staffId: ctx.staffId ?? null,
        query: parsed.data.query,
        entityType: parsed.data.entityType,
        entityId: parsed.data.entityId,
      }),
    );

    return new NextResponse(null, { status: 202 });
  } catch (err) {
    return errorResponse(err, 'POST /api/search/opened');
  }
});
