/** Kiosk-authorized 2x1 unit-label dispatch for one landed local pickup. */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import { resolveKioskStepUp } from '@/lib/auth/kiosk-device';
import {
  issueKioskPickupLabels,
  KioskPickupLabelError,
} from '@/lib/kiosk/local-pickup-labels';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const Body = z
  .object({
    localPickupOrderId: z.number().int().positive(),
    lineIds: z.array(z.number().int().positive()).min(1).max(50),
    issuanceVersion: z.string().trim().regex(/^[A-Za-z0-9_-]{8,96}$/),
    staffId: z.number().int().positive(),
    pin: z.string().min(1).max(20),
  })
  .strict();

export const POST = withKioskAuth(async (request: NextRequest, ctx) => {
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid pickup label request' },
      { status: 400 },
    );
  }

  const staffId = await resolveKioskStepUp(
    ctx.organizationId,
    body.data.staffId,
    body.data.pin,
    'print.label',
  );
  if (staffId == null) {
    return NextResponse.json(
      { success: false, error: 'PIN incorrect or label printing is unavailable' },
      { status: 403 },
    );
  }

  const orgId = ctx.organizationId as OrgId;
  let result;
  try {
    result = await issueKioskPickupLabels(
      {
        localPickupOrderId: body.data.localPickupOrderId,
        lineIds: body.data.lineIds,
        issuanceVersion: body.data.issuanceVersion,
        staffId,
      },
      orgId,
    );
  } catch (error) {
    if (error instanceof KioskPickupLabelError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      );
    }
    throw error;
  }
  const { labels, failures } = result;

  return NextResponse.json({
    success: labels.length > 0,
    labels,
    failures,
    printed: labels.length,
    failedLines: failures.length,
    error: labels.length === 0 ? failures[0]?.error ?? 'No labels are ready to print' : undefined,
  });
});
