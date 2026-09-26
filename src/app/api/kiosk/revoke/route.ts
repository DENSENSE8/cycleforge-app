/** POST /api/kiosk/revoke */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import { revokeKioskDevice } from '@/lib/auth/kiosk-device';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';

export const runtime = 'nodejs';

const BodySchema = z.object({ deviceId: z.number().int().positive() });

export const POST = withAuth(
  async (req: NextRequest, ctx) => {
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    }

    const revoked = await revokeKioskDevice(ctx.organizationId, parsed.data.deviceId);
    if (!revoked) {
      // Not in this org, already revoked, or unknown — all surface as 404.
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }

    await recordAudit(pool, ctx, req, {
      source: 'kiosk',
      action: AUDIT_ACTION.KIOSK_REVOKED,
      entityType: AUDIT_ENTITY.KIOSK_DEVICE,
      entityId: parsed.data.deviceId,
    });

    return NextResponse.json({ ok: true });
  },
  { permission: 'walk_in.enroll_kiosk' },
);
