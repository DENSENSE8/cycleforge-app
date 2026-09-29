import { withAuth } from '@/lib/auth/withAuth';
import { readV1Json, v1Data, v1DomainError, v1Error } from '@/lib/api/v1-route';
import { printStationRenameBodySchema } from '@/lib/print/print-station-registry-contracts';
import { renamePrintStation } from '@/lib/print/print-station-registry';

export const runtime = 'nodejs';

/**
 * PUT /api/v1/print-stations/name — rename a print station for the whole org.
 * Your own computer needs `print.label`; another computer needs Hardware settings.
 */
export const PUT = withAuth(async (request, ctx) => {
  const body = await readV1Json(request, printStationRenameBodySchema, 'A station id and a name of at most 40 characters are required.');
  if (!body.ok) return body.response;
  const result = await renamePrintStation(
    ctx.organizationId,
    ctx.staffId,
    ctx.can('settings.hardware'),
    body.data.stationId,
    body.data.name,
  );
  if (result.ok) return v1Data({ stationId: body.data.stationId, name: result.name });
  return result.status === 403 ? v1Error(403, 'FORBIDDEN', result.error) : v1DomainError({ status: result.status, error: result.error });
}, { permission: 'print.label' });
