import { NextRequest, NextResponse, after } from 'next/server';
import pool from '@/lib/db';
import { recomputeEnrichmentForOrders } from '@/lib/neon/packer-log-enrichment';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { invalidateAllOrdersApiCaches } from '@/lib/orders/invalidation';
import { publishOrderAssignmentsUpdated, publishOrderChanged } from '@/lib/realtime/publish';
import { recordAudit, AUDIT_ACTION } from '@/lib/audit-logs';
import {
  getOrderAssignmentSnapshotsByOrderIds,
  getStaffNameMap,
} from '@/lib/work-assignments/order-assignment-snapshot';
import {
  upsertOrderAssignment,
  upsertOrderDeadline,
} from '@/lib/work-assignments/upsert-order-assignment';
import { clearReplenishmentForOrder, ensureReplenishmentForOrder } from '@/lib/replenishment';
import { withAuth } from '@/lib/auth/withAuth';
import {
  upsertOrderTracking,
  updateShipmentTrackingById,
  createAdditionalShipmentLink,
  deleteShipmentTrackingLink,
} from '@/lib/neon/orders-tracking-queries';
import { linkShipment } from '@/lib/shipping/shipment-links';
import {
  catalogChildShortageIdentity,
  catalogOtherShortageIdentity,
  kitPartShortageIdentity,
  listingShortageIdentity,
  type OrderShortageIdentity,
} from '@/lib/orders/order-shortage-identity';
import { clearOrderLineShortages, upsertOrderLineShortage } from '@/lib/orders/order-line-shortage';

/**
 * POST /api/orders/assign
 * Assigns tech and/or packer to one or more orders via work_assignments.
 * Also handles non-assignment order field updates (ship_by_date, condition, etc.).
 *
 * NOT notes: an order annotation goes to `order_notes` via
 * POST /api/orders/[id]/notes. This route used to accept `{ notes }` and
 * overwrite the scalar `orders.notes`, which made the same note writable in two
 * places — the thing `2026-07-28_order_notes.sql`'s scope boundary forbids.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const body = await req.json();
    const {
      orderId,
      orderIds,
      testerId,
      packerId,
      orderNumber,
      shipByDate,
      outOfStock,
      isOutOfStock,
      isUrgent,
      shippingTrackingNumber,
      trackingLinkEdits,
      trackingLinkCreates,
      trackingLinkDeletes,
      setPrimaryShipmentId,
      itemNumber,
      condition,
      quantity,
      productTitle,
      sku,
      skuCatalogId,
      oosKind,
      oosSku,
      oosSkuCatalogId,
      oosKitPartId,
      oosQtyShort,
      oosTitle,
      oosZohoItemId,
      oosItemId,
      performedByStaffId,
      actorStaffId,
      staffId,
    } = body;

    if (!orderId && (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0)) {
      return NextResponse.json(
        { error: 'orderId or orderIds array is required' },
        { status: 400 }
      );
    }

    const idsToUpdate: number[] = (orderId ? [orderId] : orderIds).map(Number);
    const actorIdRaw = Number(performedByStaffId ?? actorStaffId ?? staffId);
    const actorId = Number.isFinite(actorIdRaw) && actorIdRaw > 0 ? actorIdRaw : null;

    const orgId = ctx.organizationId;
    let outOfStockChanged = false;
    let outOfStockValueBoolean: boolean = false;

    // Sentinel for the duplicate order_id case: thrown to abort the tenant
    // transaction (the wrapper ROLLBACKs), then caught to return the exact
    // same 409 response body the inline ROLLBACK produced.
    const DUPLICATE_ORDER_ID = Symbol('duplicate_order_id');

    try {
      await withTenantTransaction(orgId, async (client) => {

      // ── 1. Write work_assignments for tech / packer ────────────────────────
      if (testerId !== undefined) {
        const techId = testerId === 0 ? null : (testerId ? Number(testerId) : null);
        await Promise.all(idsToUpdate.map((id) => upsertOrderAssignment(ctx.organizationId, id, 'TEST', techId, client)));
      }

      if (packerId !== undefined) {
        const pkId = packerId === 0 ? null : (packerId ? Number(packerId) : null);
        await Promise.all(idsToUpdate.map((id) => upsertOrderAssignment(ctx.organizationId, id, 'PACK', pkId, client)));
      }

      // ── 2a. Write deadline_at into the canonical ORDER/TEST row ───────────
      if (shipByDate !== undefined) {
        await Promise.all(
          idsToUpdate.map((id) => upsertOrderDeadline(ctx.organizationId, id, shipByDate || null, client))
        );
      }

      // ── 2b. Update carrier tracking through shipment backbone ──────────────
      // Capture which orders had NO tracking yet (shipment_id IS NULL) BEFORE the
      // upsert, so we can record a one-time `orders.tracking.added` event only on
      // the first add (re-edits stay just ORDER_ASSIGNMENT_UPDATED). Powers the
      // order timeline + the Unshipped "tracking added" record.
      let newlyTrackedIds: number[] = [];
      const trimmedTracking = String(shippingTrackingNumber ?? '').trim();
      if (shippingTrackingNumber !== undefined && trimmedTracking) {
        const priorNull = await client.query(
          `SELECT id FROM orders WHERE id = ANY($1::int[]) AND shipment_id IS NULL`,
          [idsToUpdate]
        );
        newlyTrackedIds = priorNull.rows.map((r: { id: number }) => Number(r.id));
        await upsertOrderTracking(idsToUpdate, shippingTrackingNumber, client, ctx.organizationId);
      } else if (shippingTrackingNumber !== undefined) {
        await upsertOrderTracking(idsToUpdate, shippingTrackingNumber, client, ctx.organizationId);
      }

      if (Array.isArray(trackingLinkEdits) && trackingLinkEdits.length > 0) {
        for (const edit of trackingLinkEdits) {
          const shipmentId = Number(edit?.shipmentId);
          const nextTracking = String(edit?.shippingTrackingNumber || '').trim();
          if (!Number.isFinite(shipmentId) || shipmentId <= 0) continue;
          if (!nextTracking) continue;
          await updateShipmentTrackingById(idsToUpdate, shipmentId, nextTracking, client, ctx.organizationId);
        }
      }

      const createdShipmentIds: number[] = [];
      if (Array.isArray(trackingLinkCreates) && trackingLinkCreates.length > 0) {
        for (const create of trackingLinkCreates) {
          const nextTracking = String(create?.shippingTrackingNumber || '').trim();
          if (!nextTracking) continue;
          const createdId = await createAdditionalShipmentLink(idsToUpdate, nextTracking, client, ctx.organizationId);
          createdShipmentIds.push(createdId);
        }
      }

      if (Array.isArray(trackingLinkDeletes) && trackingLinkDeletes.length > 0) {
        for (const removal of trackingLinkDeletes) {
          const shipmentId = Number(removal?.shipmentId);
          if (!Number.isFinite(shipmentId) || shipmentId <= 0) continue;
          await deleteShipmentTrackingLink(idsToUpdate, shipmentId, client);
        }
      }

      // ── 2b′. Ensure orders.shipment_id points to a valid shipment ────────
      // Resolve which shipment id should be canonical: explicit from the
      // client, or the first newly-created one when the order had none.
      let resolvedPrimaryId: number | null = null;
      const explicitPrimary = Number(setPrimaryShipmentId);
      if (Number.isFinite(explicitPrimary) && explicitPrimary > 0) {
        resolvedPrimaryId = explicitPrimary;
      } else if (createdShipmentIds.length > 0) {
        // Frontend couldn't provide the id because it didn't exist yet.
        // Check whether orders.shipment_id is still NULL; if so, adopt the
        // first newly-created shipment.
        const nullCheck = await client.query(
          `SELECT id FROM orders WHERE id = ANY($1::int[]) AND shipment_id IS NULL LIMIT 1`,
          [idsToUpdate]
        );
        if ((nullCheck.rowCount ?? 0) > 0) {
          resolvedPrimaryId = createdShipmentIds[0];
        }
      }

      if (resolvedPrimaryId) {
        await client.query(
          `UPDATE orders SET shipment_id = $1 WHERE id = ANY($2::int[])`,
          [resolvedPrimaryId, idsToUpdate]
        );
        for (const orderId of idsToUpdate) {
          await linkShipment(
            ctx.organizationId,
            { ownerType: 'ORDER', ownerId: orderId, shipmentId: resolvedPrimaryId, direction: 'OUTBOUND', isPrimary: true, role: 'ORDER_PRIMARY', source: 'orders.assign' },
            client,
          );
        }
      }

      // ── 2c. Update remaining fields directly on orders table ───────────────
      const updates: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (orderNumber !== undefined) {
        const normalizedOrderNumber = String(orderNumber || '').trim();
        if (normalizedOrderNumber) {
          const duplicateCheck = await client.query(
            `SELECT id FROM orders WHERE order_id = $1 AND id <> ALL($2::int[]) LIMIT 1`,
            [normalizedOrderNumber, idsToUpdate]
          );
          if (duplicateCheck.rowCount && duplicateCheck.rowCount > 0) {
            // Abort the tenant transaction (wrapper ROLLBACKs); caught below to
            // return the same 409 body as the original inline ROLLBACK path.
            throw DUPLICATE_ORDER_ID;
          }
        }
        updates.push(`order_id = $${paramCount++}`);
        values.push(normalizedOrderNumber || null);
      }

      if (outOfStock !== undefined || isOutOfStock !== undefined) {
        outOfStockChanged = true;
        // Handle both legacy string outOfStock and new boolean isOutOfStock
        if (isOutOfStock !== undefined) {
          outOfStockValueBoolean = Boolean(isOutOfStock);
        } else if (outOfStock !== undefined) {
          // Legacy: non-empty trim → true
          outOfStockValueBoolean = Boolean(String(outOfStock || '').trim());
        }
        updates.push(`is_out_of_stock = $${paramCount++}`);
        values.push(outOfStockValueBoolean);

        // Shortage identity rides the hold. Cleared when the hold flips off.
        if (outOfStockValueBoolean) {
          const kind =
            oosKind === 'kit_part' || oosKind === 'catalog_child' || oosKind === 'catalog_other'
              ? oosKind
              : 'listing';
          updates.push(`oos_kind = $${paramCount++}`);
          values.push(kind);
          if (oosSku !== undefined) {
            updates.push(`oos_sku = $${paramCount++}`);
            values.push(String(oosSku || '').trim() || null);
          }
          if (oosSkuCatalogId !== undefined) {
            updates.push(`oos_sku_catalog_id = $${paramCount++}`);
            values.push(oosSkuCatalogId == null ? null : Number(oosSkuCatalogId));
          }
          if (oosKitPartId !== undefined) {
            updates.push(`oos_kit_part_id = $${paramCount++}`);
            values.push(oosKitPartId == null ? null : Number(oosKitPartId));
          }
          if (oosQtyShort !== undefined) {
            updates.push(`oos_qty_short = $${paramCount++}`);
            const qty = Number(oosQtyShort);
            values.push(Number.isFinite(qty) && qty > 0 ? qty : 1);
          }
          if (oosTitle !== undefined) {
            updates.push(`oos_title = $${paramCount++}`);
            values.push(String(oosTitle || '').trim() || null);
          }
          if (oosZohoItemId !== undefined) {
            updates.push(`oos_zoho_item_id = $${paramCount++}`);
            values.push(String(oosZohoItemId || '').trim() || null);
          }
        } else {
          updates.push(`oos_kind = $${paramCount++}`);
          values.push(null);
          updates.push(`oos_sku = $${paramCount++}`);
          values.push(null);
          updates.push(`oos_sku_catalog_id = $${paramCount++}`);
          values.push(null);
          updates.push(`oos_kit_part_id = $${paramCount++}`);
          values.push(null);
          updates.push(`oos_qty_short = $${paramCount++}`);
          values.push(null);
          updates.push(`oos_title = $${paramCount++}`);
          values.push(null);
          updates.push(`oos_zoho_item_id = $${paramCount++}`);
          values.push(null);
        }
      }
      if (isUrgent !== undefined) {
        updates.push(`is_urgent = $${paramCount++}`);
        values.push(Boolean(isUrgent));
      }
      if (itemNumber !== undefined) {
        updates.push(`item_number = $${paramCount++}`);
        values.push(itemNumber || null);
      }
      if (condition !== undefined) {
        updates.push(`condition = $${paramCount++}`);
        values.push(condition || null);
      }
      if (quantity !== undefined) {
        updates.push(`quantity = $${paramCount++}`);
        values.push(quantity || '1');
      }
      // Operator-corrected product title (Pending grid in-cell edit). Empty
      // commits are rejected client-side; keep NULL out of a display column.
      if (productTitle !== undefined) {
        updates.push(`product_title = $${paramCount++}`);
        values.push(String(productTitle || '').trim() || null);
      }
      if (sku !== undefined) {
        updates.push(`sku = $${paramCount++}`);
        values.push(sku || null);
      }
      // Canonical SKU linkage (orders.sku_catalog_id → sku_catalog.id), resolved
      // via /api/get-title-by-sku in the add-tracking popover. Never string-joined.
      if (skuCatalogId !== undefined) {
        updates.push(`sku_catalog_id = $${paramCount++}`);
        values.push(skuCatalogId == null ? null : Number(skuCatalogId));
      }

      if (updates.length > 0) {
        const idPlaceholders = idsToUpdate.map(() => `$${paramCount++}`).join(', ');
        values.push(...idsToUpdate);
        await client.query(
          `UPDATE orders SET ${updates.join(', ')} WHERE id IN (${idPlaceholders})`,
          values
        );
      }

      if (outOfStockChanged) {
        for (const lineId of idsToUpdate) {
          if (outOfStockValueBoolean) {
            await upsertOrderLineShortage(client, {
              orgId,
              orderId: lineId,
              identity: assignShortageIdentity({
                oosKind,
                oosSku,
                oosSkuCatalogId,
                oosKitPartId,
                oosQtyShort,
                oosTitle,
                oosZohoItemId,
                oosItemId,
                sku,
                productTitle,
                skuCatalogId,
              }),
              createdBy: 'staff',
            });
          } else {
            await clearOrderLineShortages(client, {
              orgId,
              orderId: lineId,
              clearedBy: 'staff',
            });
          }
        }
      }

      const changedFields: Record<string, unknown> = {};
      if (testerId !== undefined) changedFields.testerId = testerId;
      if (packerId !== undefined) changedFields.packerId = packerId;
      if (orderNumber !== undefined) changedFields.orderNumber = orderNumber;
      if (shipByDate !== undefined) changedFields.shipByDate = shipByDate;
      if (outOfStock !== undefined || isOutOfStock !== undefined) {
        changedFields.isOutOfStock = outOfStockValueBoolean;
        if (outOfStockValueBoolean) {
          if (oosKind !== undefined) changedFields.oosKind = oosKind;
          if (oosSku !== undefined) changedFields.oosSku = oosSku;
          if (oosSkuCatalogId !== undefined) changedFields.oosSkuCatalogId = oosSkuCatalogId;
          if (oosKitPartId !== undefined) changedFields.oosKitPartId = oosKitPartId;
          if (oosQtyShort !== undefined) changedFields.oosQtyShort = oosQtyShort;
          if (oosTitle !== undefined) changedFields.oosTitle = oosTitle;
        } else {
          changedFields.oosKind = null;
          changedFields.oosSku = null;
          changedFields.oosSkuCatalogId = null;
          changedFields.oosKitPartId = null;
          changedFields.oosQtyShort = null;
          changedFields.oosTitle = null;
        }
      }
      if (isUrgent !== undefined) changedFields.isUrgent = Boolean(isUrgent);
      if (shippingTrackingNumber !== undefined) changedFields.shippingTrackingNumber = shippingTrackingNumber;
      if (Array.isArray(trackingLinkEdits) && trackingLinkEdits.length > 0) changedFields.trackingLinkEdits = trackingLinkEdits;
      if (Array.isArray(trackingLinkCreates) && trackingLinkCreates.length > 0) changedFields.trackingLinkCreates = trackingLinkCreates;
      if (Array.isArray(trackingLinkDeletes) && trackingLinkDeletes.length > 0) changedFields.trackingLinkDeletes = trackingLinkDeletes;
      if (itemNumber !== undefined) changedFields.itemNumber = itemNumber;
      if (condition !== undefined) changedFields.condition = condition;
      if (quantity !== undefined) changedFields.quantity = quantity;
      if (productTitle !== undefined) changedFields.productTitle = productTitle;
      if (sku !== undefined) changedFields.sku = sku;
      if (skuCatalogId !== undefined) changedFields.skuCatalogId = skuCatalogId;

      await Promise.all(
        idsToUpdate.map((id) =>
          recordAudit(client, ctx, req, {
            source: 'api.orders.assign',
            action: AUDIT_ACTION.ORDER_ASSIGNMENT_UPDATED,
            entityType: 'ORDER',
            entityId: String(id),
            after: changedFields,
            actorStaffIdOverride: actorId,
            extra: {
              orderId: id,
              changedFieldKeys: Object.keys(changedFields),
            },
          }),
        ),
      );

      // One-time "tracking added" event + first-time stamp for orders that had
      // no tracking before. The column is a fast read projection; audit_logs is SoT.
      if (newlyTrackedIds.length > 0) {
        await Promise.all(
          newlyTrackedIds.map((id) =>
            recordAudit(client, ctx, req, {
              source: 'api.orders.assign',
              action: AUDIT_ACTION.TRACKING_ADDED,
              entityType: 'ORDER',
              entityId: String(id),
              after: { trackingNumber: trimmedTracking },
              actorStaffIdOverride: actorId,
              extra: { orderId: id },
            }),
          ),
        );
        await client.query(
          `UPDATE orders SET tracking_added_at = NOW(), tracking_added_by = $1
             WHERE id = ANY($2::int[]) AND tracking_added_at IS NULL`,
          [actorId ?? null, newlyTrackedIds],
        );
      }

      });
    } catch (txError) {
      if (txError === DUPLICATE_ORDER_ID) {
        return NextResponse.json(
          { error: 'Order ID already exists on another order' },
          { status: 409 }
        );
      }
      throw txError;
    }

    if (process.env.FEATURE_REPLENISHMENT === 'true' && outOfStockChanged) {
      const shortSku = String(oosSku || '').trim();
      const replenishReason = shortSku ? `Out of stock · ${shortSku}` : 'Out of stock';
      for (const orderId of idsToUpdate) {
        if (outOfStockValueBoolean) {
          await ensureReplenishmentForOrder({
            orderId,
            reason: replenishReason,
            changedBy: 'staff',
            forceFullQuantity: true,
          }, ctx.organizationId);
        } else {
          await clearReplenishmentForOrder(orderId, 'staff', ctx.organizationId);
        }
      }
    }

    try {
      await invalidateAllOrdersApiCaches(['shipped', 'orders-next', 'tech-logs', 'packing-logs', 'need-to-order'], ctx.organizationId);
    } catch (cacheErr) {
      console.warn('[orders/assign] cache invalidation failed (non-critical):', cacheErr);
    }
    // Tracking/SKU changes here can flip a packed scan's order match — refresh the
    // shipped-table read model for affected PACK scans (deferred, best-effort).
    after(() =>
      recomputeEnrichmentForOrders(pool, idsToUpdate).catch((e) =>
        console.warn('[orders/assign] enrichment recompute failed', e),
      ),
    );
    try {
      await publishOrderChanged({ organizationId: ctx.organizationId, orderIds: idsToUpdate, source: 'orders.assign' });
    } catch (realtimeErr) {
      console.warn('[orders/assign] realtime publish failed (non-critical):', realtimeErr);
    }
    try {
      const snaps = await getOrderAssignmentSnapshotsByOrderIds(idsToUpdate);
      const staffIds = Array.from(snaps.values()).flatMap((s) => [s.testerId, s.packerId]);
      const nameMap = await getStaffNameMap(staffIds);
      for (const orderId of idsToUpdate) {
        const snap = snaps.get(orderId) ?? { testerId: null, packerId: null, deadlineAt: null };
        await publishOrderAssignmentsUpdated({
          organizationId: ctx.organizationId,
          orderId,
          testerId: snap.testerId,
          packerId: snap.packerId,
          testerName: snap.testerId != null ? nameMap.get(snap.testerId) ?? null : null,
          packerName: snap.packerId != null ? nameMap.get(snap.packerId) ?? null : null,
          deadlineAt: snap.deadlineAt,
          source: 'orders.assign',
        });
      }
    } catch (assignBroadcastErr) {
      console.warn('[orders/assign] assignment broadcast failed (non-critical):', assignBroadcastErr);
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error assigning order:', error);
    const message = String(error?.message || '');
    const status =
      message.includes('already exists')
        ? 409
        : message.includes('Cannot detect carrier') || message.includes('invalid')
          ? 400
          : 500;
    return NextResponse.json(
      { error: 'Failed to assign order', details: message },
      { status }
    );
  }
}, { permission: 'orders.create' });

function assignShortageIdentity(args: {
  oosKind?: string | null;
  oosSku?: string | null;
  oosSkuCatalogId?: number | null;
  oosKitPartId?: number | null;
  oosQtyShort?: number | null;
  oosTitle?: string | null;
  oosZohoItemId?: string | null;
  oosItemId?: string | null;
  sku?: string | null;
  productTitle?: string | null;
  skuCatalogId?: number | null;
}): OrderShortageIdentity {
  const base = {
    sku: args.oosSku ?? args.sku,
    skuCatalogId: args.oosSkuCatalogId ?? args.skuCatalogId,
    title: args.oosTitle ?? args.productTitle,
    qtyShort: args.oosQtyShort,
    zohoItemId: args.oosZohoItemId,
    itemId: args.oosItemId,
  };
  if (args.oosKind === 'kit_part') {
    return kitPartShortageIdentity({
      ...base,
      title: base.title || 'Kit part',
      kitPartId: args.oosKitPartId,
    });
  }
  if (args.oosKind === 'catalog_child') {
    return catalogChildShortageIdentity({ ...base, title: base.title || 'Component' });
  }
  if (args.oosKind === 'catalog_other') {
    return catalogOtherShortageIdentity({ ...base, title: base.title || 'Inventory item' });
  }
  return listingShortageIdentity(base);
}
