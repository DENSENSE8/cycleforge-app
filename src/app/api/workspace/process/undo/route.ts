/**
 * POST /api/workspace/process/undo — undo one ledger entry.
 *
 * Domain: `revertAgentMutation` (`src/lib/assistant/mutations/apply-agent-mutation.ts`).
 *
 * ## Two things this route deliberately does not do
 *
 * 1. **It does not decide whether the entry is reversible.** The chokepoint
 *    reads the row `FOR UPDATE`, finds the inverse descriptor captured at apply
 *    time, and refuses with the REASON recorded then. Re-deriving that out here
 *    would be a second opinion about a fact the ledger already stores.
 *
 * 2. **It does not gate on the entry's own permission.** `ctx.permissions` is
 *    passed IN so the chokepoint can check it per-KIND, which is the only place
 *    the kind is known — see the note in the GET route.
 *
 * The chokepoint's `error` string is returned VERBATIM. Those strings are
 * written for an operator to read ("Ending is terminal: resumeSession refuses
 * an ended session") and the Process panel renders them; replacing one with
 * "HTTP 409" would throw away the only part of the response that explains
 * anything.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { withAuth } from '@/lib/auth/withAuth';
import { revertAgentMutation } from '@/lib/assistant/mutations/apply-agent-mutation';
import type { ProcessActionResponse } from '@/lib/reversibility/client';

const Body = z.strictObject({ mutationId: z.number().int().positive() });

export const POST = withAuth(
  async (req: NextRequest, ctx) => {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json<ProcessActionResponse>(
        { ok: false, error: 'mutationId must be a positive integer' },
        { status: 400 },
      );
    }

    const result = await revertAgentMutation(
      parsed.data.mutationId,
      ctx.organizationId,
      ctx.staffId ?? null,
      undefined,
      ctx.permissions,
    );

    return NextResponse.json<ProcessActionResponse>(
      { ok: result.ok, ...(result.error ? { error: result.error } : {}) },
      { status: result.status },
    );
  },
  { permission: 'operations.view' },
);
