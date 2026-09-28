import { withAuth } from '@/lib/auth/withAuth';
import { readV1Json, v1Data, v1DomainError } from '@/lib/api/v1-route';
import { printStationAssignmentBodySchema } from '@/lib/print/print-station-registry-contracts';
import { readPrintStationAssignment, setPrintStationAssignment } from '@/lib/print/print-station-registry';

export const runtime = 'nodejs';

/** GET /api/v1/print-stations/assignment — the org's default station per stock. */
export const GET = withAuth(async (_request, ctx) => {
  return v1Data(await readPrintStationAssignment(ctx.organizationId));
}, { permission: 'print.label' });

/** PUT /api/v1/print-stations/assignment — set or clear the org's station for one stock. */
export const PUT = withAuth(async (request, ctx) => {
  const body = await readV1Json(request, printStationAssignmentBodySchema, 'A stock and a station id (or null) are required.');
  if (!body.ok) return body.response;
  const result = await setPrintStationAssignment(ctx.organizationId, body.data.stock, body.data.stationId);
  return result.ok ? v1Data(result.assignment) : v1DomainError(result);
}, { permission: 'settings.hardware' });
