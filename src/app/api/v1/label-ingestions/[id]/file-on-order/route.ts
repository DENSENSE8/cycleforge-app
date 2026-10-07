import { withAuth } from '@/lib/auth/withAuth';
import { readV1Json, v1Data, v1Error, v1PathId } from '@/lib/api/v1-route';
import { AUDIT_ACTION, AUDIT_ENTITY, recordAudit } from '@/lib/audit-logs';
import pool from '@/lib/db';
import { OutboundDocumentValidationError } from '@/lib/documents/outbound-documents';
import { fileLabelOnOrder, LabelFilingError } from '@/lib/label-ingestions/file-on-order';
import { labelFileOnOrderBodySchema } from '@/lib/label-ingestions/file-on-order-contracts';
import { LabelIngestionServiceError } from '@/lib/label-ingestions/ingestion-service';

export const runtime = 'nodejs';

/**
 * POST /api/v1/label-ingestions/{id}/file-on-order — file one stored label on
 * one order with the operator's answers (typed tracking, without tracking,
 * collision move/keep, existing replace/add). A missing answer is a 409
 * `FILING_ANSWER_REQUIRED` carrying `check` + `needs`.
 */
export const POST = withAuth(async (request, ctx) => {
  const id = v1PathId(request, 2);
  if (id == null) return v1Error(400, 'INVALID_REQUEST', 'Invalid ingestion id.');
  const body = await readV1Json(request, labelFileOnOrderBodySchema, 'An order id and expected row version are required.');
  if (!body.ok) return body.response;
  try {
    const result = await fileLabelOnOrder({ organizationId: ctx.organizationId, actorStaffId: ctx.staffId, ingestionId: id, ...body.data });
    if (result.mode === 'withoutTracking') {
      await recordAudit(pool, ctx, request, {
        source: 'label-ingestions-file-on-order',
        action: AUDIT_ACTION.ORDER_DOCUMENT_ATTACH,
        entityType: AUDIT_ENTITY.ORDER,
        entityId: body.data.orderId,
        after: { documentId: result.documentId, documentType: 'shipping_label', labelIngestionId: id, withoutTracking: true },
      });
    }
    return v1Data(result);
  } catch (error) {
    if (error instanceof LabelFilingError) return v1Error(error.status, error.code, error.message, error.answer ? { extra: { ...error.answer } } : {});
    if (error instanceof LabelIngestionServiceError) return v1Error(error.code === 'INGESTION_NOT_FOUND' ? 404 : 409, error.code, error.message);
    if (error instanceof OutboundDocumentValidationError) return v1Error(409, 'INGESTION_PROCESSING_FAILED', error.message);
    return v1Error(500, 'INGESTION_PROCESSING_FAILED', 'The label could not be filed.');
  }
}, { permission: 'packing.complete_order' });
