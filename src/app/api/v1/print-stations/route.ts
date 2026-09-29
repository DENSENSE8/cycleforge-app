import { withAuth } from '@/lib/auth/withAuth';
import { readV1Json, v1Data } from '@/lib/api/v1-route';
import { printStationHeartbeatBodySchema } from '@/lib/print/print-station-registry-contracts';
import { listPrintStations, recordPrintStationHeartbeat } from '@/lib/print/print-station-registry';

export const runtime = 'nodejs';

/** GET /api/v1/print-stations — the org's print stations (online judged server-side) and its station per stock. */
export const GET = withAuth(async (_request, ctx) => {
  return v1Data(await listPrintStations(ctx.organizationId));
}, { permission: 'print.label' });

/** POST /api/v1/print-stations — this computer's heartbeat as a print station; answers with the registry's name for it. */
export const POST = withAuth(async (request, ctx) => {
  const body = await readV1Json(request, printStationHeartbeatBodySchema, 'A station id, name and both stock faces are required.');
  if (!body.ok) return body.response;
  const { name } = await recordPrintStationHeartbeat(ctx.organizationId, ctx.staffId, body.data);
  return v1Data({ stationId: body.data.stationId, name });
}, { permission: 'print.label' });
