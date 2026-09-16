import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { parseBody } from '@/lib/schemas/parse';
import { OutboundDocumentReplaceBody } from '@/lib/schemas/documents';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import {
  deleteOutboundDocument,
  replaceOutboundDocument,
  OutboundDocumentNotFoundError,
  OutboundDocumentValidationError,
} from '@/lib/documents/outbound-documents';
import type { OrgId } from '@/lib/tenancy/constants';
import pool from '@/lib/db';

/**
 * Unlink + delete one outbound document (docs/outbound-documents-plan.md §8.2).
 * Removes the `documents` row (document_entity_links cascade via FK); never
 * touches the owning order/shipment records.
 */

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function PATCH(
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

  const parsed = parseBody(OutboundDocumentReplaceBody, await req.json().catch(() => ({})));
  if (parsed instanceof NextResponse) return parsed;

  try {
    const document = await replaceOutboundDocument(
      gate.ctx.organizationId as OrgId,
      documentId,
      parsed,
    );
    await recordAudit(pool, gate.ctx, req, {
      source: 'orders-documents-api',
      action: AUDIT_ACTION.ORDER_DOCUMENT_REPLACE,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: document.links.find((link) => link.entityType === 'ORDER')?.entityId ?? documentId,
      before: { documentId, documentType: document.documentType },
      after: { url: document.data.url, filename: document.data.filename ?? null },
    });
    return NextResponse.json({ success: true, document });
  } catch (error) {
    if (error instanceof OutboundDocumentNotFoundError) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    if (error instanceof OutboundDocumentValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error in PATCH /api/documents/[id]:', error);
    return NextResponse.json({ error: 'Failed to replace document' }, { status: 500 });
  }
}

export async function DELETE(
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
    const deleted = await deleteOutboundDocument(gate.ctx.organizationId as OrgId, documentId);

    await recordAudit(pool, gate.ctx, req, {
      source: 'orders-documents-api',
      action: AUDIT_ACTION.ORDER_DOCUMENT_DELETE,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: deleted.orderId ?? documentId,
      before: { documentId: deleted.id, documentType: deleted.documentType },
    });

    return NextResponse.json({ success: true, id: documentId });
  } catch (error) {
    if (error instanceof OutboundDocumentNotFoundError) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    console.error('Error in DELETE /api/documents/[id]:', error);
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 });
  }
}
