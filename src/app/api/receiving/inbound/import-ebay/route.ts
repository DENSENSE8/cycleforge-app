/**
 * POST /api/receiving/inbound/import-ebay — hand-import one eBay purchase line.
 *
 * The body is read as one eBay buyer line and runs through the same mapper the
 * scheduled sync uses (`ebayPurchaseToInboundOrderDraft`), then lands through
 * the one inbound writer (`ingestInboundOrder`). `dry_run: true` returns the
 * writer's read-only preview instead.
 */

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import type { BuyerPurchaseLine } from '@/lib/ebay/purchase-client';
import { ebayPurchaseToInboundOrderDraft } from '@/lib/inbound/ebay-purchase-draft';
import { ingestInboundOrder, InboundOrderRefused, previewInboundOrder } from '@/lib/inbound/ingest-inbound-order';

export const POST = withAuth(async (request: NextRequest, ctx) => {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: 'invalid JSON body' }, { status: 400 });
  }

  const str = (v: unknown): string | null => (v == null ? null : String(v).trim() || null);

  // The external eBay order id — the order identity this import dedups on.
  const sourceOrderId = str(body.order_id ?? body.source_order_id);
  if (!sourceOrderId) {
    return NextResponse.json(
      { success: false, error: 'order_id (the eBay order number) is required' },
      { status: 400 },
    );
  }

  const sku = str(body.sku);
  const itemName = str(body.item_name);
  if (!sku && !itemName) {
    return NextResponse.json(
      { success: false, error: 'must provide at least one of: sku, item_name' },
      { status: 400 },
    );
  }

  const quantityRaw = body.quantity ?? body.quantity_expected;
  const quantity = quantityRaw == null ? 1 : Number(quantityRaw);
  if (!Number.isInteger(quantity) || quantity < 1) {
    return NextResponse.json(
      { success: false, error: 'quantity must be an integer >= 1' },
      { status: 400 },
    );
  }

  const unitCostRaw = body.unit_cost_cents;
  const unitCostCents = unitCostRaw == null || unitCostRaw === '' ? null : Number(unitCostRaw);
  if (unitCostCents != null && (!Number.isInteger(unitCostCents) || unitCostCents < 0)) {
    return NextResponse.json(
      { success: false, error: 'unit_cost_cents must be an integer >= 0' },
      { status: 400 },
    );
  }

  const seller = str(body.seller ?? body.seller_username);
  const line: BuyerPurchaseLine = {
    sourceOrderId,
    sourceLineItemId: str(body.line_item_id),
    sku,
    itemName,
    quantity,
    itemId: str(body.item_id),
    unitCostCents,
    currency: str(body.currency),
    orderDate: str(body.order_date),
    sellerUsername: seller,
    vendorOrSellerName: seller,
    purchaseOrderStatus: str(body.status),
    paymentStatus: str(body.payment_status),
    listingUrl: str(body.listing_url),
    trackingNumber: str(body.tracking_number),
    carrierCode: str(body.carrier_code),
  };
  const draft = ebayPurchaseToInboundOrderDraft([line], str(body.account_name ?? body.account_label));

  try {
    if (body.dry_run === true) {
      const preview = await previewInboundOrder(ctx.organizationId, draft);
      return NextResponse.json({ success: true, dry_run: true, draft, preview });
    }

    const result = await ingestInboundOrder(ctx.organizationId, draft, {
      origin: 'manual',
      source: 'ebay',
      staffId: ctx.staffId ?? null,
    });
    // An unchanged re-post reports every line of the order; answer with this one.
    const lineKey = draft.lines[0].lineKey || 'L1';
    const landedLine = result.lines.find((l) => l.lineKey === lineKey) ?? result.lines[0] ?? null;

    await recordAudit(pool, ctx, request, {
      source: 'inbound-import-ebay',
      action: AUDIT_ACTION.RECEIVING_INBOUND_IMPORT,
      entityType: AUDIT_ENTITY.RECEIVING_LINE,
      entityId: landedLine?.receivingLineId ?? null,
      method: 'manual',
      after: {
        sourceType: result.identity.sourceType,
        sourceOrderId: result.identity.externalOrderId,
        inboundOrderId: result.inboundOrderId,
        created: result.created,
        unchanged: result.unchanged,
      },
    });

    if (!result.unchanged) {
      after(async () => {
        try {
          await invalidateReceivingViews(ctx.organizationId);
        } catch (e) {
          console.warn('[inbound/import-ebay] cache invalidation failed', e);
        }
      });
    }

    return NextResponse.json(
      {
        success: true,
        inbound_order_id: result.inboundOrderId,
        receiving_line_id: landedLine?.receivingLineId ?? null,
        created: result.created,
        unchanged: result.unchanged,
      },
      { status: result.created ? 201 : 200 },
    );
  } catch (err) {
    if (err instanceof InboundOrderRefused) {
      return NextResponse.json({ success: false, error: err.message, missing: err.missing }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'import failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}, { permission: 'integrations.ebay' });
