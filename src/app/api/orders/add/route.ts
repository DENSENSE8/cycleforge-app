import { NextRequest, NextResponse, after } from 'next/server';
import pool from '@/lib/db';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import { recomputeEnrichmentForOrders } from '@/lib/neon/packer-log-enrichment';
import { invalidateOrderViews } from '@/lib/orders/invalidation';
import { upsertOrderUnshippedMembership } from '@/lib/orders/feed-membership-projection';
import { resolveOrCreateSkuCatalogId } from '@/lib/neon/sku-catalog-queries';
import { WORK_ASSIGNMENTS_ACTIVE_ON_CONFLICT } from '@/lib/neon/work-assignments-conflict';
import { registerShipmentPermissive } from '@/lib/shipping/sync-shipment';
import { linkShipment } from '@/lib/shipping/shipment-links';
import { parseTrackingPaste } from '@/lib/receiving/tracking-paste';
import { CONDITION_GRADES } from '@/lib/conditions';
import { withAuth } from '@/lib/auth/withAuth';
import { wouldExceedPlanCeiling, planLimitResponseBody } from '@/lib/billing/plan-ceilings';
import { readIdempotencyKey, withIdempotencyClaim } from '@/lib/api-idempotency';
import { getOrgTypes } from '@/lib/catalog/org-catalog';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';

/** POST /api/orders/add - Add a new order to the system Used by mobile verification screen to add missing orders. */
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
      // The intake form marks BOTH of these required and has always sent them; until 2026-07-28 this handler destructured neither, so the…
      shippingTrackingNumber,
      shippingTrackingNumbers,
      condition,
      typeSlug,
      isUrgent,
      quantity,
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

    // Quantity is optional (webhook/cron ingest rarely sends one); when
    // supplied it must be a whole number ≥ 1. `orders.quantity` is text-ish,
    // so it is normalized and stored as its canonical integer string.
    let quantityValue: string | null = null;
    if (quantity != null && String(quantity).trim() !== '') {
      const parsed = Number(String(quantity).trim());
      if (!Number.isInteger(parsed) || parsed < 1) {
        return {
          status: 400,
          body: { error: 'quantity must be a whole number of at least 1 when provided' },
        };
      }
      quantityValue = String(parsed);
    }

    const orgId = ctx.organizationId;

    const typeSlugRaw = typeof typeSlug === 'string' ? typeSlug.trim().toUpperCase() : '';
    let typeId: number | null = null;
    if (typeSlugRaw) {
      const types = await getOrgTypes(orgId);
      typeId = types.find((t) => t.slug.toUpperCase() === typeSlugRaw)?.id ?? null;
    }
    const isUrgentValue = Boolean(isUrgent);

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

    // Link tracking numbers to shipments BEFORE the insert, so a resolver failure aborts cleanly instead of leaving a half-created order that…
    const trackingBlobs: string[] = [];
    if (Array.isArray(shippingTrackingNumbers)) {
      for (const item of shippingTrackingNumbers) {
        if (typeof item === 'string' && item.trim()) trackingBlobs.push(item);
      }
    }
    if (typeof shippingTrackingNumber === 'string' && shippingTrackingNumber.trim()) {
      trackingBlobs.push(shippingTrackingNumber);
    }
    const parsedTrackings = trackingBlobs.length
      ? parseTrackingPaste(trackingBlobs)
      : { ok: false as const, error: 'empty' };
    const trackingList = parsedTrackings.ok ? parsedTrackings.trackings : [];

    const shipmentIds: number[] = [];
    for (const trackingRaw of trackingList) {
      try {
        // Permissive register, no live carrier sync. resolveShipmentId would
        // UPS-sync a 1Z test number into EXCEPTION and SHIPPED_BY_CARRIER_SQL
        // would hide the row from To Ship pending.
        const permissive = await registerShipmentPermissive(
          { trackingNumber: trackingRaw, sourceSystem: 'orders.add', syncCarrier: false },
          orgId,
        );
        if (permissive?.id != null) shipmentIds.push(permissive.id);
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
    const shipmentId = shipmentIds[0] ?? null;

    const result = await withTenantTransaction(orgId, async (client) => {
      const inserted = await client.query(
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
            condition,
            type_id,
            is_urgent,
            quantity
          ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9::uuid, $10, $11, $12, $13, $14)
          RETURNING id, order_id, product_title, sku, shipment_id, condition, quantity, created_at`,
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
          typeId,
          isUrgentValue,
          quantityValue,
        ],
      );
      const orderPk = Number(inserted.rows[0].id);
      for (let i = 0; i < shipmentIds.length; i += 1) {
        await linkShipment(
          orgId,
          {
            ownerType: 'ORDER',
            ownerId: orderPk,
            shipmentId: shipmentIds[i],
            direction: 'OUTBOUND',
            isPrimary: i === 0,
            role: i === 0 ? 'ORDER_PRIMARY' : 'ORDER_EXTRA',
            source: 'orders.add',
            linkedBy: ctx.staffId ?? null,
          },
          client,
        );
      }
      await client.query(
        `INSERT INTO work_assignments
             (organization_id, entity_type, entity_id, work_type, assigned_tech_id, status, priority, deadline_at)
           VALUES ($1, 'ORDER', $2, 'TEST', NULL, 'OPEN', 100, NULL)
           ON CONFLICT ${WORK_ASSIGNMENTS_ACTIVE_ON_CONFLICT} DO NOTHING`,
        [orgId, orderPk],
      );
      await upsertOrderUnshippedMembership(client, {
        orgId,
        orderPk,
        shipmentId,
        title: String(inserted.rows[0].product_title ?? productTitle),
      });
      return inserted;
    });

    await invalidateOrderViews({
      organizationId: ctx.organizationId,
      orderIds: [Number(result.rows[0].id)],
      source: 'orders.add',
      extraTags: ['shipped', 'unshipped'],
    });
    // Inside the idempotency claim: a replayed key returns the cached body and
    // writes no second audit row, exactly as it writes no second order.
    await recordAudit(pool, ctx, req, {
      source: 'orders-add-api',
      action: AUDIT_ACTION.ORDER_CREATE,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: Number(result.rows[0].id),
      before: null,
      after: {
        orderId: result.rows[0].order_id,
        sku: result.rows[0].sku,
        skuCatalogId,
        shipmentId,
        status,
        idempotencyKey,
      },
    });
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
        order: {
          ...result.rows[0],
          shipping_tracking_number: trackingList[0] ?? null,
          tracking_number: trackingList[0] ?? null,
          created_at: new Date().toISOString(),
          deadline_at: null,
          has_tech_scan: false,
          is_out_of_stock: false,
          is_urgent: isUrgentValue,
          account_source: accountSource,
          status,
        },
      },
    };
  });

  return NextResponse.json(out.body, { status: out.status });
}, { permission: 'orders.create' });
