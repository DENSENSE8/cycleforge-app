import { withAuth } from '@/lib/auth/withAuth';
import { readV1Json, v1Data, v1DomainError } from '@/lib/api/v1-route';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';
import { printStationRevokeBodySchema } from '@/lib/print/print-station-registry-contracts';
import { revokePrintStation } from '@/lib/print/print-station-registry';

export const runtime = 'nodejs';

/**
 * POST /api/v1/print-stations/revoke — an enrolled station is revoked (its
 * device credential dies; its next request answers 401); a browser station is
 * forgotten until its next heartbeat. Either way it leaves every list.
 */
export const POST = withAuth(async (request, ctx) => {
  const body = await readV1Json(request, printStationRevokeBodySchema, 'A station id is required.');
  if (!body.ok) return body.response;
  const result = await revokePrintStation(ctx.organizationId, body.data.stationId);
  if (!result.ok) return v1DomainError(result);
  await recordAudit(pool, ctx, request, {
    source: 'print-station-api',
    action: AUDIT_ACTION.PRINT_STATION_REVOKED,
    entityType: AUDIT_ENTITY.PRINT_STATION,
    entityId: body.data.stationId,
    before: { name: result.name, kind: result.kind },
  });
  return v1Data({ stationId: body.data.stationId, kind: result.kind });
}, { permission: 'settings.hardware' });
