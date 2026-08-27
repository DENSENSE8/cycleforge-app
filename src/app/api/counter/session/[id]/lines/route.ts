/**
 * POST /api/counter/session/{id}/lines — stage a line. Desk only (plan D5).
 *
 * `unitAmountCents` is deliberately allowed to be NEGATIVE: a buyback credit
 * subtracts from the visit. Clamping it here would silently eat trade-ins, the
 * exact bug `computeCounterTotals` carries a comment about.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth, type AuthContext } from '@/lib/auth/withAuth';
import { addLine } from '@/lib/counter/session-store';
import { fanOutCounterSession } from '@/lib/counter/session-fanout';
import { deskResult, sessionIdFromPath } from '@/lib/counter/session-http';
import { KIOSK_LINE_TYPES } from '@/lib/kiosk/cart-line';
import { parseLinePayload } from '@/lib/counter/session-line-payload';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const BodySchema = z.object({
  expectedVersion: z.number().int().min(0),
  lineUuid: z.string().uuid(),
  type: z.enum(KIOSK_LINE_TYPES),
  title: z.string().trim().min(1).max(200),
  quantity: z.number().int().positive().max(999).default(1),
  unitAmountCents: z.number().int().min(-10_000_00).max(1_000_000_00),
  payload: z.unknown().default({}),
  sortIndex: z.number().int().min(0).max(9_999).default(0),
});

export const POST = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const sessionId = sessionIdFromPath(req.nextUrl.pathname);
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (sessionId === null || !parsed.success) {
      return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    }
    const { expectedVersion, payload, ...line } = parsed.data;

    // Validated against the line's own shape, not cast: a REPAIR line with no
    // model or serial fails HERE, not in front of a customer at submit.
    const checked = parseLinePayload(line.type, payload);
    if (!checked) {
      return Response.json({ error: 'INVALID_PAYLOAD', type: line.type }, { status: 400 });
    }

    return deskResult(
      await fanOutCounterSession(ctx.organizationId, await addLine(
        ctx.organizationId as OrgId,
        { kind: 'desk', staffId: ctx.staffId },
        sessionId,
        { expectedVersion, line: { ...line, payload: checked } },
      ),
    ));
  },
  { permission: 'walk_in.intake' },
);
