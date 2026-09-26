import { NextRequest, NextResponse, after } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import { publishReceivingLogChanged } from '@/lib/realtime/publish';
import { relinkReceivingPo, type RelinkScope } from '@/lib/receiving/relink-po';

/** Operator PO relink — make the website authoritative over Zoho. */
export const POST = withAuth(async (request: NextRequest, ctx) => {
  const body = await request.json().catch(() => null);

  const receivingId = Number((body as { receiving_id?: unknown })?.receiving_id);
  const rawLineId = (body as { line_id?: unknown })?.line_id;
  const lineId = rawLineId != null ? Number(rawLineId) : null;
  const zohoPurchaseorderId = String(
    (body as { zoho_purchaseorder_id?: unknown })?.zoho_purchaseorder_id || '',
  ).trim();
  const rawScope = (body as { scope?: unknown })?.scope;
  const scope: RelinkScope =
    rawScope === 'line' ? 'line' : rawScope === 'carton' ? 'carton' : 'both';

  if (!Number.isFinite(receivingId) || receivingId <= 0 || !zohoPurchaseorderId) {
    return NextResponse.json(
      { success: false, error: 'receiving_id and zoho_purchaseorder_id are required' },
      { status: 400 },
    );
  }
  // line/both need a line to rewrite; fall back to carton scope if none given.
  const effectiveScope: RelinkScope =
    (scope === 'line' || scope === 'both') && !(lineId && lineId > 0) ? 'carton' : scope;

  const result = await relinkReceivingPo(
    {
      receivingId,
      lineId,
      scope: effectiveScope,
      zohoPurchaseorderId,
      zohoPurchaseorderNumber:
        (body as { zoho_purchaseorder_number?: string })?.zoho_purchaseorder_number ?? null,
      sku: (body as { sku?: string })?.sku ?? null,
      zohoItemId: (body as { zoho_item_id?: string })?.zoho_item_id ?? null,
    },
    ctx.organizationId,
  );

  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.error ?? 'relink failed' },
      { status: result.status },
    );
  }

  after(async () => {
    try {
      await invalidateReceivingViews(ctx.organizationId);
    } catch (err) {
      console.warn('[receiving.relink.after] cache invalidation failed', err);
    }
    try {
      await publishReceivingLogChanged({
        organizationId: ctx.organizationId,
        action: 'update',
        rowId: String(result.receivingId),
        source: 'receiving.relink',
      });
    } catch (err) {
      console.error('[receiving.relink.after] realtime publish failed', err);
    }
  });

  return NextResponse.json({
    success: true,
    receiving_id: result.receivingId,
    lines_updated: result.linesUpdated,
    lines_imported: result.linesImported ?? 0,
    zoho_purchaseorder_id: result.poId,
    zoho_purchaseorder_number: result.poNumber,
    scope: effectiveScope,
    ...(result.pairedOnto != null ? { paired_onto: result.pairedOnto } : {}),
    ...(result.photosMoved != null ? { photos_moved: result.photosMoved } : {}),
  });
}, {
  permission: 'receiving.scan_po',
  audit: {
    source: 'receiving.relink',
    action: AUDIT_ACTION.RECEIVING_RELINK,
    entityType: AUDIT_ENTITY.RECEIVING,
    entityId: ({ response }) => {
      const r = response as { receiving_id?: number } | null;
      return r?.receiving_id ?? null;
    },
    extra: ({ response, body }) => {
      const r = response as {
        zoho_purchaseorder_id?: string;
        lines_updated?: number;
        lines_imported?: number;
        scope?: string;
        paired_onto?: number;
        photos_moved?: number;
      } | null;
      const b = body as { zoho_purchaseorder_number?: string; sku?: string } | null;
      return {
        zoho_purchaseorder_id: r?.zoho_purchaseorder_id ?? null,
        zoho_purchaseorder_number: b?.zoho_purchaseorder_number ?? null,
        sku_corrected: b?.sku ? true : false,
        lines_updated: r?.lines_updated ?? 0,
        lines_imported: r?.lines_imported ?? 0,
        scope: r?.scope ?? null,
        paired_onto: r?.paired_onto ?? null,
        photos_moved: r?.photos_moved ?? null,
      };
    },
  },
});
