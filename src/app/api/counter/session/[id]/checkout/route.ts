/**
 * POST /api/counter/session/{id}/checkout — ask the Square Terminal for a card.
 *
 * Runs AFTER submit: the kiosk stages an order and never charges (plan D4), so
 * the Square order a Terminal checkout collects for does not exist until the
 * visit is submitted. Asking the stand first would mean charging for something
 * no record describes.
 *
 * Desk-only and step-up gated — summoning a card prompt moves money, and a
 * device principal must never be able to do it.
 *
 * The stand is resolved by `resolveTerminalDeviceId` (SQ3): the lane's own
 * paired Terminal first, the deployment env only as a last resort for
 * single-counter shops. This route no longer reads the env at all.
 *
 * Plan: `docs/todo/counter-square-enterprise-PLAN.md` (SQ2).
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth, type AuthContext } from '@/lib/auth/withAuth';
import { startTerminalCheckout } from '@/lib/counter/session-store';
import { resolveTerminalDeviceId } from '@/lib/counter/terminal-device';
import { fanOutCounterSession } from '@/lib/counter/session-fanout';
import { deskResult, sessionIdFromPath } from '@/lib/counter/session-http';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const BodySchema = z.object({
  expectedVersion: z.number().int().min(0),
  /** Staff standing at the counter naming a reader — outranks configuration. */
  deviceId: z.string().trim().max(120).optional(),
});

export const POST = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const sessionId = sessionIdFromPath(req.nextUrl.pathname);
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (sessionId === null || !parsed.success) {
      return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    }

    const stand = await resolveTerminalDeviceId(
      ctx.organizationId as OrgId,
      sessionId,
      parsed.data.deviceId,
    );
    if (!stand) {
      // Nothing paired at this lane and no deployment fallback. Say so, rather
      // than prompting a card reader in another room.
      return Response.json({ error: 'NO_TERMINAL_PAIRED' }, { status: 422 });
    }

    const result = await fanOutCounterSession(
      ctx.organizationId,
      await startTerminalCheckout(
        ctx.organizationId as OrgId,
        { kind: 'desk', staffId: ctx.staffId },
        sessionId,
        { expectedVersion: parsed.data.expectedVersion, deviceId: stand.deviceId },
      ),
    );

    if (result.ok) {
      ctx.markAuditWritten();
      await recordAudit(pool, ctx, req, {
        source: 'counter-session',
        action: AUDIT_ACTION.COUNTER_TERMINAL_CHECKOUT,
        entityType: AUDIT_ENTITY.COUNTER_SESSION,
        entityId: sessionId,
        after: {
          terminalCheckoutId: result.snapshot.terminalCheckoutId,
          counterTransactionId: result.snapshot.counterTransactionId,
          // Which stand, and whether it came from the lane or the deployment
          // fallback — the audit answers "which reader took this card".
          terminalDeviceId: stand.deviceId,
          terminalSource: stand.source,
        },
        method: 'manual',
      });
    }

    return deskResult(result);
  },
  { permission: 'walk_in.take_payment', stepUp: true },
);
