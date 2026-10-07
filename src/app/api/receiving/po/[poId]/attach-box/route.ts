import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import { publishReceivingLogChanged } from '@/lib/realtime/publish';
import {
  attachBoxToReceiving,
  detachBoxFromReceiving,
  ensureReceivingForInboundPurchase,
  ensureReceivingForPo,
  findInboundPurchaseCarton,
  listBoxesForReceiving,
} from '@/lib/receiving/attach-box';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { tenantQuery } from '@/lib/tenancy/db';
import { INBOUND_SOURCE_TYPES } from '@/lib/inbound/source-registry';

/** Sargable `= ANY(...)` list for the polymorphic-link fallback (see resolvePo). */
const NON_ZOHO_INBOUND_SOURCES: string[] = INBOUND_SOURCE_TYPES.filter((t) => t !== 'zoho');

/**
 * POST /api/receiving/po/:poId/attach-box — attach one carrier tracking
 * number as a box of a purchase BEFORE it arrives. `:poId` is a Zoho PO (id
 * or PO#), else a marketplace / manual order number (`inbound_order`). Links
 * only: no scan, no door receipt, no unbox — the purchase stays "not
 * received" until the dock scans it. DELETE undoes one fresh attach.
 */

/** Resolve a Zoho purchaseorder_id (or PO number/reference) to the canonical id. */
async function resolvePo(
  orgId: string,
  poIdInput: string,
): Promise<{ poId: string; poNumber: string | null } | null> {
  const norm = poIdInput.toUpperCase().replace(/[^A-Z0-9]/g, '');
  // Line-level Zoho facts live on receiving_line_zoho (rz, 1:1 with the line;
  // every Zoho-bearing line has a row, so LEFT JOIN + WHERE rz.col is exactly
  // the old spine filter).
  const resolved = await tenantQuery<{ zoho_purchaseorder_id: string; zoho_purchaseorder_number: string | null }>(
    orgId,
    `SELECT rz.zoho_purchaseorder_id, rz.zoho_purchaseorder_number
       FROM receiving_line rl
       LEFT JOIN receiving_line_zoho rz
         ON rz.receiving_line_id = rl.id
        AND rz.organization_id = rl.organization_id
      WHERE rz.zoho_purchaseorder_id = $1
         OR rz.zoho_purchaseorder_number_norm = $2
      ORDER BY rl.id DESC
      LIMIT 1`,
    [poIdInput, norm],
  );
  let poId = resolved.rows[0]?.zoho_purchaseorder_id ?? null;
  let poNumber = resolved.rows[0]?.zoho_purchaseorder_number ?? null;
  if (!poId) {
    const m = await tenantQuery<{ zoho_purchaseorder_id: string; zoho_purchaseorder_number: string | null }>(
      orgId,
      `SELECT zoho_purchaseorder_id, zoho_purchaseorder_number
         FROM zoho_po_mirror
        WHERE zoho_purchaseorder_id = $1
           OR zoho_purchaseorder_number_norm = $2
        ORDER BY last_synced_at DESC NULLS LAST
        LIMIT 1`,
      [poIdInput, norm],
    );
    poId = m.rows[0]?.zoho_purchaseorder_id ?? null;
    poNumber = poNumber ?? m.rows[0]?.zoho_purchaseorder_number ?? null;
  }
  // Universal Incoming fallback:
  if (!poId) {
    const link = await tenantQuery<{ zoho_purchaseorder_id: string; zoho_purchaseorder_number: string | null }>(
      orgId,
      `SELECT z.source_order_id AS zoho_purchaseorder_id,
              rz.zoho_purchaseorder_number
         FROM inbound_purchase_order_links l
         JOIN inbound_purchase_order_links z
           ON z.receiving_line_id = l.receiving_line_id
          AND z.organization_id  = l.organization_id
          AND z.source_type = 'zoho'
         JOIN receiving_line rl
           ON rl.id = l.receiving_line_id AND rl.organization_id = l.organization_id
         LEFT JOIN receiving_line_zoho rz
           ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
        WHERE l.organization_id = $1
          AND l.source_type = ANY($3::text[])
          AND l.source_order_id = $2
        ORDER BY z.is_primary DESC, z.id
        LIMIT 1`,
      [orgId, poIdInput, NON_ZOHO_INBOUND_SOURCES],
    );
    poId = link.rows[0]?.zoho_purchaseorder_id ?? null;
    poNumber = poNumber ?? link.rows[0]?.zoho_purchaseorder_number ?? null;
  }
  return poId ? { poId, poNumber } : null;
}

/** GET /api/receiving/po/:poId/attach-box */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ poId: string }> },
) {
  try {
    const gate = await requireRoutePerm(request, 'receiving.mark_received');
    if (gate.denied) return gate.denied;
    const orgId = gate.ctx.organizationId;

    const { poId: poIdRaw } = await params;
    const poIdInput = decodeURIComponent(String(poIdRaw ?? '')).trim();
    if (!poIdInput) {
      return NextResponse.json(
        { success: false, error: 'PO id is required' },
        { status: 400 },
      );
    }

    const po = await resolvePo(orgId, poIdInput);
    // A marketplace / manual purchase: its carton by order number, read-only (the POST mints one when needed).
    const receivingId = po
      ? ((
          await tenantQuery<{ id: number }>(
            orgId,
            `SELECT id FROM receiving_carton
              WHERE source = 'zoho_po' AND zoho_purchaseorder_id = $1
              ORDER BY id DESC
              LIMIT 1`,
            [po.poId],
          )
        ).rows[0]?.id ?? null)
      : await findInboundPurchaseCarton(orgId, poIdInput);
    const boxes = receivingId ? await listBoxesForReceiving(receivingId) : [];

    return NextResponse.json({
      success: true,
      po_id: po?.poId ?? null,
      po_number: po?.poNumber ?? poIdInput,
      receiving_id: receivingId,
      box_count: boxes.length,
      boxes,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list PO boxes';
    console.error('receiving/po/[poId]/attach-box GET failed:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ poId: string }> },
) {
  try {
    const gate = await requireRoutePerm(request, 'receiving.mark_received');
    if (gate.denied) return gate.denied;
    const ctx = gate.ctx;
    const orgId = ctx.organizationId;
    const staffId = Number(ctx.staffId) || null;

    const { poId: poIdRaw } = await params;
    const poIdInput = decodeURIComponent(String(poIdRaw ?? '')).trim();
    if (!poIdInput) {
      return NextResponse.json(
        { success: false, error: 'PO id is required' },
        { status: 400 },
      );
    }

    const contentType = request.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      return NextResponse.json(
        { success: false, error: 'Content-Type must be application/json' },
        { status: 415 },
      );
    }
    let body: Record<string, unknown>;
    try {
      const parsed = await request.json();
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return NextResponse.json(
          { success: false, error: 'Body must be a JSON object' },
          { status: 400 },
        );
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      );
    }

    const tracking = String(body.trackingNumber ?? '').trim();
    if (!tracking) {
      return NextResponse.json(
        { success: false, error: 'trackingNumber is required' },
        { status: 400 },
      );
    }

    // Resolve the purchase: a Zoho PO (id or PO#), else a marketplace / manual order number.
    const po = await resolvePo(orgId, poIdInput);
    const order = po ? null : await ensureReceivingForInboundPurchase(ctx.organizationId, poIdInput);
    if (!po && !order) {
      return NextResponse.json(
        { success: false, error: 'No matching purchase order found' },
        { status: 404 },
      );
    }
    const poId = po?.poId ?? null;
    const poNumber = po?.poNumber ?? order?.sourceOrderId ?? null;

    const receivingId = po
      ? await ensureReceivingForPo({ poId: po.poId, poNumber: po.poNumber, organizationId: ctx.organizationId })
      : order!.receivingId;

    const result = await attachBoxToReceiving({
      receivingId,
      trackingNumber: tracking,
      staffId,
      organizationId: ctx.organizationId,
    });
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

    await invalidateReceivingViews(ctx.organizationId);
    await publishReceivingLogChanged({
      organizationId: ctx.organizationId,
      action: 'update',
      rowId: String(receivingId),
      source: 'receiving.po.attach-box',
    });

    await recordAudit(pool, ctx, request, {
      source: 'receiving.po.attach-box',
      action: AUDIT_ACTION.RECEIVING_HEADER_UPDATE,
      entityType: AUDIT_ENTITY.RECEIVING,
      entityId: receivingId,
      before: null,
      after: {
        zoho_purchaseorder_id: poId,
        source_order_id: order?.sourceOrderId ?? null,
        shipment_id: result.shipmentId,
        tracking_number: tracking,
        box_seq: result.boxSeq,
        is_primary: result.isPrimary,
        already_attached: result.alreadyAttached,
      },
      method: 'manual',
    });

    return NextResponse.json({
      success: true,
      po_id: poId,
      po_number: poNumber,
      receiving_id: receivingId,
      shipment_id: result.shipmentId,
      already_attached: result.alreadyAttached,
      box_count: result.boxCount,
      boxes: result.boxes,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to attach box to PO';
    console.error('receiving/po/[poId]/attach-box POST failed:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/** DELETE /api/receiving/po/:poId/attach-box — undo one attach: `{ receivingId, shipmentId }` from its POST answer. */
export async function DELETE(request: NextRequest) {
  try {
    const gate = await requireRoutePerm(request, 'receiving.mark_received');
    if (gate.denied) return gate.denied;
    const ctx = gate.ctx;
    const body = (await request.json().catch(() => null)) as { receivingId?: unknown; shipmentId?: unknown } | null;
    const receivingId = Number(body?.receivingId);
    const shipmentId = Number(body?.shipmentId);
    if (!Number.isInteger(receivingId) || receivingId <= 0 || !Number.isInteger(shipmentId) || shipmentId <= 0) {
      return NextResponse.json({ success: false, error: 'receivingId and shipmentId are required' }, { status: 400 });
    }
    const result = await detachBoxFromReceiving({ receivingId, shipmentId, organizationId: ctx.organizationId });
    if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: result.status });

    await invalidateReceivingViews(ctx.organizationId);
    await publishReceivingLogChanged({
      organizationId: ctx.organizationId,
      action: 'update',
      rowId: String(receivingId),
      source: 'receiving.po.detach-box',
    });
    await recordAudit(pool, ctx, request, {
      source: 'receiving.po.detach-box',
      action: AUDIT_ACTION.RECEIVING_HEADER_UPDATE,
      entityType: AUDIT_ENTITY.RECEIVING,
      entityId: receivingId,
      before: { attached_shipment_id: shipmentId },
      after: { detached_shipment_id: shipmentId, box_count: result.boxCount, undone: true },
      method: 'manual',
    });
    return NextResponse.json({ success: true, receiving_id: receivingId, box_count: result.boxCount, boxes: result.boxes });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to undo the attach';
    console.error('receiving/po/[poId]/attach-box DELETE failed:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
