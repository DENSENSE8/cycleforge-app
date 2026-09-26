/** Incoming desk import orchestration — single Add / CSV row → ingestPurchase (+ optional RETURN tag + classify stamps). */

import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { isValidPriorityTier } from '@/lib/receiving/priority-override';
import { ingestPurchase, type IngestPurchaseResult } from './ingest-purchase';
import { tagInboundAsReturn } from './tag-inbound-return';
import { receiveImportedLineIfCartonUnboxed } from './receive-if-carton-unboxed';
import {
  assertRegisteredInboundSource,
  type InboundSourceType,
} from './source-registry';
import type {
  AmazonReturnSkipReason,
  DeskImportRow,
  DeskInboundKind,
} from './desk-csv';
import { inboundSourcePlatformForRaw } from './desk-csv';

export { deskRowFromCsvRecord } from './desk-csv';

interface DeskImportResult extends IngestPurchaseResult {
  kind: DeskInboundKind;
  sourcePlatform: string | null;
  receivingType: string | null;
  priorityTier: number | null;
}

interface DeskImportSkipResult {
  skipped: true;
  reason: AmazonReturnSkipReason;
  asin?: string | null;
  orderId?: string | null;
}

type DeskImportOutcome = DeskImportResult | DeskImportSkipResult;

export function isDeskImportSkip(
  r: DeskImportOutcome,
): r is DeskImportSkipResult {
  return 'skipped' in r && r.skipped === true;
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

/**
 * Resolve sku_catalog where sku equals ASIN (case-insensitive, org-scoped).
 * No platform_id crosswalk — locked match rule for Amazon returns import.
 */
export async function resolveCatalogByAsinSku(
  orgId: OrgId,
  asin: string,
): Promise<{ id: number; sku: string; product_title: string } | null> {
  const needle = asin.trim();
  if (!needle) return null;
  const r = await tenantQuery<{
    id: number;
    sku: string;
    product_title: string;
  }>(
    orgId,
    `SELECT id, sku, product_title
       FROM sku_catalog
      WHERE organization_id = $1::uuid
        AND lower(sku) = lower($2)
        AND is_active = true
      ORDER BY id
      LIMIT 1`,
    [orgId, needle],
  );
  return r.rows[0] ?? null;
}

/** Resolve an active catalog row by primary key (Add Return picker). */
export async function resolveCatalogById(
  orgId: OrgId,
  catalogId: number,
): Promise<{ id: number; sku: string; product_title: string } | null> {
  const id = Number(catalogId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const r = await tenantQuery<{
    id: number;
    sku: string;
    product_title: string;
  }>(
    orgId,
    `SELECT id, sku, product_title
       FROM sku_catalog
      WHERE organization_id = $1::uuid
        AND id = $2
        AND is_active = true
      LIMIT 1`,
    [orgId, id],
  );
  return r.rows[0] ?? null;
}

/** Optional deps for unit tests (catalog gate without a live DB). */
export interface ImportDeskInboundRowDeps {
  resolveCatalogByAsinSku?: typeof resolveCatalogByAsinSku;
  resolveCatalogById?: typeof resolveCatalogById;
  ingestPurchase?: typeof ingestPurchase;
  tagInboundAsReturn?: typeof tagInboundAsReturn;
  stampClassify?: typeof stampClassify;
  receiveIfCartonUnboxed?: typeof receiveImportedLineIfCartonUnboxed;
}

/**
 * Import one desk / CSV row onto the Incoming spine.
 * Amazon native return rows resolve catalog by ASIN when present; a miss still
 * ingests so Tracking ID is registered for unbox.
 */
export async function importDeskInboundRow(
  orgId: OrgId,
  row: DeskImportRow,
  deps: ImportDeskInboundRowDeps = {},
): Promise<DeskImportOutcome> {
  const resolveCatalog = deps.resolveCatalogByAsinSku ?? resolveCatalogByAsinSku;
  const resolveCatalogId = deps.resolveCatalogById ?? resolveCatalogById;
  const doIngest = deps.ingestPurchase ?? ingestPurchase;
  const doTagReturn = deps.tagInboundAsReturn ?? tagInboundAsReturn;
  const doStamp = deps.stampClassify ?? stampClassify;
  const doReceiveIfUnboxed = deps.receiveIfCartonUnboxed ?? receiveImportedLineIfCartonUnboxed;

  if (row.skipReason) {
    return {
      skipped: true,
      reason: row.skipReason,
      asin: row.sku ?? null,
      orderId: row.orderId || null,
    };
  }

  const sourceType = String(row.sourceType || 'manual').trim().toLowerCase();
  assertRegisteredInboundSource(sourceType);
  // Zoho POs come from sync — desk Add does not invent Zoho-primary rows.
  if (sourceType === 'zoho') {
    throw new Error('inbound: use Import → Zoho to pull purchase orders; cannot manually add zoho source');
  }

  const orderId = String(row.orderId || '').trim();
  if (!orderId) throw new Error('inbound: order_id is required');

  let sku = row.sku?.trim() || null;
  let itemName = row.itemName?.trim() || null;
  let skuCatalogId: number | null = null;

  if (row.skuCatalogId != null && Number.isFinite(Number(row.skuCatalogId))) {
    const picked = await resolveCatalogId(orgId, Number(row.skuCatalogId));
    if (!picked) {
      throw new Error('inbound: sku_catalog_id is not an active catalog row');
    }
    skuCatalogId = picked.id;
    sku = picked.sku;
    if (!itemName) itemName = picked.product_title?.trim() || null;
  }

  // Native Amazon returns: catalog by Merchant SKU, then ASIN.
  if (row.amazonNativeReturn && row.kind === 'return' && sourceType === 'amazon') {
    const asin = row.amazonAsin?.trim() || null;
    const needles = [sku, asin].filter((v, i, a): v is string => Boolean(v) && a.indexOf(v) === i);
    for (const needle of needles) {
      const catalog = await resolveCatalog(orgId, needle);
      if (catalog) {
        skuCatalogId = catalog.id;
        sku = catalog.sku;
        if (!itemName) itemName = catalog.product_title?.trim() || null;
        break;
      }
    }
  } else if (!skuCatalogId && sku && row.kind !== 'return') {
    const catalog = await resolveCatalog(orgId, sku);
    if (catalog) {
      skuCatalogId = catalog.id;
      sku = catalog.sku;
      if (!itemName) itemName = catalog.product_title?.trim() || null;
    }
  }

  if (!sku && !itemName) {
    if (row.amazonNativeReturn && row.trackingNumber?.trim()) {
      itemName = `Amazon return ${orderId}`;
    } else {
      throw new Error('inbound: must provide at least one of: sku, item_name');
    }
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

  const result = await doIngest(orgId, {
    sourceType: sourceType as InboundSourceType,
    sourceOrderId: orderId,
    sourceLineItemId: row.lineItemId?.trim() || null,
    accountLabel: row.accountName?.trim() || null,
    sku,
    itemName,
    quantityExpected: row.quantity ?? 1,
    conditionGrade: row.conditionGrade ?? undefined,
    skuCatalogId,
    sellerUsername: seller,
    listingUrl: row.listingUrl?.trim() || null,
    orderNumber: orderId,
    vendorOrSellerName: seller,
    trackingNumber: row.trackingNumber?.trim() || null,
    carrierCode: row.carrierCode?.trim() || null,
    rawPayload: row.rawPayload ?? null,
  });

  if (kind === 'return') {
    await doTagReturn(orgId, {
      receivingLineId: result.receivingLineId,
      sourceType,
      sourceOrderId: orderId,
      returnReason: row.returnReason?.trim() || null,
      rmaRef: row.rmaId?.trim() || null,
    });
  }

  const stamped = await doStamp(orgId, result.receivingLineId, {
    sourcePlatform,
    receivingType: kind === 'return' ? null : receivingType,
    priorityTier,
  });

  if (kind === 'return') {
    await doReceiveIfUnboxed(orgId, result.receivingLineId);
  }

  return {
    ...result,
    kind,
    sourcePlatform: stamped.sourcePlatform,
    receivingType: kind === 'return' ? 'RETURN' : stamped.receivingType,
    priorityTier: stamped.priorityTier,
  };
}
