/**
 * POST /api/receiving/inbound/import-purchase
 *
 * Incoming desk Add — land a purchase or return onto the Incoming spine via
 * ingestPurchase (+ RETURN tag). Supports manual / amazon / ebay sources.
 */

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { InboundImportPurchaseBody } from '@/lib/schemas/inbound-desk';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import {
  importDeskInboundRow,
  isDeskImportSkip,
} from '@/lib/inbound/desk-import';

export const POST = withAuth(async (request: NextRequest, ctx) => {
  const raw = await request.json().catch(() => ({}));
  const parsed = parseBody(InboundImportPurchaseBody, raw);
  if (parsed instanceof NextResponse) return parsed;

  let result;
  try {
    const outcome = await importDeskInboundRow(ctx.organizationId, {
      kind: parsed.kind,
      sourceType: parsed.source_type,
      sourcePlatform: parsed.source_platform,
      receivingType: parsed.receiving_type,
      priorityTier: parsed.priority_tier,
      orderId: parsed.order_id,
      lineItemId: parsed.line_item_id,
      sku: parsed.sku,
      itemName: parsed.item_name,
      quantity: parsed.quantity,
      trackingNumber: parsed.tracking_number,
      carrierCode: parsed.carrier_code,
      seller: parsed.seller,
      listingUrl: parsed.listing_url,
      accountName: parsed.account_name,
      returnReason: parsed.return_reason,
      rmaId: parsed.rma_id,
      conditionGrade: parsed.condition_grade,
    });
    if (isDeskImportSkip(outcome)) {
      return NextResponse.json(
        {
          success: false,
          error: `skipped: ${outcome.reason}`,
          skipped: true,
          skip_reason: outcome.reason,
        },
        { status: 400 },
      );
    }
    result = outcome;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'import failed';
    const status = /required|unregistered|must provide|cannot manually/.test(message)
      ? 400
      : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }

  await recordAudit(pool, ctx, request, {
    source: 'inbound-import-purchase',
    action: AUDIT_ACTION.RECEIVING_INBOUND_IMPORT,
    entityType: AUDIT_ENTITY.RECEIVING_LINE,
    entityId: result.receivingLineId,
    method: 'manual',
    after: {
      sourceType: result.sourceType,
      sourceOrderId: result.sourceOrderId,
      platformAccountId: result.platformAccountId,
      created: result.created,
      kind: result.kind,
    },
  });

  after(async () => {
    try {
      await invalidateReceivingViews(ctx.organizationId);
    } catch (e) {
      console.warn('[inbound/import-purchase] cache invalidation failed', e);
    }
  });

  return NextResponse.json(
    {
      success: true,
      receiving_line_id: result.receivingLineId,
      created: result.created,
      platform_account_id: result.platformAccountId,
      kind: result.kind,
      source_type: result.sourceType,
    },
    { status: result.created ? 201 : 200 },
  );
}, { permission: 'receiving.view' });
