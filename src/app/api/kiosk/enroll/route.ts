/**
 * POST /api/kiosk/enroll
 *
 * Manager (staff session, `walk_in.enroll_kiosk`) mints a one-time, short-lived
 * pairing code for a NEW kiosk tablet. Returns the raw code ONCE (shown to the
 * operator, who carries it to the tablet's /kiosk pairing screen) plus the
 * `deviceId`. Only the code hash is persisted. The tablet then calls
 * /api/kiosk/pair to exchange it for a long-lived device token.
 *
 * Mirrors the staff `enroll-token` route, but the principal being provisioned
 * is a DEVICE (kiosk_devices), never a person.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import { createKioskEnrollment, DEFAULT_ENROLL_TTL_MINUTES } from '@/lib/auth/kiosk-device';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';

export const runtime = 'nodejs';

const BodySchema = z.object({
  label: z.string().trim().min(1).max(120),
  // Up to 30 days — long enough to stage MDM tablets (default is 7 days).
  ttlMinutes: z.number().int().positive().max(30 * 24 * 60).optional(),
});

export const POST = withAuth(
  async (req: NextRequest, ctx) => {
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'INVALID_REQUEST', issues: parsed.error.issues }, { status: 400 });
    }

    const enrollment = await createKioskEnrollment(ctx.organizationId, {
      label: parsed.data.label,
      enrolledByStaffId: ctx.staffId,
      ttlMinutes: parsed.data.ttlMinutes ?? DEFAULT_ENROLL_TTL_MINUTES,
    });

    await recordAudit(pool, ctx, req, {
      source: 'kiosk',
      action: AUDIT_ACTION.KIOSK_ENROLLED,
      entityType: AUDIT_ENTITY.KIOSK_DEVICE,
      entityId: enrollment.deviceId,
      after: { label: parsed.data.label, expiresAt: enrollment.expiresAt },
    });

    return NextResponse.json({
      deviceId: enrollment.deviceId,
      code: enrollment.code,
      expiresAt: enrollment.expiresAt,
    });
  },
  { permission: 'walk_in.enroll_kiosk' },
);
