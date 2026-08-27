/**
 * PATCH /api/kiosk/devices/terminal — pair a Square Terminal with a counter lane.
 *
 * Manager surface (`walk_in.enroll_kiosk`), beside enrolment, because it is the
 * same act: describing the physical counter. One iPad facing the customer, one
 * card reader beside it.
 *
 * Sending `null` CLEARS the pairing, which is a real configuration — a cash-only
 * lane — not an unset. `resolveTerminalDeviceId` treats a cleared lane as
 * standless and refuses, rather than falling back to the deployment env and
 * prompting a reader at another counter.
 *
 * Plan: `docs/todo/counter-square-enterprise-PLAN.md` (SQ3 · gap G3).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, type AuthContext } from '@/lib/auth/withAuth';
import { setKioskDeviceTerminal } from '@/lib/auth/kiosk-device';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const BodySchema = z.object({
  deviceId: z.number().int().positive(),
  /** Square's device id. `null` = this lane has no stand. */
  squareTerminalDeviceId: z.string().trim().max(120).nullable(),
});

export const PATCH = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    }

    const ok = await setKioskDeviceTerminal(
      ctx.organizationId as OrgId,
      parsed.data.deviceId,
      parsed.data.squareTerminalDeviceId,
    );
    if (!ok) {
      // Missing, another tenant's, or revoked — one answer, so this is not an
      // existence oracle for device ids.
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }

    ctx.markAuditWritten();
    await recordAudit(pool, ctx, req, {
      source: 'settings-kiosk-devices',
      action: AUDIT_ACTION.KIOSK_TERMINAL_PAIRED,
      entityType: AUDIT_ENTITY.KIOSK_DEVICE,
      entityId: parsed.data.deviceId,
      after: { squareTerminalDeviceId: parsed.data.squareTerminalDeviceId },
      method: 'manual',
    });

    return NextResponse.json({ ok: true });
  },
  { permission: 'walk_in.enroll_kiosk' },
);
