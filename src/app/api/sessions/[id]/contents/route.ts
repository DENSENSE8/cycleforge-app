/**
 * GET /api/sessions/[id]/contents — what was added, touched and produced
 * during one work session.
 *
 * Domain: src/lib/sessions/session-rollup.ts. `orgId` from
 * `ctx.organizationId`, never the body. Gate rationale (no per-session
 * permission): ../../route.ts.
 *
 * CAPPED, AND THE CAP IS IN THE RESPONSE. A busy unbox session produces
 * thousands of events; an uncapped read on a manager dashboard is an outage,
 * and a silently capped one reads as "that is all that happened". `truncated`
 * and `caps` ride in the body so a client can render "500+" rather than "500".
 */

import { NextRequest, NextResponse } from 'next/server';

import { withAuth } from '@/lib/auth/withAuth';
import {
  SESSION_CONTENTS_ENTITY_CAP,
  SESSION_CONTENTS_EVENT_CAP,
  sessionContents,
} from '@/lib/sessions/session-rollup';
import { sessionIdFromPath } from '@/lib/sessions/route-path';

export const GET = withAuth(async (req: NextRequest, ctx) => {
  // `[id]` is the SECOND-to-last segment here — withAuth's wrapper drops Next's
  // route context, so the id comes off the path, and this route has a suffix.
  const sessionId = sessionIdFromPath(req, 1);
  if (sessionId === null) {
    return NextResponse.json({ error: 'INVALID_SESSION_ID' }, { status: 400 });
  }

  const url = req.nextUrl.searchParams;
  const contents = await sessionContents(ctx.organizationId, sessionId, {
    eventCap: numberParam(url.get('eventCap'), SESSION_CONTENTS_EVENT_CAP),
    entityCap: numberParam(url.get('entityCap'), SESSION_CONTENTS_ENTITY_CAP),
  });

  return NextResponse.json(contents);
});

function numberParam(raw: string | null, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
