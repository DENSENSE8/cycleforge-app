import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import {
  unlinkOutboundDocument,
  OutboundDocumentIngestionBackedError,
  OutboundDocumentNotFoundError,
  OutboundDocumentValidationError,
} from '@/lib/documents/outbound-documents';
import type { OrgId } from '@/lib/tenancy/constants';
import pool from '@/lib/db';

/**
 * Move one packing slip / shipping label to the UNLINKED pool, keeping the
 * file. Undo re-files it through POST /api/orders/[id]/documents { documentId }.
 * Ingestion-backed labels refuse (409): they unpair via the label-ingestions route.
 */

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRoutePerm(req, 'orders.create');
  if (gate.denied) return gate.denied;

  const { id: rawId } = await params;
  const documentId = parseId(rawId);
  if (documentId === null) {
    return NextResponse.json({ error: 'Invalid document id' }, { status: 400 });
  }

  try {
    const unlinked = await unlinkOutboundDocument(gate.ctx.organizationId as OrgId, documentId);

    await recordAudit(pool, gate.ctx, req, {
      source: 'orders-documents-api',
      action: AUDIT_ACTION.ORDER_DOCUMENT_UNLINK,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: unlinked.orderId ?? documentId,
      before: {
        documentId: unlinked.id,
        documentType: unlinked.documentType,
        links: unlinked.droppedLinks,
      },
      after: { documentId: unlinked.id, entityType: 'UNLINKED' },
    });

    return NextResponse.json({ success: true, id: documentId, orderId: unlinked.orderId });
  } catch (error) {
    if (error instanceof OutboundDocumentNotFoundError) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    if (error instanceof OutboundDocumentIngestionBackedError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof OutboundDocumentValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error in POST /api/documents/[id]/unlink:', error);
    return NextResponse.json({ error: 'Failed to unlink document' }, { status: 500 });
  }
}
