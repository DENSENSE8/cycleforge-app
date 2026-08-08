/**
 * Incoming desk import orchestration — single Add / CSV row → ingestPurchase
 * (+ optional RETURN tag + classify stamps). Shared by import-purchase and
 * import-csv routes.
 */

import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { isValidPriorityTier } from '@/lib/receiving/priority-override';
import { ingestPurchase, type IngestPurchaseResult } from './ingest-purchase';
import { tagInboundAsReturn } from './tag-inbound-return';
import {
  assertRegisteredInboundSource,
  type InboundSourceType,
} from './source-registry';
import type { DeskImportRow, DeskInboundKind } from './desk-csv';
import { inboundSourcePlatformForRaw } from './desk-csv';

export { deskRowFromCsvRecord } from './desk-csv';

interface DeskImportResult extends IngestPurchaseResult {
  kind: DeskInboundKind;
  sourcePlatform: string | null;
  receivingType: string | null;
  priorityTier: number | null;
}

async function stampClassify(
  orgId: OrgId,
  receivingLineId: number,
  args: {
    sourcePlatform?: string | null;
    receivingType?: string | null;
    priorityTier?: number | null;
  },
): Promise<{
  sourcePlatform: string | null;
  receivingType: string | null;
  priorityTier: number | null;
}> {
  const sourcePlatform = args.sourcePlatform?.trim()
    ? inboundSourcePlatformForRaw(args.sourcePlatform)
    : null;
  const receivingType = args.receivingType?.trim()
    ? args.receivingType.trim().toUpperCase()
    : null;
  const priorityTier =
    args.priorityTier != null && isValidPriorityTier(args.priorityTier)
      ? args.priorityTier
      : null;

  // receiving_type is line-level (ingest stamps it on the spine row).
  if (receivingType) {
    await tenantQuery(
      orgId,
      `UPDATE receiving_line
          SET receiving_type = COALESCE($1, receiving_type),
              updated_at = NOW()
        WHERE id = $2
          AND organization_id = $3::uuid`,
      [receivingType, receivingLineId, orgId],
    );
  }

  // source_platform + priority_tier are CARTON-level (build-sql paints from
  // receiving_carton.source_platform). No-op until tracking links a carton —
  // the documented pre-carton gap, not an error.
  if (sourcePlatform || priorityTier != null) {
    await tenantQuery(
      orgId,
      `UPDATE receiving_carton rc
          SET source_platform = COALESCE($1, rc.source_platform),
              priority_tier = COALESCE($2, rc.priority_tier),
              updated_at = NOW()
         FROM receiving_line rl
        WHERE rl.id = $3
          AND rl.organization_id = $4::uuid
          AND rc.id = rl.receiving_id
          AND rc.organization_id = $4::uuid`,
      [sourcePlatform, priorityTier, receivingLineId, orgId],
    );
  }

  return { sourcePlatform, receivingType, priorityTier };
}

export async function importDeskInboundRow(
  orgId: OrgId,
  row: DeskImportRow,
): Promise<DeskImportResult> {
  const sourceType = String(row.sourceType || 'manual').trim().toLowerCase();
  assertRegisteredInboundSource(sourceType);
  // Zoho POs come from sync — desk Add does not invent Zoho-primary rows.
  if (sourceType === 'zoho') {
    throw new Error('inbound: use Import → Zoho to pull purchase orders; cannot manually add zoho source');
  }

  const orderId = String(row.orderId || '').trim();
  if (!orderId) throw new Error('inbound: order_id is required');

  const sku = row.sku?.trim() || null;
  const itemName = row.itemName?.trim() || null;
  if (!sku && !itemName) {
    throw new Error('inbound: must provide at least one of: sku, item_name');
  }

  const receivingType = row.receivingType?.trim()
    ? row.receivingType.trim().toUpperCase()
    : row.kind === 'return'
      ? 'RETURN'
      : 'PO';
  const kind: DeskInboundKind = receivingType === 'RETURN' ? 'return' : 'purchase';
  const sourcePlatform =
    row.sourcePlatform?.trim()
      ? inboundSourcePlatformForRaw(row.sourcePlatform)
      : null;
  const seller =
    row.seller?.trim()
    || (sourcePlatform === 'goodwill' ? 'Goodwill' : null);
  const priorityTier =
    row.priorityTier != null && isValidPriorityTier(row.priorityTier)
      ? row.priorityTier
      : null;

  const result = await ingestPurchase(orgId, {
    sourceType: sourceType as InboundSourceType,
    sourceOrderId: orderId,
    sourceLineItemId: row.lineItemId?.trim() || null,
    accountLabel: row.accountName?.trim() || null,
    sku,
    itemName,
    quantityExpected: row.quantity ?? 1,
    conditionGrade: row.conditionGrade ?? undefined,
    sellerUsername: seller,
    listingUrl: row.listingUrl?.trim() || null,
    orderNumber: orderId,
    vendorOrSellerName: seller,
    trackingNumber: row.trackingNumber?.trim() || null,
    carrierCode: row.carrierCode?.trim() || null,
  });

  if (kind === 'return') {
    await tagInboundAsReturn(orgId, {
      receivingLineId: result.receivingLineId,
      sourceType,
      sourceOrderId: orderId,
      returnReason: row.returnReason?.trim() || null,
      rmaRef: row.rmaId?.trim() || null,
    });
  }

  const stamped = await stampClassify(orgId, result.receivingLineId, {
    sourcePlatform,
    receivingType: kind === 'return' ? null : receivingType,
    priorityTier,
  });

  return {
    ...result,
    kind,
    sourcePlatform: stamped.sourcePlatform,
    receivingType: kind === 'return' ? 'RETURN' : stamped.receivingType,
    priorityTier: stamped.priorityTier,
  };
}
