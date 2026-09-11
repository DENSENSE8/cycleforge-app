import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import {
  storeOutboundDocumentFromBytes,
  OutboundDocumentNotFoundError,
  OutboundDocumentValidationError,
} from '@/lib/documents/outbound-documents';
import type { OutboundDocumentType } from '@/lib/documents/types';
import type { OrgId } from '@/lib/tenancy/constants';
import pool from '@/lib/db';

const DOCUMENT_TYPES: ReadonlySet<string> = new Set(['shipping_label', 'packing_slip']);

function isDocumentType(value: string): value is OutboundDocumentType {
  return DOCUMENT_TYPES.has(value);
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function extensionOf(filename: string, mime: string): string {
  const fromName = filename.split('.').pop()?.trim().toLowerCase();
  if (fromName && fromName.length <= 5) return fromName;
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg') return 'jpg';
  return 'bin';
}

/**
 * POST /api/orders/[id]/documents/upload
 *
 * Multipart file → packing_slip | shipping_label on the order.
 * Packer scan already prints the linked bundle (`documents/print`).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRoutePerm(req, 'orders.create');
  if (gate.denied) return gate.denied;

  const { id: rawId } = await params;
  const orderId = parseId(rawId);
  if (orderId === null) {
    return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'multipart body required' }, { status: 400 });
  }

  const file = form.get('file');
  const typeRaw = String(form.get('documentType') ?? '').trim();
  const orderRef = String(form.get('orderRef') ?? orderId).trim() || String(orderId);
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }
  if (!isDocumentType(typeRaw)) {
    return NextResponse.json({ error: 'documentType must be packing_slip or shipping_label' }, { status: 400 });
  }
  const documentType = typeRaw;
  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || 'application/octet-stream';

  try {
    const result = await storeOutboundDocumentFromBytes(gate.ctx.organizationId as OrgId, {
      orderId,
      orderRef,
      documentType,
      platform: 'manual',
      source: 'manual_upload',
      buffer,
      contentType,
      extension: extensionOf(file.name, contentType),
      filename: file.name,
      uploadedBy: gate.ctx.staffId ?? null,
    });

    await recordAudit(pool, gate.ctx, req, {
      source: 'orders-documents-upload',
      action: AUDIT_ACTION.ORDER_DOCUMENT_ATTACH,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: orderId,
      after: { documentId: result.document.id, documentType },
    });

    return NextResponse.json({ success: true, document: result.document, created: result.created }, { status: 201 });
  } catch (error) {
    if (error instanceof OutboundDocumentNotFoundError) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    if (error instanceof OutboundDocumentValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error in POST /api/orders/[id]/documents/upload:', error);
    return NextResponse.json({ error: 'Failed to upload document' }, { status: 500 });
  }
}
