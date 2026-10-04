/** ingest-purchase — the line-level UPSERT under `ingestInboundOrder` (its only caller): one purchase line onto the Incoming spine on the order's transaction. Order sources (form, CSV, chat, eBay sync) build an `InboundOrderDraft` and call `ingestInboundOrder`, never this. */

import { withTenantTransaction, tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { assertRegisteredInboundSource, INBOUND_SOURCE_FACT_KIND, type InboundSourceType } from './source-registry';
import { upsertPurchaseLink, type TxClient } from './purchase-links';
import { upsertInboundMirror } from './mirror';
import { upsertReceivingLineTesting } from '@/lib/receiving/facts/narrow';
import { registerShipmentPermissive } from '@/lib/shipping/sync-shipment';
import { linkShipment } from '@/lib/shipping/shipment-links';
import { ensureReceivingForInboundOrder, ensureReceivingForPo } from '@/lib/receiving/attach-box';

/** condition_grade_enum values (mirror of the DB enum). */
const CONDITION_GRADES = ['BRAND_NEW', 'LIKE_NEW', 'REFURBISHED', 'USED_A', 'USED_B', 'USED_C', 'PARTS'] as const;
type ConditionGrade = (typeof CONDITION_GRADES)[number];

function normalizeConditionGrade(raw: unknown, fallback: ConditionGrade = 'BRAND_NEW'): ConditionGrade {
  if (raw == null) return fallback;
  const upper = String(raw).trim().toUpperCase().replace(/[\s-]/g, '_');
  return (CONDITION_GRADES as readonly string[]).includes(upper) ? (upper as ConditionGrade) : fallback;
}

interface IngestPurchaseInput {
  /** Registered inbound source; defaults to 'ebay'. */
  sourceType?: string;
  /** External order id / PO# (eBay order id). Required. */
  sourceOrderId: string;
  sourceLineItemId?: string | null;
  /** The buyer/storefront account LABEL → resolves platform_accounts.integration_scope. */
  accountLabel?: string | null;

  // Spine item facts
  sku?: string | null;
  itemName?: string | null;
  quantityExpected?: number;
  conditionGrade?: string;
  /**
   * Optional resolved sku_catalog.id — stamped on INSERT and on existing-row
   * UPSERT when the caller already resolved the catalog (Amazon returns ASIN gate).
   */
  skuCatalogId?: number | null;

  // Marketplace payload (→ receiving_line_facts, e.g. ebay_purchase)
  legacyOrderId?: string | null;
  sellerUsername?: string | null;
  purchaseOrderStatus?: string | null;
  paymentStatus?: string | null;
  listingUrl?: string | null;
  rawStatus?: string | null;

  /**
   * Internal order identity (`inbound_order.id` + the line's key within it).
   * When set, the spine row is found and born by (org, inbound_order_id,
   * line_key) — the platform-aware identity — instead of the source link.
   */
  inboundOrderId?: number | null;
  lineKey?: string | null;
  /** Line-level classifier; defaults to PO. */
  receivingType?: string | null;
  unitCostCents?: number | null;
  currency?: string | null;
  /**
   * The operator's own re-save of an internal order (form · CSV · chat): a
   * provided SKU / title / catalog item / listing replaces the line's, so a
   * corrected re-submit fixes a wrong one. Marketplace re-syncs leave it unset
   * and only fill blanks, so they never clobber an operator correction.
   */
  operatorResave?: boolean;
  /**
   * The tracking number's shipment, registered by the caller BEFORE its
   * transaction. Registration runs on its own connection, so a multi-line
   * order that re-registered per line would wait on its own transaction's
   * lock on the same shipment row (a cross-connection deadlock).
   */
  shipmentId?: number | null;

  // Reconcile mirror snapshot (→ inbound_purchase_order_mirror)
  orderNumber?: string | null;
  vendorOrSellerName?: string | null;
  status?: string | null;
  trackingNumber?: string | null;
  carrierCode?: string | null;
  poDate?: string | null;
  expectedDeliveryDate?: string | null;
  /** The whole purchase's lines (a chat-imported PO's items with cost) → mirror `line_items`. */
  lineItems?: unknown[];
  rawPayload?: unknown;
}

export interface IngestPurchaseResult {
  receivingLineId: number;
  /** Carton id after tracking attach; null when no tracking or pre-carton line. */
  receivingId: number | null;
  created: boolean;
  platformAccountId: number | null;
  sourceType: string;
  sourceOrderId: string;
}

export interface IngestPurchaseDeps {
  withTx: <T>(orgId: OrgId, fn: (client: TxClient) => Promise<T>) => Promise<T>;
  upsertPurchaseLink: typeof upsertPurchaseLink;
  upsertInboundMirror: typeof upsertInboundMirror;
  upsertReceivingLineTesting: typeof upsertReceivingLineTesting;
}

const defaultDeps: IngestPurchaseDeps = {
  withTx: (orgId, fn) => withTenantTransaction(orgId, (client) => fn(client as unknown as TxClient)),
  upsertPurchaseLink,
  upsertInboundMirror,
  upsertReceivingLineTesting,
};

/** Only the keys with a real value — keeps the facts payload tight. */
function buildFactsPayload(input: IngestPurchaseInput): Record<string, unknown> {
  const entries: Array<[string, unknown]> = [
    ['legacyOrderId', input.legacyOrderId],
    ['sellerUsername', input.sellerUsername],
    ['purchaseOrderStatus', input.purchaseOrderStatus],
    ['paymentStatus', input.paymentStatus],
    ['listingUrl', input.listingUrl],
    ['rawStatus', input.rawStatus],
  ];
  const payload: Record<string, unknown> = {};
  for (const [k, v] of entries) if (v != null && v !== '') payload[k] = v;
  return payload;
}

/**
 * Upsert one purchase into the Incoming spine. Returns the (created or reused)
 * receiving_line id plus the resolved buyer account. Throws when the source is
 * unregistered or sourceOrderId is blank.
 */
export async function ingestPurchase(
  orgId: OrgId,
  input: IngestPurchaseInput,
  deps: IngestPurchaseDeps = defaultDeps,
): Promise<IngestPurchaseResult> {
  const sourceType = (input.sourceType ?? 'ebay').trim().toLowerCase();
  assertRegisteredInboundSource(sourceType);

  const sourceOrderId = String(input.sourceOrderId ?? '').trim();
  if (!sourceOrderId) throw new Error('inbound: sourceOrderId is required');

  const sourceLineItemId = input.sourceLineItemId?.trim() || null;
  const quantityExpected = Math.max(1, Math.floor(Number(input.quantityExpected ?? 1)) || 1);
  const conditionGrade = normalizeConditionGrade(input.conditionGrade);
  const factKind = INBOUND_SOURCE_FACT_KIND[sourceType as InboundSourceType];
  const factsPayload = buildFactsPayload(input);

  return deps.withTx(orgId, async (client) => {
    // Serialize concurrent imports of the SAME external order so a first-time
    // order can't race two INSERTs into two spine rows. Transaction-scoped.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `inbound:${orgId}:${sourceType}:${sourceOrderId}:${sourceLineItemId ?? ''}`,
    ]);

    // Resolve the buyer/storefront account id from its label (platform slug === source).
    let platformAccountId: number | null = null;
    if (input.accountLabel?.trim()) {
      const acct = await client.query<{ id: number }>(
        `SELECT pa.id
           FROM platform_accounts pa
           JOIN platforms p
             ON p.id = pa.platform_id AND p.organization_id = pa.organization_id
          WHERE pa.organization_id = $1 AND p.slug = $2 AND pa.integration_scope = $3
          LIMIT 1`,
        [orgId, sourceType, input.accountLabel.trim()],
      );
      platformAccountId = acct.rows[0]?.id ?? null;
    }

    // Reconcile mirror snapshot (idempotent on org+source+order).
    await deps.upsertInboundMirror(
      orgId,
      {
        sourceType,
        sourceOrderId,
        platformAccountId,
        orderNumber: input.orderNumber ?? null,
        vendorOrSellerName: input.vendorOrSellerName ?? input.sellerUsername ?? null,
        status: input.status ?? input.purchaseOrderStatus ?? null,
        paymentStatus: input.paymentStatus ?? null,
        poDate: input.poDate ?? null,
        expectedDeliveryDate: input.expectedDeliveryDate ?? null,
        trackingNumber: input.trackingNumber ?? null,
        carrierCode: input.carrierCode ?? null,
        lineItems: input.lineItems,
        rawPayload: input.rawPayload ?? null,
      },
      { query: (async (_o: OrgId, sql: string, params?: ReadonlyArray<unknown>) => client.query(sql, params)) as never },
    );

    // Find the existing spine row for this identity (idempotent re-import).
    // An internal order identity wins; the source link is the legacy key.
    const inboundOrderId = input.inboundOrderId ?? null;
    const lineKey = input.lineKey?.trim() || null;
    if (inboundOrderId != null && !lineKey) throw new Error('inbound: lineKey is required with inboundOrderId');
    const existing = inboundOrderId != null
      ? await client.query<{ receiving_line_id: number }>(
          `SELECT id AS receiving_line_id
             FROM receiving_line
            WHERE organization_id = $1 AND inbound_order_id = $2 AND line_key = $3
            LIMIT 1`,
          [orgId, inboundOrderId, lineKey],
        )
      : await client.query<{ receiving_line_id: number }>(
          `SELECT receiving_line_id
             FROM inbound_purchase_order_links
            WHERE organization_id = $1 AND source_type = $2 AND source_order_id = $3
              AND COALESCE(source_line_item_id, '') = COALESCE($4, '')
            ORDER BY receiving_line_id
            LIMIT 1`,
          [orgId, sourceType, sourceOrderId, sourceLineItemId],
        );

    let receivingLineId = existing.rows[0]?.receiving_line_id ?? null;
    const created = receivingLineId == null;
    const receivingType = input.receivingType?.trim().toUpperCase() || 'PO';
    const unitCostCents =
      input.unitCostCents != null && Number.isFinite(Number(input.unitCostCents)) && Number(input.unitCostCents) >= 0
        ? Math.round(Number(input.unitCostCents))
        : null;
    const currency = input.currency?.trim().toUpperCase() || null;

    const skuCatalogId =
      input.skuCatalogId != null && Number.isFinite(Number(input.skuCatalogId))
        ? Number(input.skuCatalogId)
        : null;
    const listingUrl = input.listingUrl?.trim() || null;

    if (receivingLineId == null) {
      // Create the pre-physical EXPECTED spine row (receiving_id NULL — no carton scanned yet, same shape as a Zoho PO pre-staging line).
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO receiving_line (
           receiving_id, sku, item_name, sku_catalog_id, listing_url,
           quantity_expected, quantity_received, workflow_status,
           receiving_type, source_system, source_order_id, source_line_item_id,
           inbound_source_type, platform_account_id, organization_id,
           inbound_order_id, line_key, unit_cost_cents, currency,
           manual_entry_at, created_at, updated_at
         ) VALUES (
           NULL, $1, $2, $9, $10,
           $3, 0, 'EXPECTED'::inbound_workflow_status_enum,
           $11, $4, $5, $6,
           $4, $7, $8::uuid,
           $12, $13, $14, $15,
           NOW(), NOW(), NOW()
         )
         RETURNING id`,
        [
          input.sku?.trim() || null,
          input.itemName?.trim() || null,
          quantityExpected,
          sourceType,
          sourceOrderId,
          sourceLineItemId,
          platformAccountId,
          orgId,
          skuCatalogId,
          listingUrl,
          receivingType,
          inboundOrderId,
          lineKey,
          unitCostCents,
          currency,
        ],
      );
      receivingLineId = inserted.rows[0].id;

      // BIRTH INVARIANT:
      await deps.upsertReceivingLineTesting(
        orgId,
        receivingLineId,
        {
          needsTest: false,
          qaStatus: 'PENDING',
          dispositionCode: 'HOLD',
          conditionGrade,
          dispositionAudit: [],
        },
        { query: ((_o: OrgId, sql: string, p?: unknown[]) => client.query(sql, p)) as typeof tenantQuery },
      );
    } else if (skuCatalogId != null || listingUrl) {
      // Re-import: stamp catalog id / listing when still null (Amazon ASIN gate).
      await client.query(
        `UPDATE receiving_line
            SET sku_catalog_id = COALESCE(sku_catalog_id, $2),
                listing_url = COALESCE(NULLIF(TRIM(listing_url), ''), $3),
                sku = COALESCE(NULLIF(TRIM(sku), ''), $4),
                item_name = COALESCE(NULLIF(TRIM(item_name), ''), $5),
                quantity_expected = GREATEST(quantity_expected, $6),
                updated_at = NOW()
          WHERE id = $1 AND organization_id = $7::uuid`,
        [
          receivingLineId,
          skuCatalogId,
          listingUrl,
          input.sku?.trim() || null,
          input.itemName?.trim() || null,
          quantityExpected,
          orgId,
        ],
      );
    }

    if (!created && inboundOrderId != null) {
      // An internal-order re-save is the operator's current truth for the line.
      await client.query(
        `UPDATE receiving_line
            SET inbound_order_id = $2,
                line_key = $3,
                quantity_expected = $4,
                unit_cost_cents = COALESCE($5, unit_cost_cents),
                currency = COALESCE($6, currency),
                receiving_type = $7,
                updated_at = NOW()
          WHERE id = $1 AND organization_id = $8::uuid`,
        [receivingLineId, inboundOrderId, lineKey, quantityExpected, unitCostCents, currency, receivingType, orgId],
      );
      if (input.operatorResave) {
        await client.query(
          `UPDATE receiving_line
              SET sku = COALESCE($2, sku),
                  item_name = COALESCE($3, item_name),
                  sku_catalog_id = COALESCE($4, sku_catalog_id),
                  listing_url = COALESCE($5, listing_url),
                  updated_at = NOW()
            WHERE id = $1 AND organization_id = $6::uuid`,
          [receivingLineId, input.sku?.trim() || null, input.itemName?.trim() || null, skuCatalogId, listingUrl, orgId],
        );
      }
    }

    // Primary purchase-identity link + spine-cache dual-write + marketplace facts,
    // all on this same transaction client.
    await deps.upsertPurchaseLink(
      orgId,
      {
        receivingLineId,
        sourceType,
        sourceOrderId,
        sourceLineItemId,
        isPrimary: true,
        platformAccountId,
        ...(factKind && Object.keys(factsPayload).length > 0
          ? { facts: { kind: factKind, payload: factsPayload } }
          : {}),
      },
      { withTx: (_o, fn) => fn(client) },
    );

    // When tracking is present on a marketplace / manual purchase: register STN
    // → ensure inbound carton (or merged Zoho) → link STN → stamp
    // receiving_line.receiving_id if still null.
    const tracking = input.trackingNumber?.trim() || null;
    const trackingSources: ReadonlyArray<InboundSourceType> = ['ebay', 'amazon', 'manual'];
    if (tracking && trackingSources.includes(sourceType as InboundSourceType)) {
      const shipmentSource =
        sourceType === 'ebay'
          ? 'ebay_purchase'
          : sourceType === 'amazon'
            ? 'amazon_purchase'
            : 'manual_inbound';
      const shipment = input.shipmentId != null
        ? { id: input.shipmentId }
        : await registerShipmentPermissive({ trackingNumber: tracking, sourceSystem: shipmentSource }, orgId);
      if (shipment?.id) {
        const shipmentId = Number(shipment.id);
        const lineMeta = await client.query<{
          receiving_id: number | null;
          zoho_purchaseorder_id: string | null;
          zoho_purchaseorder_number: string | null;
        }>(
          `SELECT rl.receiving_id, rz.zoho_purchaseorder_id, rz.zoho_purchaseorder_number
             FROM receiving_line rl
             LEFT JOIN receiving_line_zoho rz
               ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
            WHERE rl.id = $1 AND rl.organization_id = $2::uuid
            LIMIT 1`,
          [receivingLineId, orgId],
        );
        const meta = lineMeta.rows[0];

        const stnCarton = await client.query<{ id: number }>(
          `SELECT id
             FROM receiving_carton
            WHERE organization_id = $1::uuid
              AND shipment_id = $2
            ORDER BY id
            LIMIT 1`,
          [orgId, shipmentId],
        );
        const stnLink = stnCarton.rows[0]
          ? null
          : await client.query<{ owner_id: number }>(
              `SELECT owner_id
                 FROM shipment_links
                WHERE organization_id = $1::uuid
                  AND owner_type = 'RECEIVING'
                  AND shipment_id = $2
                ORDER BY is_primary DESC, id
                LIMIT 1`,
              [orgId, shipmentId],
            );
        const existingStnCartonId =
          stnCarton.rows[0]?.id != null
            ? Number(stnCarton.rows[0].id)
            : stnLink?.rows[0]?.owner_id != null
              ? Number(stnLink.rows[0].owner_id)
              : null;

        let cartonId: number;
        if (meta?.receiving_id != null) {
          cartonId = Number(meta.receiving_id);
          await client.query(
            `UPDATE receiving_carton
                SET shipment_id = COALESCE(shipment_id, $2),
                    updated_at  = NOW()
              WHERE id = $1 AND organization_id = $3::uuid`,
            [cartonId, shipmentId, orgId],
          );
        } else if (existingStnCartonId != null) {
          // Already-scanned / existing STN carton — attach the imported line
          // instead of minting a second amazon inbound carton.
          cartonId = existingStnCartonId;
          await client.query(
            `UPDATE receiving_carton
                SET shipment_id = COALESCE(shipment_id, $2),
                    updated_at  = NOW()
              WHERE id = $1 AND organization_id = $3::uuid`,
            [cartonId, shipmentId, orgId],
          );
        } else if (meta?.zoho_purchaseorder_id) {
          // Merged marketplace→Zoho line: anchor on the Zoho PO carton.
          cartonId = await ensureReceivingForPo({
            poId: meta.zoho_purchaseorder_id,
            poNumber: meta.zoho_purchaseorder_number,
            organizationId: orgId,
          });
          await client.query(
            `UPDATE receiving_carton
                SET shipment_id = COALESCE(shipment_id, $2),
                    updated_at  = NOW()
              WHERE id = $1 AND organization_id = $3::uuid`,
            [cartonId, shipmentId, orgId],
          );
        } else {
          cartonId = await ensureReceivingForInboundOrder({
            sourceType: sourceType as 'ebay' | 'amazon' | 'manual',
            sourceOrderId,
            shipmentId,
            organizationId: orgId,
            inboundOrderId,
            db: client as unknown as Parameters<typeof ensureReceivingForInboundOrder>[0]['db'],
          });
        }

        await linkShipment(
          orgId,
          {
            ownerType: 'RECEIVING',
            ownerId: cartonId,
            shipmentId,
            direction: 'INBOUND',
            isPrimary: true,
            role: 'PO_ANCHOR',
            source: shipmentSource,
          },
          // Inverse of the withTx boundary cast above: TxClient is the same
          // tenant-transaction client, just narrowed differently than
          // linkShipment's Pick<PoolClient, 'query'>.
          client as unknown as Parameters<typeof linkShipment>[2],
        );

        await client.query(
          `UPDATE receiving_line
              SET receiving_id = $2,
                  updated_at   = NOW()
            WHERE id = $1
              AND organization_id = $3::uuid
              AND receiving_id IS NULL`,
          [receivingLineId, cartonId, orgId],
        );
      }
    }

    const lineCarton = await client.query<{ receiving_id: number | null }>(
      `SELECT receiving_id
         FROM receiving_line
        WHERE id = $1 AND organization_id = $2::uuid
        LIMIT 1`,
      [receivingLineId, orgId],
    );
    const receivingId = lineCarton.rows[0]?.receiving_id ?? null;

    return {
      receivingLineId,
      receivingId: receivingId != null ? Number(receivingId) : null,
      created,
      platformAccountId,
      sourceType,
      sourceOrderId,
    };
  });
}
