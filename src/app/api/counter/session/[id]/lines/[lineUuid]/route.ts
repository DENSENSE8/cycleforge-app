/**
 * PATCH  /api/counter/session/{id}/lines/{lineUuid} — edit a staged line.
 * DELETE /api/counter/session/{id}/lines/{lineUuid} — VOID it (soft).
 *
 * DELETE is the verb an operator expects; the effect is a soft void, because a
 * line the customer already read off the display is evidence. It is gated on
 * `walk_in.take_payment` rather than `walk_in.intake`: removing a charged line
 * moves money, and P7 adds the PIN step-up on top of this same door.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth, type AuthContext } from '@/lib/auth/withAuth';
import { updateLine, voidLine } from '@/lib/counter/session-store';
import { fanOutCounterSession } from '@/lib/counter/session-fanout';
import { deskResult, lineUuidFromPath, sessionIdFromPath } from '@/lib/counter/session-http';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';
import { KIOSK_LINE_TYPES } from '@/lib/kiosk/cart-line';
import { parseLinePayload } from '@/lib/counter/session-line-payload';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const PatchSchema = z.object({
  expectedVersion: z.number().int().min(0),
  title: z.string().trim().min(1).max(200).optional(),
  quantity: z.number().int().positive().max(999).optional(),
  // `unitAmountCents` is NOT here. A price change is money, so it has its own
  // verb (`…/price`) with its own step-up gate and its own audit row. Leaving
  // it on the general PATCH would mean the gate depended on which optional
  // field a caller happened to include — a permission you can bypass by
  // choosing a different endpoint is not a permission.
  // A payload PATCH replaces the whole payload, so the caller states which
  // shape it is sending. Without the type there is nothing to validate against,
  // and "validate against whatever it looks like" is how a repair line loses
  // its serial number.
  payloadType: z.enum(KIOSK_LINE_TYPES).optional(),
  payload: z.unknown().optional(),
});

const DeleteSchema = z.object({
  expectedVersion: z.number().int().min(0),
  reason: z.string().trim().max(200).nullish(),
});

function ids(req: NextRequest): { sessionId: number; lineUuid: string } | null {
  const sessionId = sessionIdFromPath(req.nextUrl.pathname);
  const lineUuid = lineUuidFromPath(req.nextUrl.pathname);
  return sessionId !== null && lineUuid !== null ? { sessionId, lineUuid } : null;
}

export const PATCH = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const path = ids(req);
    const parsed = PatchSchema.safeParse(await req.json().catch(() => ({})));
    if (!path || !parsed.success) {
      return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    }
    const { expectedVersion, payload, payloadType, ...rest } = parsed.data;

    let checked = undefined;
    if (payload !== undefined) {
      if (!payloadType) {
        return Response.json({ error: 'PAYLOAD_TYPE_REQUIRED' }, { status: 400 });
      }
      checked = parseLinePayload(payloadType, payload);
      if (!checked) {
        return Response.json({ error: 'INVALID_PAYLOAD', type: payloadType }, { status: 400 });
      }
    }

    return deskResult(
      await fanOutCounterSession(ctx.organizationId, await updateLine(
        ctx.organizationId as OrgId,
        { kind: 'desk', staffId: ctx.staffId },
        path.sessionId,
        path.lineUuid,
        {
          expectedVersion,
          patch: { ...rest, ...(checked ? { payload: checked } : {}) },
        },
      ),
    ));
  },
  { permission: 'walk_in.intake' },
);

export const DELETE = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const path = ids(req);
    const parsed = DeleteSchema.safeParse(await req.json().catch(() => ({})));
    if (!path || !parsed.success) {
      return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    }

    const result = await fanOutCounterSession(
      ctx.organizationId,
      await voidLine(
        ctx.organizationId as OrgId,
        { kind: 'desk', staffId: ctx.staffId },
        path.sessionId,
        path.lineUuid,
        { expectedVersion: parsed.data.expectedVersion, reason: parsed.data.reason ?? null },
      ),
    );

    if (result.ok) {
      const voided = result.snapshot.lines.find((l) => l.id === path.lineUuid);
      ctx.markAuditWritten();
      await recordAudit(pool, ctx, req, {
        source: 'counter-session',
        action: AUDIT_ACTION.COUNTER_LINE_VOID,
        entityType: AUDIT_ENTITY.COUNTER_SESSION,
        entityId: path.sessionId,
        before: {
          lineUuid: path.lineUuid,
          title: voided?.title ?? null,
          unitAmountCents: voided?.unitAmountCents ?? null,
          quantity: voided?.quantity ?? null,
        },
        after: { lineUuid: path.lineUuid, voided: true },
        note: parsed.data.reason ?? null,
        method: 'manual',
      });
    }

    return deskResult(result);
  },
  { permission: 'walk_in.take_payment', stepUp: true },
);
