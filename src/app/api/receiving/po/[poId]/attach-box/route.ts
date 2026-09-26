import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import { publishReceivingLogChanged } from '@/lib/realtime/publish';
import {
  attachBoxToReceiving,
  ensureReceivingForPo,
  listBoxesForReceiving,
} from '@/lib/receiving/attach-box';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { tenantQuery } from '@/lib/tenancy/db';
import { INBOUND_SOURCE_TYPES } from '@/lib/inbound/source-registry';

/** Sargable `= ANY(...)` list for the polymorphic-link fallback (see resolvePo). */
const NON_ZOHO_INBOUND_SOURCES: string[] = INBOUND_SOURCE_TYPES.filter((t) => t !== 'zoho');

/** POST /api/receiving/po/:poId/attach-box */

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
    if (!po) {
      return NextResponse.json(
        { success: false, error: 'No matching purchase order found' },
        { status: 404 },
      );
    }

    const carton = await tenantQuery<{ id: number }>(
      orgId,
      `SELECT id FROM receiving_carton
        WHERE source = 'zoho_po' AND zoho_purchaseorder_id = $1
        ORDER BY id DESC
        LIMIT 1`,
      [po.poId],
    );
    const receivingId = carton.rows[0]?.id ?? null;
    const boxes = receivingId ? await listBoxesForReceiving(receivingId) : [];

    return NextResponse.json({
      success: true,
      po_id: po.poId,
      po_number: po.poNumber,
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

    // Resolve the PO (accept a Zoho purchaseorder_id or a PO number/reference).
    const po = await resolvePo(orgId, poIdInput);
    if (!po) {
      return NextResponse.json(
        { success: false, error: 'No matching purchase order found' },
        { status: 404 },
      );
    }
    const { poId, poNumber } = po;

    const receivingId = await ensureReceivingForPo({ poId, poNumber, organizationId: ctx.organizationId });

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
