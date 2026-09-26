/**
 * Cron: re-drive workflow taps that never landed.
 * session wrapper (see docs/security/route-permissions.json exemption
 */

import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest, unauthorizedCronResponse } from '@/lib/cron/auth';
import { clampInt } from '@/lib/cron/params';
import { withCronLock } from '@/lib/cron/lock';
import { isWorkflowTapOutboxEnabled } from '@/lib/feature-flags';
import {
  defaultTapDeps,
  tapWorkflow,
  type TapDeps,
  type WorkflowTapEvent,
} from '@/lib/workflow/tap';
import {
  claimStaleTapIntents,
  markTapIntentFailed,
  type StaleTapIntent,
} from '@/lib/workflow/tap-outbox';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** After this many claims a PENDING row is flipped FAILED for human triage. */
const MAX_ATTEMPTS = 5;

/**
 * Re-drive deps: identical to production except recordIntent resolves to the
 * already-claimed row id — the re-driven tap updates the EXISTING intent
 * (LANDED/FAILED) instead of inserting a duplicate PENDING row.
 */
function redriveDeps(intentId: number): TapDeps {
  return {
    ...defaultTapDeps,
    outboxEnabled: () => true,
    outbox: {
      ...defaultTapDeps.outbox,
      recordIntent: async () => intentId,
    },
  };
}

function toTapArgs(row: StaleTapIntent) {
  const p = row.payload as {
    input?: Record<string, unknown>;
    staffId?: number | null;
    source?: string | null;
    expectNodeType?: string | null;
  };
  return {
    serialUnitId: row.serialUnitId,
    event: row.eventType as WorkflowTapEvent,
    input: p.input ?? undefined,
    staffId: p.staffId ?? null,
    source: (p.source ?? undefined) as Parameters<typeof tapWorkflow>[0]['source'],
    orgId: row.organizationId,
    expectNodeType: p.expectNodeType ?? undefined,
  };
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers)) return unauthorizedCronResponse();

  if (!isWorkflowTapOutboxEnabled()) {
    return NextResponse.json({ ok: true, skipped: 'flag_off' });
  }

  const olderThanMinutes = clampInt(req.nextUrl.searchParams.get('olderThan'), 10, 1, 1440);
  const limit = clampInt(req.nextUrl.searchParams.get('limit'), 50, 1, 200);

  let claimed = 0;
  let redriven = 0;
  let exhausted = 0;

  try {
    const locked = await withCronLock('workflow-tap-reconcile', async () => {
      const rows = await claimStaleTapIntents({ olderThanMinutes, limit });
      claimed = rows.length;

      for (const row of rows) {
        if (row.attempts > MAX_ATTEMPTS) {
          await markTapIntentFailed(row.id, 'max_attempts');
          exhausted += 1;
          continue;
        }
        // Same tap entry as production — never throws; on success it marks the claimed row LANDED via the redrive deps, on a durable non-apply it…
        await tapWorkflow(toTapArgs(row), redriveDeps(row.id));
        redriven += 1;
      }
    });
    if (!locked.ran) {
      return NextResponse.json({ ok: true, skipped: 'locked' });
    }
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'reconcile failed',
        claimed,
        redriven,
        exhausted,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, claimed, redriven, exhausted });
}
