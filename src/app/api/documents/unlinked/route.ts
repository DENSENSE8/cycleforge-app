import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import {
  deleteOutboundDocument,
  listUnlinkedOutboundDocuments,
  storeOutboundDocumentFromBytes,
  OutboundDocumentConflictError,
  OutboundDocumentValidationError,
} from '@/lib/documents/outbound-documents';
import type { OutboundDocumentType } from '@/lib/documents/types';
import {
  deleteUnlinkedLabelIngestion,
  listLabelIngestions,
  LabelIngestionServiceError,
} from '@/lib/label-ingestions/ingestion-service';
import type { OrgId } from '@/lib/tenancy/constants';
import pool from '@/lib/db';

export const runtime = 'nodejs';

function requestedType(value: string | null): OutboundDocumentType | undefined {
  return value === 'shipping_label' || value === 'packing_slip' ? value : undefined;
}

function extensionOf(filename: string, mime: string): string {
  const fromName = filename.split('.').pop()?.trim().toLowerCase();
  if (fromName && fromName.length <= 5) return fromName;
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg') return 'jpg';
  return 'bin';
}

/** GET /api/documents/unlinked — stored slips/labels with deliberately no order link. */
export async function GET(req: NextRequest) {
  const gate = await requireRoutePerm(req, 'packing.review');
  if (gate.denied) return gate.denied;
  const documentType = requestedType(req.nextUrl.searchParams.get('documentType'));
  const organizationId = gate.ctx.organizationId as OrgId;
  const [documents, ingestions] = await Promise.all([
    listUnlinkedOutboundDocuments(organizationId, documentType),
    documentType === 'packing_slip' ? Promise.resolve([]) : listLabelIngestions(organizationId, undefined, 1000),
  ]);
  const unlinkedIngestions = ingestions.filter(
    (ingestion) => ingestion.matchedOrderId == null && ingestion.state !== 'APPLIED',
  );
  return NextResponse.json({ success: true, documents, unlinkedIngestions });
}

/** POST is the Bulk paperwork writer: bytes land in the existing document table/store, with no order identity. */
export async function POST(req: NextRequest) {
  const gate = await requireRoutePerm(req, 'orders.create');
  if (gate.denied) return gate.denied;
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const documentType = requestedType(String(form?.get('documentType') ?? ''));
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }
  if (documentType !== 'packing_slip') {
    return NextResponse.json({ error: 'Bulk document upload accepts packing_slip; labels use the batch uploader' }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || 'application/octet-stream';
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  try {
    const result = await storeOutboundDocumentFromBytes(gate.ctx.organizationId as OrgId, {
      orderId: null,
      orderRef: 'bulk',
      documentType,
      platform: 'manual',
      source: 'bulk_upload',
      buffer,
      contentType,
      extension: extensionOf(file.name, contentType),
      filename: file.name,
      uploadedBy: gate.ctx.staffId ?? null,
      sourceHash: createHash('sha256').update(`bulk|${documentType}|${sha256}`).digest('hex'),
    });
    await recordAudit(pool, gate.ctx, req, {
      source: 'documents-unlinked-api',
      action: AUDIT_ACTION.ORDER_DOCUMENT_ATTACH,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: result.document.id,
      after: { documentId: result.document.id, documentType, unlinked: true },
    });
    return NextResponse.json({ success: true, document: result.document, created: result.created }, { status: 201 });
  } catch (error) {
    if (error instanceof OutboundDocumentValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to upload bulk paperwork' }, { status: 500 });
  }
}

/** DELETE removes every still-unlinked row of the selected stock after rechecking each one. */
export async function DELETE(req: NextRequest) {
  const gate = await requireRoutePerm(req, 'orders.create');
  if (gate.denied) return gate.denied;
  const organizationId = gate.ctx.organizationId as OrgId;
  const documentType = requestedType(req.nextUrl.searchParams.get('documentType'));
  const documents = await listUnlinkedOutboundDocuments(organizationId, documentType);
  const deletedDocumentIds: number[] = [];
  for (const document of documents) {
    try {
      await deleteOutboundDocument(
        organizationId,
        document.id,
        { expectedDocumentType: document.documentType, requireUnlinked: true },
      );
      deletedDocumentIds.push(document.id);
      await recordAudit(pool, gate.ctx, req, {
        source: 'documents-unlinked-api',
        action: AUDIT_ACTION.ORDER_DOCUMENT_DELETE,
        entityType: AUDIT_ENTITY.ORDER,
        entityId: document.id,
        before: { documentId: document.id, documentType: document.documentType, unlinked: true },
      });
    } catch (error) {
      if (!(error instanceof OutboundDocumentConflictError)) throw error;
    }
  }

  const deletedIngestionIds: number[] = [];
  if (documentType !== 'packing_slip') {
    const ingestions = await listLabelIngestions(organizationId, undefined, 1000);
    for (const ingestion of ingestions) {
      if (ingestion.matchedOrderId != null || ingestion.state === 'APPLIED') continue;
      try {
        await deleteUnlinkedLabelIngestion({
          organizationId,
          actorStaffId: gate.ctx.staffId,
          ingestionId: ingestion.id,
        });
        deletedIngestionIds.push(ingestion.id);
      } catch (error) {
        if (!(error instanceof LabelIngestionServiceError) || error.code !== 'INGESTION_NOT_ACTIONABLE') throw error;
      }
    }
  }
  return NextResponse.json({ success: true, deletedDocumentIds, deletedIngestionIds });
}
