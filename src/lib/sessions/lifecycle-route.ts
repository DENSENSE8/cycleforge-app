import 'server-only';

/**
 * The shared body of `POST /api/sessions/[id]/park` and `.../resume`.
 *
 * ── WHY THESE EXIST BESIDE `PATCH /api/sessions/[id]` ───────────────────────
 *
 * That route multiplexes four verbs behind an `action` enum, and its docblock
 * argues — correctly — that four sibling files would be four copies of one
 * handler. These two are not that. They differ in the one way that matters on a
 * warehouse floor: THEY ARE IDEMPOTENT ON A CLIENT-MINTED KEY.
 *
 * A park sent over a flaky link and retried must be a no-op that returns the
 * original response. PATCH's optimistic-concurrency check cannot provide that —
 * the first park bumped `version`, so the retry carries a stale
 * `expectedVersion` and gets a 409 for having succeeded. `claimOrReplay` keyed
 * on the request's `Idempotency-Key` (or `clientEventId` in the body) replays
 * the original 200 instead.
 *
 * PATCH stays as the shell's version-asserting verb multiplexer — an operator
 * clicking Park in a mounted tab, where a 409 is the right answer because it
 * means someone else moved the session. These POSTs are the retry-safe floor
 * path. Both call the same domain functions, so there is no second
 * implementation of parking, only a second way to ask for it.
 *
 * If the shell later adopts idempotency keys everywhere, collapse PATCH into
 * these and delete its park/resume cases — not the reverse.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { AUDIT_ACTION, AUDIT_ENTITY, recordAudit } from '@/lib/audit-logs';
import pool from '@/lib/db';
import type { AuthContext } from '@/lib/auth/auth-context';
import { readIdempotencyKey, withIdempotencyClaim } from '@/lib/api-idempotency';
import { parkSession, resumeSession } from './work-sessions';
import type { WorkSession } from './types';
import { sessionIdFromPath } from './route-path';

export const LifecycleBody = z.object({
  /**
   * The retry anchor. Same value on every retry of the same operator action —
   * that is the whole contract. Also accepted as the `Idempotency-Key` header,
   * which is what the offline write queue sets.
   */
  clientEventId: z.uuid().nullish(),
  /** Optimistic concurrency. Optional here BY DESIGN: see the docblock. */
  expectedVersion: z.number().int().min(0).optional(),
  /** `resume` only — the device taking the shell over. */
  deviceId: z.string().min(1).max(128).nullish(),
});

type LifecycleVerb = 'park' | 'resume';

/**
 * The response body, both branches. A `type` rather than an `interface` because
 * `withIdempotencyClaim<B extends Record<string, unknown>>` needs B to have an
 * implicit index signature, which only type aliases get — and the alternative
 * (widening B to `Record<string, unknown>`) throws away every field name the
 * caller relies on.
 */
type LifecycleResponse = {
  error?: string;
  currentVersion?: number;
  session?: WorkSession;
  idempotent?: boolean;
};

/**
 * The claim body, as ONE shape rather than a union of the ok / not-ok returns.
 *
 * `withIdempotencyClaim` infers a single `B` and stores it verbatim for the
 * replay, so a union would make the replayed response's type depend on which
 * branch happened to run first — and TS refuses to infer one `B` from two
 * disjoint object literals. Every field is optional because a given response
 * carries either the error half or the session half, never both.
 */
interface LifecycleClaimBody extends Record<string, unknown> {
  error?: string;
  /** 409 only — what the loser needs to reconcile instead of guessing. */
  currentVersion?: number;
  session?: WorkSession;
  idempotent?: boolean;
}

const AUDIT: Record<LifecycleVerb, string> = {
  park: AUDIT_ACTION.WORK_SESSION_PARK,
  resume: AUDIT_ACTION.WORK_SESSION_RESUME,
};

export async function handleLifecyclePost(
  req: NextRequest,
  ctx: AuthContext,
  verb: LifecycleVerb,
): Promise<NextResponse> {
  const sessionId = sessionIdFromPath(req, 1);
  if (sessionId === null) {
    return NextResponse.json({ error: 'INVALID_SESSION_ID' }, { status: 400 });
  }

  // An empty body is legitimate — a park needs no arguments — so a failed parse
  // degrades to `{}` rather than a 400.
  const raw = await req.json().catch(() => ({}));
  const parsed = LifecycleBody.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_BODY', detail: parsed.error.issues },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const idempotencyKey = readIdempotencyKey(req, body.clientEventId ?? null);

  const result = await withIdempotencyClaim<LifecycleResponse>(
    pool,
    {
      orgId: ctx.organizationId,
      idempotencyKey,
      route: `sessions:${verb}`,
      staffId: ctx.staffId,
    },
    async (): Promise<{ status: number; body: LifecycleClaimBody }> => {
      const args = {
        orgId: ctx.organizationId,
        sessionId,
        staffId: ctx.staffId,
        expectedVersion: body.expectedVersion,
      };
      const outcome =
        verb === 'park'
          ? await parkSession(args)
          : await resumeSession({ ...args, deviceId: body.deviceId ?? null });

      if (!outcome.ok) {
        return {
          status: outcome.status,
          body: {
            error: outcome.error,
            // The loser gets what it needs to reconcile rather than guess —
            // a bare 409 on a floor network is how two devices ping-pong.
            ...(outcome.currentVersion != null ? { currentVersion: outcome.currentVersion } : {}),
          },
        };
      }

      return {
        status: 200,
        body: {
          session: outcome.session,
          idempotent: 'idempotent' in outcome ? Boolean(outcome.idempotent) : false,
        },
      };
    },
  );

  // A replayed request is not a new fact, and neither is a domain-level no-op
  // (parking an already-parked session). Neither files a second audit row.
  if (!result.cached && result.status === 200 && result.body?.idempotent !== true) {
    await recordAudit(pool, ctx, req, {
      source: 'sessions-api',
      action: AUDIT[verb],
      entityType: AUDIT_ENTITY.WORK_SESSION,
      entityId: sessionId,
      method: 'manual',
      after: { verb },
    });
  }

  return NextResponse.json(
    { ...result.body, replayed: result.cached === true },
    { status: result.status },
  );
}
