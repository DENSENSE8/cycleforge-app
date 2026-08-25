/**
 * POST /api/sessions/[id]/scans — attribute one scan to a work session.
 *
 * THIS ROUTE IS NOT ON THE SCAN PATH. The operator's confirmation already
 * happened, optimistically, before this request was made — the wedge listener
 * yielded, `onScan` painted the hit marker, and the write was enqueued and
 * never awaited (src/lib/sessions/session-write-queue.ts). Everything here is
 * a consequence of a scan that has already landed.
 *
 * ── THE RESPONSE RETURNS BEFORE THE WORK ────────────────────────────────────
 *
 * The handler validates, claims the idempotency key, and answers. The actual
 * spine write runs inside `after()` — the same shape 70 routes in this app
 * already use for side-effects that must not hold the response open. The client
 * is not waiting on it, so making it wait would only widen the window in which
 * a reconnect re-posts a write that is already in flight.
 *
 * ── IDEMPOTENCY IS MANDATORY, NOT OPTIONAL ──────────────────────────────────
 *
 * `clientEventId` is minted once at the wedge and reused verbatim on every
 * retry. Three layers key on it: the offline queue's IndexedDB record, this
 * route's `claimOrReplay`, and `ops_events.client_event_id`'s UNIQUE index. A
 * replay after a flaky-network retry is a no-op that returns the original
 * result — which is exactly what makes "enqueue and forget" safe.
 *
 * ── FAIL OPEN ───────────────────────────────────────────────────────────────
 *
 * A session that has ended, or an id that does not resolve, does NOT fail the
 * request. The scan happened; refusing to record it would not un-happen it, and
 * a 500 here would make the client retry a write that can never succeed. The
 * response says what was recorded and the event carries the reason.
 */

import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';

import { withAuth } from '@/lib/auth/withAuth';
import { OPS_EVENT_ENTITY_TYPES } from '@/lib/ops-event-types';
import { recordOpsEvent } from '@/lib/ops-events';
import { readIdempotencyKey, withIdempotencyClaim } from '@/lib/api-idempotency';
import pool from '@/lib/db';
import { SESSION_EVENT_TYPES } from '@/lib/sessions/attribution';
import { SESSION_SCAN_EVENT } from '@/lib/sessions/scan-write-order';
import { sessionIdFromPath } from '@/lib/sessions/route-path';

const ScanBody = z.object({
  clientEventId: z.uuid(),
  /**
   * CLIENT-minted at the wedge. This is the ordering key and it is NOT
   * overwritten server-side: async writes arrive out of order, and stamping
   * arrival time here would report a burst of six scans in whatever sequence
   * the network delivered.
   */
  occurredAt: z.iso.datetime(),
  sessionId: z.number().int().positive(),
  sessionType: z.enum(SESSION_EVENT_TYPES),
  value: z.string().min(1).max(512),
  surfaceKey: z.string().min(1).max(64).nullish(),
  deviceId: z.string().min(1).max(128).nullish(),
  entity: z
    .object({ type: z.enum(OPS_EVENT_ENTITY_TYPES), id: z.number().int().positive() })
    .nullish(),
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const sessionId = sessionIdFromPath(req, 1);
  if (sessionId === null) {
    return NextResponse.json({ error: 'INVALID_SESSION_ID' }, { status: 400 });
  }

  const parsed = ScanBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_BODY', detail: parsed.error.issues },
      { status: 400 },
    );
  }
  const body = parsed.data;

  // The path is authoritative. A body naming a different session is a client
  // bug, and silently trusting either one would let a mis-routed write file a
  // scan against the wrong bench.
  if (body.sessionId !== sessionId) {
    return NextResponse.json({ error: 'SESSION_ID_MISMATCH' }, { status: 400 });
  }

  const result = await withIdempotencyClaim(
    pool,
    {
      orgId: ctx.organizationId,
      idempotencyKey: readIdempotencyKey(req, body.clientEventId),
      route: 'sessions:scan',
      staffId: ctx.staffId,
    },
    async () => {
      // Nothing is written HERE. The claim is what makes the reply safe to
      // send; the spine write happens in after(), below.
      after(async () => {
        try {
          await recordOpsEvent({
            organizationId: ctx.organizationId,
            entityType: body.entity?.type ?? 'other',
            // No resolved subject yet → point at the session. `entity_id` is
            // NOT NULL and an unresolved scan is still a fact about the session.
            entityId: body.entity?.id ?? sessionId,
            eventType: SESSION_SCAN_EVENT,
            occurredAt: body.occurredAt,
            actorStaffId: ctx.staffId,
            clientEventId: body.clientEventId,
            session: { sessionId, sessionType: body.sessionType },
            payload: {
              value: body.value,
              surfaceKey: body.surfaceKey ?? null,
              deviceId: body.deviceId ?? null,
              subject: body.entity ? 'resolved' : 'unresolved',
            },
          });
        } catch (err) {
          // FAIL OPEN. An unattributed event is a reporting gap; a thrown
          // after() would be an unhandled rejection in the server runtime and
          // still would not get the scan back.
          console.warn('[sessions/scans] attribution write failed (non-fatal):', err);
        }
      });

      return { status: 200, body: { recorded: true, sessionId, clientEventId: body.clientEventId } };
    },
  );

  return NextResponse.json(
    { ...result.body, replayed: result.cached === true },
    { status: result.status },
  );
});
