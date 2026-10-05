import { withAuth } from '@/lib/auth/withAuth';
import { readV1Json, v1Data, v1DomainError } from '@/lib/api/v1-route';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';
import { printStationEnrollBodySchema } from '@/lib/print/print-station-registry-contracts';
import { createPrintStationEnrollment } from '@/lib/print/print-station-device';

export const runtime = 'nodejs';

/**
 * POST /api/v1/print-stations/enroll — a new org-owned print station: its
 * registry row plus a single-use pairing code (shown once) for the computer
 * that will print, with no staff signed in, at `/print-station/device`.
 */
export const POST = withAuth(async (request, ctx) => {
  const body = await readV1Json(request, printStationEnrollBodySchema, 'A station name of at most 40 characters is required.');
  if (!body.ok) return body.response;
  const result = await createPrintStationEnrollment(ctx.organizationId, { name: body.data.name, staffId: ctx.staffId });
  if (!result.ok) return v1DomainError(result);
  await recordAudit(pool, ctx, request, {
    source: 'print-station-api',
    action: AUDIT_ACTION.PRINT_STATION_ENROLLED,
    entityType: AUDIT_ENTITY.PRINT_STATION,
    entityId: result.enrollment.stationId,
    after: { name: body.data.name, expiresAt: result.enrollment.expiresAt },
  });
  return v1Data(result.enrollment, { status: 201 });
}, { permission: 'settings.hardware' });
