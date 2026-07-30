import { NextRequest, NextResponse, after } from 'next/server';
import pool from '@/lib/db';
import { tenantQuery } from '@/lib/tenancy/db';
import { recomputeEnrichmentForOrders } from '@/lib/neon/packer-log-enrichment';
import { invalidateAllOrdersApiCaches } from '@/lib/orders/invalidation';
import { publishOrderChanged } from '@/lib/realtime/publish';
import { resolveOrCreateSkuCatalogId } from '@/lib/neon/sku-catalog-queries';
import { resolveShipmentId } from '@/lib/shipping/resolve';
import { CONDITION_GRADES } from '@/lib/conditions';
import { withAuth } from '@/lib/auth/withAuth';
import { wouldExceedPlanCeiling, planLimitResponseBody } from '@/lib/billing/plan-ceilings';
import { readIdempotencyKey, withIdempotencyClaim } from '@/lib/api-idempotency';

/**
 * POST /api/orders/add - Add a new order to the system
 * Used by mobile verification screen to add missing orders.
 *
 * Idempotency: clients mint a per-submit UUID and send it as `Idempotency-Key`
 * (and/or body `idempotencyKey` / `clientEventId`). Same key → replay cached
 * status+body (no second INSERT). Natural 409-on-duplicate-order-id still
 * applies for *different* client events that collide on order_id.
 */
const IDEMPOTENCY_ROUTE = 'orders.add';

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const idempotencyKey = readIdempotencyKey(
    req,
    body.idempotencyKey ?? body.clientEventId ?? body.client_event_id ?? null,
  );

  try {
    const out = await withIdempotencyClaim<Record<string, unknown>>(pool, {
      orgId: ctx.organizationId,
      idempotencyKey,
      route: IDEMPOTENCY_ROUTE,
      staffId: ctx.staffId ?? null,
    }, async () => {
      const {
        orderId,
        productTitle,
        sku,
        accountSource,
        status = 'unassigned',
        saleAmount,
        currency,
        // The intake form marks BOTH of these required and has always sent them;
        // until 2026-07-28 this handler destructured neither, so the operator's
        // tracking number and condition grade were accepted and silently dropped
        // (order landed with shipment_id NULL → unscannable at every station).
        shippingTrackingNumber,
        condition,
      } = body;

      // Validate required fields
      if (!orderId || !productTitle || !accountSource) {
        return {
          status: 400,
          body: { error: 'Missing required fields: orderId, productTitle, accountSource' },
        };
      }

      // Condition is optional here (webhook/cron ingestion often has none), but a
      // supplied value must be a canonical grade from the SoT — never free text,
      // which is how `orders.condition` accumulated 'good' / 'Very Good' / ''.
      const conditionRaw = typeof condition === 'string' ? condition.trim().toUpperCase() : '';
      if (conditionRaw && !(CONDITION_GRADES as readonly string[]).includes(conditionRaw)) {
        return {
          status: 400,
          body: { error: `condition must be one of: ${CONDITION_GRADES.join(', ')}` },
        };
      }
      const conditionValue = conditionRaw || null;

      // sale_amount is optional; when supplied it must be a finite number.
      if (saleAmount != null && !Number.isFinite(Number(saleAmount))) {
        return {
          status: 400,
          body: { error: 'saleAmount must be a finite number when provided' },
        };
      }
      const saleAmountValue = saleAmount != null ? Number(saleAmount) : null;
      const currencyValue = (typeof currency === 'string' && currency.trim()) || 'USD';

      const orgId = ctx.organizationId;

      // Soft plan ceiling: manual order creation checks maxMonthlyOrders.
      // Dormant until PLAN_FEATURE_ENFORCED; dogfood org exempt; fail-open
      // (see plan-ceilings.ts). High-volume webhook/cron ingestion is NOT gated.
      if (await wouldExceedPlanCeiling(orgId, 'maxMonthlyOrders')) {
        return { status: 403, body: planLimitResponseBody('maxMonthlyOrders') };
      }

      // Check if order already exists with this order_id
      const existingOrder = await tenantQuery(
        orgId,
        `SELECT id, order_id FROM orders WHERE order_id = $1 LIMIT 1`,
        [orderId]
      );

      if (existingOrder.rows.length > 0) {
        return {
          status: 409,
          body: {
            error: 'Order with this order ID already exists',
            existingOrderId: existingOrder.rows[0].order_id,
          },
        };
      }

      // Resolve or create sku_catalog entry
      const skuCatalogId = await resolveOrCreateSkuCatalogId({
        sku,
        productTitle,
        accountSource,
        orderId,
      }, ctx.organizationId);

      // Link the tracking number to a shipment BEFORE the insert, so a resolver
      // failure aborts cleanly instead of leaving a half-created order that can
      // never be scanned. `shipment_id` stays NULL when no tracking is supplied —
      // that is the modeled "awaiting label" state (see the `awaitingOnly` scope
      // in /api/orders), not an error.
      const trackingRaw =
        typeof shippingTrackingNumber === 'string' ? shippingTrackingNumber.trim() : '';
      let shipmentId: number | null = null;
      if (trackingRaw) {
        try {
          const resolved = await resolveShipmentId(trackingRaw, orgId);
          shipmentId = resolved.shipmentId;
        } catch (err) {
          console.error('[orders/add] shipment resolution failed', err);
          return {
            status: 502,
            body: {
              error:
                'Could not link that tracking number. The order was not created — check the tracking number and try again.',
            },
          };
        }
      }

      const result = await tenantQuery(
        orgId,
        `INSERT INTO orders (
          order_id,
          product_title,
          sku,
          account_source,
          status,
          created_at,
          sku_catalog_id,
          sale_amount,
          currency,
          organization_id,
          shipment_id,
          condition
        ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9::uuid, $10, $11)
        RETURNING id, order_id, product_title, sku, shipment_id, condition`,
        [
          orderId,
          productTitle,
          sku || null,
          accountSource,
          status,
          skuCatalogId,
          saleAmountValue,
          currencyValue,
          ctx.organizationId,
          shipmentId,
          conditionValue,
        ]
      );

      await invalidateAllOrdersApiCaches(['shipped'], ctx.organizationId);
      await publishOrderChanged({ organizationId: ctx.organizationId, orderIds: [result.rows[0].id], source: 'orders.add' });
      // A new order can newly match an already-packed scan by tracking — refresh
      // the shipped-table read model for any affected PACK scans (best-effort).
      after(() =>
        recomputeEnrichmentForOrders(pool, [result.rows[0].id]).catch((e) =>
          console.warn('[orders/add] enrichment recompute failed', e),
        ),
      );
      return {
        status: 200,
        body: {
          success: true,
          message: 'Order added successfully',
          order: result.rows[0],
        },
      };
    });

    return NextResponse.json(out.body, { status: out.status });
  } catch (error: any) {
    console.error('Error in POST /api/orders/add:', error);
    return NextResponse.json(
      { error: 'Failed to add order', details: error.message },
      { status: 500 }
    );
  }
}, { permission: 'orders.create' });
