/**
 * PATCH /api/receiving/inbound/update-identity
 *
 * Desk edit of tracking / listing URL / order display # on non-Zoho Incoming rows.
 */

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { InboundUpdateIdentityBody } from '@/lib/schemas/inbound-desk';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import { updateInboundIdentity } from '@/lib/inbound/update-identity';

export const PATCH = withAuth(async (request: NextRequest, ctx) => {
  const raw = await request.json().catch(() => ({}));
  const parsed = parseBody(InboundUpdateIdentityBody, raw);
  if (parsed instanceof NextResponse) return parsed;

  if (
    parsed.tracking_number === undefined
    && parsed.listing_url === undefined
    && parsed.order_number === undefined
    && parsed.sku_catalog_id === undefined
  ) {
    return NextResponse.json(
      { success: false, error: 'provide at least one of: tracking_number, listing_url, order_number, sku_catalog_id' },
      { status: 400 },
    );
  }

  let result;
  try {
    result = await updateInboundIdentity(ctx.organizationId, {
      receivingLineId: parsed.receiving_line_id,
      trackingNumber: parsed.tracking_number,
      listingUrl: parsed.listing_url,
      orderNumber: parsed.order_number,
      skuCatalogId: parsed.sku_catalog_id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'update failed';
    const status = /not found/.test(message)
      ? 404
      : /required|read-only|Zoho|no marketplace/.test(message)
        ? 400
        : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }

  await recordAudit(pool, ctx, request, {
    source: 'inbound-update-identity',
    action: AUDIT_ACTION.RECEIVING_INBOUND_IMPORT,
    entityType: AUDIT_ENTITY.RECEIVING_LINE,
    entityId: result.receivingLineId,
    method: 'manual',
    after: {
      sourceType: result.sourceType,
      sourceOrderId: result.sourceOrderId,
      tracking_number: parsed.tracking_number,
      listing_url: parsed.listing_url,
      order_number: parsed.order_number,
      sku_catalog_id: parsed.sku_catalog_id,
    },
  });

  after(async () => {
    try {
      await invalidateReceivingViews(ctx.organizationId);
    } catch (e) {
      console.warn('[inbound/update-identity] cache invalidation failed', e);
    }
  });

  return NextResponse.json({
    success: true,
    receiving_line_id: result.receivingLineId,
    source_type: result.sourceType,
    source_order_id: result.sourceOrderId,
  });
}, { permission: 'receiving.view' });
