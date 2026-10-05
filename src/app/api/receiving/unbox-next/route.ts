/**
 * GET /api/receiving/unbox-next — arrived, not-yet-opened packages in the order
 * Unbox takes them: urgent first, then oldest door time first. Urgency is the
 * package's own (never the shelf's); location is wherever it is paired.
 * Wire shape: `UnboxQueueResponse` in `src/lib/receiving/arrival-contract.ts`.
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { readUnboxQueue } from '@/lib/receiving/arrival-package';
import type { UnboxQueueResponse } from '@/lib/receiving/arrival-contract';

export const GET = withAuth(
  async (_request, ctx) => {
    const items = await readUnboxQueue(ctx.organizationId);
    return NextResponse.json({ success: true, items } satisfies UnboxQueueResponse);
  },
  { permission: 'receiving.view' },
);
