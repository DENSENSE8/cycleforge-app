/**
 * POST /api/sessions/sync — silent park / resume / start for this staffer's
 * scan-station surface. Authenticated staff only (own timesheet). Does not
 * wait on the scan path from the client; the handler is still transactional.
 *
 * Gate: withAuth, no extra permission — this is the operator's own clock,
 * not an admin report.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { isScanSessionType, type ScanSessionType } from '@/lib/sessions/types';
import { syncScanSurface } from '@/lib/sessions/work-sessions';

const SyncBody = z.object({
  scanType: z
    .string()
    .nullable()
    .refine((v) => v === null || isScanSessionType(v)),
  surfaceKey: z.string().min(1).max(64).nullable().optional(),
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const parsed = parseBody(SyncBody, await req.json().catch(() => null));
  if (parsed instanceof NextResponse) return parsed;

  const result = await syncScanSurface({
    orgId: ctx.organizationId,
    staffId: ctx.staffId,
    scanType: parsed.scanType as ScanSessionType | null,
    surfaceKey: parsed.surfaceKey ?? parsed.scanType,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    action: result.action,
    session: result.session,
    todayActiveMs: result.todayActiveMs,
  });
});
