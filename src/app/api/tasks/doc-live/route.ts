/**
 * `POST /api/tasks/doc-live` — resolve a task document's live parts in one
 * call: every reference token (task, staffer, repair, ticket, order, SKU) and
 * every ```tasks``` block on the page, read at view time (P6: reference, never
 * copy). A read: POST only because the batch does not fit a query string.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { DOC_LIVE_QUERIES_MAX, DOC_LIVE_REFS_MAX, DOC_REF_KINDS } from '@/lib/tasks/doc-live';
import { resolveDocLive } from '@/lib/tasks/doc-live-db';

export const dynamic = 'force-dynamic';

const Body = z.object({
  refs: z
    .array(z.object({ kind: z.enum(DOC_REF_KINDS), value: z.string().trim().min(1).max(80) }))
    .max(DOC_LIVE_REFS_MAX),
  queries: z.array(z.string().max(2000)).max(DOC_LIVE_QUERIES_MAX),
});

export const POST = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const parsed = Body.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
      }
      // Tenant from the auth context; every statement runs under it.
      return NextResponse.json(await resolveDocLive(ctx.organizationId, parsed.data));
    } catch (error) {
      return errorResponse(error, 'POST /api/tasks/doc-live');
    }
  },
  { permission: 'work_orders.claim' },
);
