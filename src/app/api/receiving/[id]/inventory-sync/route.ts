/** POST /api/receiving/[id]/inventory-sync */
import { NextRequest, NextResponse, after } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { tenantQuery } from '@/lib/tenancy/db';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import { promoteLocallyReceivedUnboxedToDone } from '@/lib/receiving/promote-locally-received';
import { resolveCartonZohoPoId } from '@/lib/receiving/resolve-carton-po-id';
import { importZohoPurchaseOrderToReceiving } from '@/lib/zoho-receiving-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireRoutePerm(request, 'receiving.scan_po');
    if (gate.denied) return gate.denied;
    const orgId = gate.ctx.organizationId;
    const staffId = gate.ctx.staffId ?? null;

    const { id: idRaw } = await params;
    const receivingId = Number(idRaw);
    if (!Number.isFinite(receivingId) || receivingId <= 0) {
      return NextResponse.json({ success: false, error: 'Valid receiving id is required' }, { status: 400 });
    }

    // Local DONE repair first — stuck UNBOXED + qty-received must paint RECEIVED
    // even when the live Zoho pull below fails.
    let promoted = 0;
    try {
      const repair = await promoteLocallyReceivedUnboxedToDone({
        organizationId: orgId,
        receivingId,
        actorStaffId: staffId,
      });
      promoted = repair.promoted;
    } catch (err) {
      console.warn('receiving/[id]/inventory-sync local DONE repair failed', receivingId, err);
    }

    const poId = await resolveCartonZohoPoId(orgId, receivingId);
    if (!poId) {
      return NextResponse.json({
        success: true,
        skipped: 'no_zoho_link',
        zoho_notes: null,
        local_promoted: promoted,
      });
    }

    try {
      await importZohoPurchaseOrderToReceiving(orgId, poId, { receivingId });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Inventory sync failed';
      console.warn('receiving/[id]/inventory-sync import failed', receivingId, poId, message);
      // Local repair may still have fixed paint — surface both.
      return NextResponse.json(
        { success: false, error: message, local_promoted: promoted },
        { status: 502 },
      );
    }

    after(async () => {
      try { await invalidateReceivingViews(orgId); } catch { /* best-effort */ }
    });

    // Read back the synced carton notes so the caller can refresh its display.
    const res = await tenantQuery<{ zoho_notes: string | null }>(
      orgId,
      `SELECT zoho_notes FROM receiving_carton WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [receivingId, orgId],
    );

    return NextResponse.json({
      success: true,
      purchaseorder_id: poId,
      zoho_notes: res.rows[0]?.zoho_notes ?? null,
      local_promoted: promoted,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to sync from inventory provider';
    console.error('receiving/[id]/inventory-sync POST failed:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
