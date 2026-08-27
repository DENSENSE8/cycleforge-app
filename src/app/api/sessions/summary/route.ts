/**
 * GET /api/sessions/summary — a staffer's (or the org's) sessions across a
 * window, with durations and the gaps between them.
 *
 * `?staffId&from&to` plus optional `kind` / `sessionType` / `status` /
 * `surfaceKey` / `limit`. Domain: src/lib/sessions/session-rollup.ts.
 * `orgId` from `ctx.organizationId`, never a query param — a client that could
 * name its own tenant would be the whole tenancy model, undone.
 *
 * ── THREE CLOCKS, NAMED APART ───────────────────────────────────────────────
 *
 * This response deliberately does NOT report payroll hours, and the field names
 * say so. `work_sessions` is a unit of work, `staff_sessions` is authentication,
 * and `time_punches` is payroll opened at sign-in. Session time and clock time
 * are different numbers; conflating the first two is how a UI ends up claiming
 * someone worked eight hours because their browser tab stayed open. Punches
 * appear here only as the thing that CLASSIFIES a gap (idle vs off-clock), never
 * as a duration.
 *
 * ── WHY OMITTING staffId CHANGES THE ANSWER, NOT JUST THE FILTER ────────────
 *
 * Gap classification is per-person. An org-wide read has no single shift to
 * compare against, so its gaps come back `'unknown'` rather than being called
 * idle on somebody's behalf. That is a deliberate refusal, not a missing
 * feature — see session-metrics.ts rule 3.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { withAuth } from '@/lib/auth/withAuth';
import { SESSION_KINDS, SESSION_STATUSES } from '@/lib/sessions/types';
import { SESSION_EVENT_TYPES } from '@/lib/sessions/attribution';
import {
  SESSION_LIST_CAP,
  countUnattributedEvents,
  listSessionsForOrg,
  listSessionsForStaff,
} from '@/lib/sessions/session-rollup';

const Query = z.object({
  staffId: z.coerce.number().int().positive().optional(),
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  kind: z.enum(SESSION_KINDS).optional(),
  sessionType: z.enum(SESSION_EVENT_TYPES).optional(),
  status: z.enum(SESSION_STATUSES).optional(),
  surfaceKey: z.string().min(1).max(64).optional(),
  purposeId: z.coerce.number().int().positive().optional(),
  q: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().positive().max(SESSION_LIST_CAP).optional(),
  /**
   * Include the unattributed-event counts for the same window. Off by default:
   * it is two extra COUNT(*)s over the window and the operator-facing health
   * chrome wants it, while a per-staff table does not.
   */
  health: z.enum(['0', '1']).optional(),
});

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const parsed = Query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_QUERY', detail: parsed.error.issues },
      { status: 400 },
    );
  }

  const { staffId, from, to, health, ...filters } = parsed.data;
  if (Date.parse(to) <= Date.parse(from)) {
    return NextResponse.json({ error: 'RANGE_TO_MUST_FOLLOW_FROM' }, { status: 400 });
  }

  const range = { from, to };
  const series =
    staffId != null
      ? await listSessionsForStaff(ctx.organizationId, staffId, range, filters)
      : await listSessionsForOrg(ctx.organizationId, range, filters);

  const unattributed =
    health === '1' ? await countUnattributedEvents(ctx.organizationId, range) : null;

  return NextResponse.json({ staffId: staffId ?? null, range, ...series, unattributed });
});
