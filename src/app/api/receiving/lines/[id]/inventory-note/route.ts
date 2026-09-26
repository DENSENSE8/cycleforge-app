/** PATCH /api/receiving/lines/[id]/inventory-note */
import { NextRequest, NextResponse, after } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { tenantQuery } from '@/lib/tenancy/db';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import {
  syncItemDescriptionToZohoPo,
  type SyncItemDescriptionResult,
} from '@/lib/receiving/zoho-item-description-sync';
import { withZohoOrg } from '@/lib/zoho/tenant-context';

type LineRow = {
  id: number;
  sku: string | null;
  item_name: string | null;
  zoho_purchaseorder_id: string | null;
  zoho_line_item_id: string | null;
};

function savedLabelForZoho(
  description: string | null,
  zoho: SyncItemDescriptionResult,
): string {
  if (!description) return 'Item description cleared';
  if (zoho.patched) return 'Item description updated in Zoho';
  if (zoho.skipped === 'no_zoho_link') return 'Item description saved locally';
  if (zoho.skipped === 'no_line_item_id') {
    return 'Item description saved locally — sync with Zoho first';
  }
  if (zoho.skipped === 'po_not_editable') {
    return 'Item description saved locally — Zoho PO is not editable';
  }
  return 'Item description updated';
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireRoutePerm(request, 'receiving.mark_received');
    if (gate.denied) return gate.denied;
    const ctx = gate.ctx;

    const { id: idRaw } = await params;
    const lineId = Number(idRaw);
    if (!Number.isFinite(lineId) || lineId <= 0) {
      return NextResponse.json({ success: false, error: 'Valid line id is required' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    if (!Object.prototype.hasOwnProperty.call(body, 'zoho_notes')) {
      return NextResponse.json({ success: false, error: 'zoho_notes is required' }, { status: 400 });
    }
    const raw = body.zoho_notes;
    const next = raw == null || raw === '' ? null : String(raw).trim() || null;
    const baseLastModifiedZoho = Object.prototype.hasOwnProperty.call(
      body,
      'base_last_modified_zoho',
    )
      ? body.base_last_modified_zoho == null || body.base_last_modified_zoho === ''
        ? null
        : String(body.base_last_modified_zoho).trim() || null
      : undefined;
    const orgId = ctx.organizationId;

    const lineRes = await tenantQuery<LineRow>(
      orgId,
      `SELECT rl.id,
              rl.sku,
              rl.item_name,
              rz.zoho_purchaseorder_id,
              rz.zoho_line_item_id
         FROM receiving_line rl
         LEFT JOIN receiving_line_zoho rz
           ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
        WHERE rl.id = $1 AND rl.organization_id = $2
        LIMIT 1`,
      [lineId, orgId],
    );
    const line = lineRes.rows[0];
    if (!line) {
      return NextResponse.json({ success: false, error: `receiving_line ${lineId} not found` }, { status: 404 });
    }

    // Ensure the 1:1 zoho satellite exists, then write description there.
    await tenantQuery(
      orgId,
      `INSERT INTO receiving_line_zoho (receiving_line_id, organization_id, zoho_notes, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (receiving_line_id) DO UPDATE
         SET zoho_notes = EXCLUDED.zoho_notes,
             updated_at = NOW()`,
      [lineId, orgId, next],
    );

    // Bind the authenticated tenant so the Zoho client resolves THIS org's creds.
    const zoho = await withZohoOrg(orgId, () =>
      syncItemDescriptionToZohoPo({
        zohoPoId: line.zoho_purchaseorder_id,
        zohoLineItemId: line.zoho_line_item_id,
        sku: line.sku,
        itemName: line.item_name,
        description: next,
        baseLastModifiedZoho,
      }),
    );

    if (zoho.resolved_line_item_id && zoho.resolved_line_item_id !== line.zoho_line_item_id) {
      await tenantQuery(
        orgId,
        `UPDATE receiving_line_zoho
            SET zoho_line_item_id = $1, updated_at = NOW()
          WHERE receiving_line_id = $2 AND organization_id = $3`,
        [zoho.resolved_line_item_id, lineId, orgId],
      );
    }

    after(async () => {
      try { await invalidateReceivingViews(orgId); } catch { /* best-effort */ }
    });

    if (zoho.skipped === 'stale') {
      return NextResponse.json(
        {
          success: false,
          stale: true,
          error: zoho.error || 'Inventory changed — Refresh',
          line_id: lineId,
          zoho_notes: next,
          live_last_modified_zoho: zoho.live_last_modified_zoho ?? null,
          zoho,
        },
        { status: 409 },
      );
    }

    if (!zoho.ok && !zoho.skipped) {
      return NextResponse.json(
        {
          success: false,
          error: zoho.error || 'Zoho item description update failed',
          line_id: lineId,
          zoho_notes: next,
          zoho,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      line_id: lineId,
      zoho_notes: next,
      zoho,
      live_last_modified_zoho: zoho.live_last_modified_zoho ?? null,
      saved_label: savedLabelForZoho(next, zoho),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save item description';
    console.error('receiving/lines/[id]/inventory-note PATCH failed:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
