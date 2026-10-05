import { withAuth } from '@/lib/auth/withAuth';
import { readV1Json, v1Data, v1DomainError } from '@/lib/api/v1-route';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';
import { rePairPrintStation } from '@/lib/print/print-station-device';
import { printStationRePairBodySchema } from '@/lib/print/print-station-registry-contracts';

export const runtime = 'nodejs';

/** POST /api/v1/print-stations/re-pair — issue a new code while keeping the station record. */
export const POST = withAuth(async (request, ctx) => {
  const body = await readV1Json(request, printStationRePairBodySchema, 'An enrolled station id is required.');
  if (!body.ok) return body.response;
  const result = await rePairPrintStation(ctx.organizationId, body.data.stationId);
  if (!result.ok) return v1DomainError(result);
  await recordAudit(pool, ctx, request, {
    source: 'print-station-api',
    action: AUDIT_ACTION.PRINT_STATION_REPAIRED,
    entityType: AUDIT_ENTITY.PRINT_STATION,
    entityId: body.data.stationId,
    after: { expiresAt: result.enrollment.expiresAt },
  });
  return v1Data(result.enrollment);
}, { permission: 'settings.hardware' });
