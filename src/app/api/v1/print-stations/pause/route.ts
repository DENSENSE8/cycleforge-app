import { withAuth } from '@/lib/auth/withAuth';
import { readV1Json, v1Data, v1DomainError } from '@/lib/api/v1-route';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';
import { printStationPauseBodySchema } from '@/lib/print/print-station-registry-contracts';
import { setPrintStationPaused } from '@/lib/print/print-station-registry';

export const runtime = 'nodejs';

/** PUT /api/v1/print-stations/pause — pause one station (it refuses jobs; senders see Paused) or resume it. */
export const PUT = withAuth(async (request, ctx) => {
  const body = await readV1Json(request, printStationPauseBodySchema, 'A station id and paused (true or false) are required.');
  if (!body.ok) return body.response;
  const result = await setPrintStationPaused(ctx.organizationId, body.data.stationId, body.data.paused);
  if (!result.ok) return v1DomainError(result);
  await recordAudit(pool, ctx, request, {
    source: 'print-station-api',
    action: result.paused ? AUDIT_ACTION.PRINT_STATION_PAUSED : AUDIT_ACTION.PRINT_STATION_RESUMED,
    entityType: AUDIT_ENTITY.PRINT_STATION,
    entityId: body.data.stationId,
    after: { paused: result.paused },
  });
  return v1Data({ stationId: body.data.stationId, paused: result.paused });
}, { permission: 'settings.hardware' });
