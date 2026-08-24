/**
 * GET /api/workspace/process?sessionId=… — one session's Process ledger.
 *
 * Domain: `src/lib/reversibility/ledger.ts`. Tables: `agent_mutations` (joined
 * to `staff` for the actor's name).
 *
 * House skeleton: withAuth → validate → domain helper → JSON. `orgId` comes
 * from `ctx.organizationId` and is NEVER read from the query string — a client
 * that could name its own tenant would be the whole tenancy model, undone.
 *
 * The response shape is pinned by `ProcessLedgerResponse` in
 * `@/lib/reversibility/client`, which is also what the panel's fetch parses, so
 * both halves of the wire compile against one type rather than two that agree
 * by inspection.
 *
 * `operations.view` gates all three Process routes. It is a READ permission on
 * a route that also drives undo, and that is deliberate: `revertAgentMutation`
 * re-checks the actor's permission against the specific KIND being reverted,
 * which cannot happen out here because the kind is not known until the row is
 * read. A blanket write permission here would be a second, weaker copy of a
 * check that already exists in the right place.
 */

import { NextRequest, NextResponse } from 'next/server';

import { withAuth } from '@/lib/auth/withAuth';
import { readSessionLedger } from '@/lib/reversibility/ledger';
import type { ProcessLedgerResponse } from '@/lib/reversibility/client';

export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    const raw = req.nextUrl.searchParams.get('sessionId');
    const sessionId = Number(raw);
    if (!raw || !Number.isInteger(sessionId) || sessionId <= 0) {
      return NextResponse.json<ProcessLedgerResponse>(
        { ok: false, entries: [], error: 'sessionId must be a positive integer' },
        { status: 400 },
      );
    }

    const entries = await readSessionLedger(ctx.organizationId, sessionId);
    return NextResponse.json<ProcessLedgerResponse>({ ok: true, entries });
  },
  { permission: 'operations.view' },
);
