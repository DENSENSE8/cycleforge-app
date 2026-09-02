/**
 * POST /api/receiving/inbound/confirm-po
 *
 * Confirm a multi-line PO intake draft → N× importDeskInboundRow.
 * Rejects drafts that still miss required fields (no silent qty=1).
 */

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { z } from 'zod';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import {
  importDeskInboundRow,
  isDeskImportSkip,
} from '@/lib/inbound/desk-import';
import {
  inboundSourcePlatformForRaw,
  inboundSourceTypeForPlatform,
} from '@/lib/inbound/desk-csv';
import {
  buildPoIntakeImportBodies,
  canConfirmPoIntake,
  missingPoIntakeFields,
  poIntakeMissingPrompt,
  type PoIntakeDraft,
} from '@/lib/inbound/po-intake-draft';

const LineSchema = z.object({
  sku: z.string().trim().max(200).optional().default(''),
  item_name: z.string().trim().max(500).optional().default(''),
  quantity: z.string().trim().max(20),
  line_item_id: z.string().trim().max(200).optional().default(''),
  sku_catalog_id: z.coerce.number().int().positive().optional().nullable(),
  listing_url: z.string().trim().max(2000).optional().default(''),
});

const Body = z.object({
  kind: z.enum(['purchase', 'return']).default('purchase'),
  platform: z.string().trim().min(1).max(40),
  order_id: z.string().trim().min(1).max(200),
  seller: z.string().trim().max(200).optional().default(''),
  account_name: z.string().trim().max(200).optional().default(''),
  tracking_number: z.string().trim().max(200).optional().default(''),
  carrier_code: z.string().trim().max(40).optional().default(''),
  listing_url: z.string().trim().max(2000).optional().default(''),
  priority: z.string().trim().max(10).optional().default('auto'),
  return_reason: z.string().trim().max(500).optional().default(''),
  rma_id: z.string().trim().max(200).optional().default(''),
  lines: z.array(LineSchema).min(1).max(100),
});

export const POST = withAuth(async (request: NextRequest, ctx) => {
  const raw = await request.json().catch(() => ({}));
  const parsed = parseBody(Body, raw);
  if (parsed instanceof NextResponse) return parsed;

  const draft: PoIntakeDraft = {
    kind: parsed.kind,
    platform: parsed.platform,
    orderId: parsed.order_id,
    seller: parsed.seller,
    accountName: parsed.account_name,
    trackingNumber: parsed.tracking_number,
    carrierCode: parsed.carrier_code,
    listingUrl: parsed.listing_url,
    priority: parsed.priority || 'auto',
    returnReason: parsed.return_reason,
    rmaId: parsed.rma_id,
    notes: '',
    lines: parsed.lines.map((l) => ({
      sku: l.sku,
      itemName: l.item_name,
      quantity: l.quantity,
      lineItemId: l.line_item_id,
      catalogId: l.sku_catalog_id ?? null,
      listingUrl: l.listing_url,
    })),
  };

  const missing = missingPoIntakeFields(draft);
  if (!canConfirmPoIntake(draft)) {
    return NextResponse.json(
      {
        success: false,
        error: poIntakeMissingPrompt(missing) || 'Draft is incomplete',
        missing,
      },
      { status: 400 },
    );
  }

  let bodies;
  try {
    bodies = buildPoIntakeImportBodies(draft, (platform) => ({
      sourceType: inboundSourceTypeForPlatform(platform),
      sourcePlatform: inboundSourcePlatformForRaw(platform),
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid draft';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }

  const results: Array<{
    line: number;
    ok: boolean;
    created?: boolean;
    receiving_line_id?: number;
    receiving_id?: number | null;
    error?: string;
  }> = [];

  let created = 0;
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i]!;
    try {
      const outcome = await importDeskInboundRow(ctx.organizationId, {
        kind: body.kind,
        sourceType: body.source_type,
        sourcePlatform: body.source_platform,
        receivingType: body.receiving_type,
        priorityTier: body.priority_tier,
        orderId: body.order_id,
        lineItemId: body.line_item_id ?? null,
        sku: body.sku ?? null,
        itemName: body.item_name ?? null,
        skuCatalogId: body.sku_catalog_id ?? null,
        quantity: body.quantity,
        trackingNumber: body.tracking_number ?? null,
        carrierCode: body.carrier_code ?? null,
        seller: body.seller ?? null,
        listingUrl: body.listing_url ?? null,
        accountName: body.account_name ?? null,
        returnReason: body.return_reason ?? null,
        rmaId: body.rma_id ?? null,
      });
      if (isDeskImportSkip(outcome)) {
        failed += 1;
        results.push({
          line: i + 1,
          ok: false,
          error: `skipped: ${outcome.reason}`,
        });
        continue;
      }
      if (outcome.created) created += 1;
      else updated += 1;
      results.push({
        line: i + 1,
        ok: true,
        created: outcome.created,
        receiving_line_id: outcome.receivingLineId,
        receiving_id: outcome.receivingId,
      });

      await recordAudit(pool, ctx, request, {
        source: 'inbound-confirm-po',
        action: AUDIT_ACTION.RECEIVING_INBOUND_IMPORT,
        entityType: AUDIT_ENTITY.RECEIVING_LINE,
        entityId: outcome.receivingLineId,
        method: 'manual',
        after: {
          sourceType: outcome.sourceType,
          sourceOrderId: outcome.sourceOrderId,
          created: outcome.created,
          via: 'po-intake',
        },
      });
    } catch (err) {
      failed += 1;
      results.push({
        line: i + 1,
        ok: false,
        error: err instanceof Error ? err.message : 'import failed',
      });
    }
  }

  after(async () => {
    try {
      await invalidateReceivingViews(ctx.organizationId);
    } catch (e) {
      console.warn('[inbound/confirm-po] cache invalidation failed', e);
    }
  });

  const ok = failed === 0 && results.some((r) => r.ok);
  return NextResponse.json(
    {
      success: ok,
      created,
      updated,
      failed,
      results,
      error: ok ? undefined : 'One or more lines failed to import',
    },
    { status: ok ? (created > 0 ? 201 : 200) : 400 },
  );
}, { permission: 'receiving.view' });
