import { withAuth } from '@/lib/auth/withAuth';
import { v1Error, v1PathId } from '@/lib/api/v1-route';
import { LabelIngestionServiceError, readLabelIngestionPdf } from '@/lib/label-ingestions/ingestion-service';

export const runtime = 'nodejs';

/** GET /api/v1/label-ingestions/{id}/pdf — the stored label PDF the print desk previews and prints. */
export const GET = withAuth(async (request, ctx) => {
  const id = v1PathId(request, 2);
  if (id == null) return v1Error(400, 'INVALID_REQUEST', 'Invalid ingestion id.');
  try {
    const { bytes, fileBasename } = await readLabelIngestionPdf(ctx.organizationId, id);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="${fileBasename.replace(/["\\\r\n]/g, '_')}"`,
        'cache-control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof LabelIngestionServiceError) {
      return v1Error(error.code === 'INGESTION_NOT_FOUND' ? 404 : 409, error.code, error.message);
    }
    return v1Error(500, 'INGESTION_PROCESSING_FAILED', 'The label PDF could not be read.');
  }
}, { permission: 'packing.review' });
