import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { errorResponse } from '@/lib/api/errors';
import { withAuth } from '@/lib/auth/withAuth';
import { markSearchResultOpened } from '@/lib/search/query-log';

/** The click half of search telemetry. */

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
