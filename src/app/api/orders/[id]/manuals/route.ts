import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import {
  createOrderManualFromFile,
  listOrderManuals,
  OrderManualError,
  pairExistingManualToOrder,
} from '@/lib/manuals/order-manuals';
import { PaperworkPairingError, parsePairScope } from '@/lib/manuals/paperwork-pairing';
import { ManualFileError } from '@/lib/manuals/manual-file-store';
import type { OrgId } from '@/lib/tenancy/constants';
import pool from '@/lib/db';

// Word → PDF conversion runs in a Vercel Sandbox (see lib/manuals/docxToPdf).
export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Paperwork for one order (To-ship paperwork walk + its item-number view):
 * manuals, packing lists, any `product_manuals` row.
 *   GET  → every row resolved for the order — pinned to the order, its item
 *          number or its SKU — in precedence order (order > item # > SKU).
 *   POST → multipart `file` (+ displayName, type, pairTo): upload + pin a new
 *          row; JSON `{ manualId, pairTo? }`: pin an existing library row.
 *          `pairTo` = order | item_number | sku (default: item number, else
 *          SKU, else order).
 * Domain logic: lib/manuals/order-manuals + lib/manuals/paperwork-pairing.
 */

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRoutePerm(req, 'orders.view');
  if (gate.denied) return gate.denied;

  const { id: rawId } = await params;
  const orderId = parseId(rawId);
  if (orderId === null) {
    return NextResponse.json({ success: false, error: 'Invalid order id' }, { status: 400 });
  }

  try {
    const result = await listOrderManuals(gate.ctx.organizationId as OrgId, orderId);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof OrderManualError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Error in GET /api/orders/[id]/manuals:', error);
    return NextResponse.json({ success: false, error: 'Failed to load manuals' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRoutePerm(req, 'product_manuals.manage');
  if (gate.denied) return gate.denied;

  const { id: rawId } = await params;
  const orderId = parseId(rawId);
  if (orderId === null) {
    return NextResponse.json({ success: false, error: 'Invalid order id' }, { status: 400 });
  }
  const orgId = gate.ctx.organizationId as OrgId;

  try {
    if ((req.headers.get('content-type') || '').includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      if (!(file instanceof File)) {
        return NextResponse.json({ success: false, error: 'file is required' }, { status: 400 });
      }
      const manual = await createOrderManualFromFile(orgId, orderId, file, {
        displayName: String(form.get('displayName') ?? ''),
        type: String(form.get('type') ?? ''),
        pairTo: parsePairScope(form.get('pairTo')),
      });
      await recordAudit(pool, gate.ctx, req, {
        source: 'orders-manuals',
        action: AUDIT_ACTION.ORDER_MANUAL_ATTACH,
        entityType: AUDIT_ENTITY.ORDER,
        entityId: orderId,
        after: { manualId: manual.id, displayName: manual.displayName, fileName: manual.fileName, pairing: manual.pairing },
      });
      return NextResponse.json({ success: true, manual }, { status: 201 });
    }

    const body = (await req.json().catch(() => null)) as { manualId?: unknown; pairTo?: unknown } | null;
    const manualId = parseId(String(body?.manualId ?? ''));
    if (manualId === null) {
      return NextResponse.json(
        { success: false, error: 'multipart file or JSON { manualId } is required' },
        { status: 400 },
      );
    }
    const { manual, before } = await pairExistingManualToOrder(orgId, orderId, manualId, parsePairScope(body?.pairTo));
    await recordAudit(pool, gate.ctx, req, {
      source: 'orders-manuals',
      action: AUDIT_ACTION.ORDER_MANUAL_PAIR,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: orderId,
      before: { manualId, pairing: before },
      after: { manualId, pairing: manual.pairing },
    });
    return NextResponse.json({ success: true, manual });
  } catch (error) {
    if (error instanceof OrderManualError || error instanceof PaperworkPairingError || error instanceof ManualFileError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Error in POST /api/orders/[id]/manuals:', error);
    return NextResponse.json({ success: false, error: 'Failed to attach manual' }, { status: 500 });
  }
}
