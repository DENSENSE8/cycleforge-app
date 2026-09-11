import { NextRequest, NextResponse } from 'next/server';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { invalidateAllOrdersApiCaches } from '@/lib/orders/invalidation';
import { publishOrderChanged } from '@/lib/realtime/publish';
import { clearReplenishmentForOrder, ensureReplenishmentForOrder } from '@/lib/replenishment';
import { recordAudit, AUDIT_ACTION } from '@/lib/audit-logs';
import { withAuth } from '@/lib/auth/withAuth';
import {
  catalogChildShortageIdentity,
  catalogOtherShortageIdentity,
  kitPartShortageIdentity,
  listingShortageIdentity,
} from '@/lib/orders/order-shortage-identity';
import { clearOrderLineShortages, upsertOrderLineShortage } from '@/lib/orders/order-line-shortage';

/**
 * POST /api/orders/missing-parts - Move order to missing parts status.
 * Callers: Morphing / details OOS flows. Schema: orders.is_out_of_stock + oos_*.
 * User: Implement OOS identity + Pending-tab toast plan.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const body = await req.json();
    const {
      orderId,
      reason,
      isOutOfStock,
      oosKind,
      oosSku,
      oosSkuCatalogId,
      oosKitPartId,
      oosQtyShort,
      oosTitle,
      oosZohoItemId,
      oosItemId,
    } = body;

    if (!orderId) {
      return NextResponse.json(
        { error: 'orderId is required' },
        { status: 400 }
      );
    }

    // Determine the boolean value for is_out_of_stock
    // Priority: isOutOfStock boolean > reason presence
    let outOfStockBoolean: boolean;
    if (isOutOfStock !== undefined) {
      outOfStockBoolean = Boolean(isOutOfStock);
    } else {
      // Legacy: if reason is provided and non-empty, consider it out of stock
      outOfStockBoolean = Boolean(String(reason || '').trim());
    }

    // Update order and record audit in transaction
    await withTenantTransaction(ctx.organizationId, async (client) => {
      if (outOfStockBoolean) {
        const kind =
          oosKind === 'kit_part' || oosKind === 'catalog_child' || oosKind === 'catalog_other'
            ? oosKind
            : 'listing';
        await client.query(
          `UPDATE orders SET
             is_out_of_stock = true,
             oos_kind = $1,
             oos_sku = $2,
             oos_sku_catalog_id = $3,
             oos_kit_part_id = $4,
             oos_qty_short = $5,
             oos_title = $6,
             oos_zoho_item_id = $7
           WHERE id = $8 AND organization_id = $9`,
          [
            kind,
            String(oosSku || '').trim() || null,
            oosSkuCatalogId == null ? null : Number(oosSkuCatalogId),
            oosKitPartId == null ? null : Number(oosKitPartId),
            (() => {
              const qty = Number(oosQtyShort);
              return Number.isFinite(qty) && qty > 0 ? qty : 1;
            })(),
            String(oosTitle || '').trim() || null,
            String(oosZohoItemId || '').trim() || null,
            orderId,
            ctx.organizationId,
          ],
        );
        const qty = Number(oosQtyShort);
        const base = {
          sku: String(oosSku || '').trim() || null,
          skuCatalogId: oosSkuCatalogId == null ? null : Number(oosSkuCatalogId),
          title: String(oosTitle || '').trim() || null,
          qtyShort: Number.isFinite(qty) && qty > 0 ? qty : 1,
          zohoItemId: String(oosZohoItemId || '').trim() || null,
          itemId: String(oosItemId || '').trim() || null,
        };
        const identity =
          kind === 'kit_part'
            ? kitPartShortageIdentity({ ...base, title: base.title || 'Kit part', kitPartId: oosKitPartId })
            : kind === 'catalog_child'
              ? catalogChildShortageIdentity({ ...base, title: base.title || 'Component' })
              : kind === 'catalog_other'
                ? catalogOtherShortageIdentity({ ...base, title: base.title || 'Inventory item' })
                : listingShortageIdentity(base);
        await upsertOrderLineShortage(client, {
          orgId: ctx.organizationId,
          orderId: Number(orderId),
          identity,
          createdBy: 'staff',
        });
      } else {
        await client.query(
          `UPDATE orders SET
             is_out_of_stock = false,
             oos_kind = NULL,
             oos_sku = NULL,
             oos_sku_catalog_id = NULL,
             oos_kit_part_id = NULL,
             oos_qty_short = NULL,
             oos_title = NULL,
             oos_zoho_item_id = NULL
           WHERE id = $1 AND organization_id = $2`,
          [orderId, ctx.organizationId],
        );
        await clearOrderLineShortages(client, {
          orgId: ctx.organizationId,
          orderId: Number(orderId),
          clearedBy: 'staff',
        });
      }

      await recordAudit(client, ctx, req, {
        source: 'api.orders.missing-parts',
        action: AUDIT_ACTION.ORDER_ASSIGNMENT_UPDATED,
        entityType: 'ORDER',
        entityId: String(orderId),
        after: {
          isOutOfStock: outOfStockBoolean,
          ...(outOfStockBoolean
            ? {
                oosKind,
                oosSku,
                oosSkuCatalogId,
                oosKitPartId,
                oosQtyShort,
                oosTitle,
              }
            : {
                oosKind: null,
                oosSku: null,
                oosSkuCatalogId: null,
                oosKitPartId: null,
                oosQtyShort: null,
                oosTitle: null,
              }),
        },
        extra: {
          orderId: Number(orderId),
          changedFieldKeys: ['isOutOfStock'],
        },
      });
    });

    if (process.env.FEATURE_REPLENISHMENT === 'true') {
      if (outOfStockBoolean) {
        const shortSku = String(oosSku || '').trim();
        await ensureReplenishmentForOrder({
          orderId: Number(orderId),
          reason: shortSku ? `Out of stock · ${shortSku}` : 'Out of stock',
          changedBy: 'staff',
          forceFullQuantity: true,
        }, ctx.organizationId);
      } else {
        await clearReplenishmentForOrder(Number(orderId), 'staff', ctx.organizationId);
      }
    }

    await invalidateAllOrdersApiCaches(['shipped', 'need-to-order'], ctx.organizationId);
    await publishOrderChanged({ organizationId: ctx.organizationId, orderIds: [Number(orderId)], source: 'orders.missing-parts' });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error marking order as missing parts:', error);
    return NextResponse.json(
      { error: 'Failed to update order', details: error.message },
      { status: 500 }
    );
  }
}, { permission: 'orders.create' });
