import { withAuth } from '@/lib/auth/withAuth';
import { readV1Query, v1Data } from '@/lib/api/v1-route';
import { printStationJobsQuerySchema } from '@/lib/print/print-station-registry-contracts';
import { listStationJobs } from '@/lib/print/print-station-registry';

export const runtime = 'nodejs';

/** GET /api/v1/print-stations/jobs?station= — the newest prints one station logged. */
export const GET = withAuth(async (request, ctx) => {
  const query = readV1Query(request, printStationJobsQuerySchema, 'A station id (?station=) is required.');
  if (!query.ok) return query.response;
  return v1Data({ jobs: await listStationJobs(ctx.organizationId, query.data.station) });
}, { permission: 'print.label' });
