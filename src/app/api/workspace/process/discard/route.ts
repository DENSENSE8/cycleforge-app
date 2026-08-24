/**
 * POST /api/workspace/process/discard — discard a PROPOSED ledger entry.
 *
 * Domain: `discardLedgerEntry` (`src/lib/reversibility/ledger.ts`).
 *
 * ## "Discard" is not "delete"
 *
 * It moves the row to `rejected` — the status the schema already reserves for a
 * refusal, and the one `getMutationTrustStats` already counts as one. It never
 * runs `DELETE FROM agent_mutations`: that table is the record of what
 * happened, `agent_mutation_affects` cascades off it, and an operator who
 * "deleted" an applied action would be left with a changed database and no
 * trace of who changed it — the exact failure the reversibility work exists to
 * prevent.
 *
 * An APPLIED row is therefore refused with a 409 and an explanation, which is
 * passed through unchanged for the same reason the undo route passes its own
 * refusals through: the panel renders it, and the operator is the reader.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { withAuth } from '@/lib/auth/withAuth';
import { discardLedgerEntry } from '@/lib/reversibility/ledger';
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

    const result = await discardLedgerEntry(ctx.organizationId, parsed.data.mutationId);

    return NextResponse.json<ProcessActionResponse>(
      { ok: result.ok, ...(result.ok ? {} : { error: result.error }) },
      { status: result.status },
    );
  },
  { permission: 'operations.view' },
);
