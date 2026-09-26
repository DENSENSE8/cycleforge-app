import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import {
  OrderManualError,
  removeOrderManual,
  replaceOrderManualFile,
  updateOrderManual,
} from '@/lib/manuals/order-manuals';
import { PaperworkPairingError, parsePaperworkPairing } from '@/lib/manuals/paperwork-pairing';
import { ManualFileError } from '@/lib/manuals/manual-file-store';
import type { OrgId } from '@/lib/tenancy/constants';
import pool from '@/lib/db';

// Word → PDF conversion runs in a Vercel Sandbox (see lib/manuals/docxToPdf).
export const runtime = 'nodejs';
export const maxDuration = 120;

/** One paperwork row resolved for an order (To-ship paperwork walk + its item-number view). */

type Params = { params: Promise<{ id: string; manualId: string }> };

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const gate = await requireRoutePerm(req, 'product_manuals.manage');
  if (gate.denied) return gate.denied;

  const { id: rawId, manualId: rawManualId } = await params;
  const orderId = parseId(rawId);
  const manualId = parseId(rawManualId);
  if (orderId === null || manualId === null) {
    return NextResponse.json({ success: false, error: 'Invalid order or manual id' }, { status: 400 });
  }
  const orgId = gate.ctx.organizationId as OrgId;

  try {
    if ((req.headers.get('content-type') || '').includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      if (!(file instanceof File)) {
        return NextResponse.json({ success: false, error: 'file is required' }, { status: 400 });
      }
      const manual = await replaceOrderManualFile(
        orgId,
        orderId,
        manualId,
        file,
        String(form.get('displayName') ?? ''),
      );
      await recordAudit(pool, gate.ctx, req, {
        source: 'orders-manuals',
        action: AUDIT_ACTION.ORDER_MANUAL_REPLACE,
        entityType: AUDIT_ENTITY.ORDER,
        entityId: orderId,
        after: { manualId, fileName: manual.fileName, displayName: manual.displayName },
      });
      return NextResponse.json({ success: true, manual });
    }

    const body = (await req.json().catch(() => null)) as
      | { displayName?: unknown; type?: unknown; pairing?: unknown }
      | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: 'JSON body or multipart file is required' }, { status: 400 });
    }
    if (
      (body.displayName !== undefined && typeof body.displayName !== 'string')
      || (body.type !== undefined && body.type !== null && typeof body.type !== 'string')
    ) {
      return NextResponse.json({ success: false, error: 'displayName and type must be strings' }, { status: 400 });
    }
    const pairing = body.pairing === undefined ? undefined : parsePaperworkPairing(body.pairing);
    const { manual, before } = await updateOrderManual(orgId, orderId, manualId, {
      displayName: body.displayName as string | undefined,
      type: body.type as string | null | undefined,
      pairing,
    });
    await recordAudit(pool, gate.ctx, req, {
      source: 'orders-manuals',
      action: pairing ? AUDIT_ACTION.ORDER_MANUAL_PAIR : AUDIT_ACTION.ORDER_MANUAL_UPDATE,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: orderId,
      before: pairing ? { manualId, pairing: before } : undefined,
      after: { manualId, displayName: manual.displayName, type: manual.type, pairing: manual.pairing },
    });
    return NextResponse.json({ success: true, manual });
  } catch (error) {
    if (error instanceof OrderManualError || error instanceof PaperworkPairingError || error instanceof ManualFileError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Error in PATCH /api/orders/[id]/manuals/[manualId]:', error);
    return NextResponse.json({ success: false, error: 'Failed to update manual' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const gate = await requireRoutePerm(req, 'product_manuals.manage');
  if (gate.denied) return gate.denied;

  const { id: rawId, manualId: rawManualId } = await params;
  const orderId = parseId(rawId);
  const manualId = parseId(rawManualId);
  if (orderId === null || manualId === null) {
    return NextResponse.json({ success: false, error: 'Invalid order or manual id' }, { status: 400 });
  }
  const modeRaw = req.nextUrl.searchParams.get('mode') ?? 'unpair';
  if (modeRaw !== 'unpair' && modeRaw !== 'delete') {
    return NextResponse.json({ success: false, error: 'mode must be unpair or delete' }, { status: 400 });
  }

  try {
    const before = await removeOrderManual(gate.ctx.organizationId as OrgId, orderId, manualId, modeRaw);
    await recordAudit(pool, gate.ctx, req, {
      source: 'orders-manuals',
      action: modeRaw === 'delete' ? AUDIT_ACTION.ORDER_MANUAL_DELETE : AUDIT_ACTION.ORDER_MANUAL_UNPAIR,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: orderId,
      before: { manualId, pairing: before },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof OrderManualError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Error in DELETE /api/orders/[id]/manuals/[manualId]:', error);
    return NextResponse.json({ success: false, error: 'Failed to remove manual' }, { status: 500 });
  }
}
