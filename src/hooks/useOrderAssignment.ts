'use client';

import { useQueryClient } from '@tanstack/react-query';
import { bustFulfillmentCaches, bustLabelsCaches } from '@/lib/outbound/outbound-cache-keys';
import { useOptimisticMutation } from '@/lib/optimistic/useOptimisticMutation';

export type OrderAssignPayload = {
  orderId?: number;
  orderIds?: number[];
  orderNumber?: string | null;
  testerId?: number | null;
  packerId?: number | null;
  testerName?: string | null;
  packerName?: string | null;
  shipByDate?: string | null;
  outOfStock?: string | null;
  isOutOfStock?: boolean;
  /** Shortage identity — written with isOutOfStock true; cleared when false. */
  oosKind?: 'listing' | 'kit_part' | 'catalog_child' | 'catalog_other' | null;
  oosSku?: string | null;
  oosSkuCatalogId?: number | null;
  oosKitPartId?: number | null;
  oosQtyShort?: number | null;
  oosTitle?: string | null;
  oosZohoItemId?: string | null;
  oosItemId?: string | null;
  /** Operator urgent / expedited toggle (orders.is_urgent). */
  isUrgent?: boolean;
  shippingTrackingNumber?: string | null;
  itemNumber?: string | null;
  condition?: string | null;
  quantity?: string | null;
  /** Operator-corrected product title (orders.product_title). */
  productTitle?: string | null;
  sku?: string | null;
  /** Canonical SKU linkage → orders.sku_catalog_id (resolved via get-title-by-sku). */
  skuCatalogId?: number | null;
  performedByStaffId?: number | null;
};

function applyOptimisticUpdate(current: unknown, payload: OrderAssignPayload): unknown {
  if (!current) return current;

  const idsToUpdate = new Set(
    (payload.orderId ? [payload.orderId] : payload.orderIds || []).filter((id): id is number => Number.isFinite(id)),
  );
  if (idsToUpdate.size === 0) return current;

  const patchRow = (row: Record<string, unknown> | null | undefined) => {
    if (!row || !idsToUpdate.has(Number(row.id))) return row;
    const next: Record<string, unknown> = { ...row };

    if (payload.testerId !== undefined) {
      // Assignee only — tested_by is the scan-completion actor, not the claim.
      next.tester_id = payload.testerId;
      next.testerId = payload.testerId;
      if (payload.testerName !== undefined) {
        next.tester_name = payload.testerName;
        // Prefer assignee face on the Pick cell when no scan stamp has landed.
        if (payload.testerId != null) {
          next.tested_by_name = next.tested_by_name || payload.testerName;
        }
      }
    }
    if (payload.packerId !== undefined) {
      next.packer_id = payload.packerId;
      next.packerId = payload.packerId;
      if (payload.packerName !== undefined) {
        next.packer_name = payload.packerName;
        if (payload.packerId != null) {
          next.packed_by_name = next.packed_by_name || payload.packerName;
        }
      }
    }
    if (payload.shipByDate !== undefined) {
      next.ship_by_date = payload.shipByDate;
      next.shipByDate = payload.shipByDate;
      // The Late / STATUS date reads deadline_at first. Patching only
      // ship_by_date left the old deadline winning until refetch.
      next.deadline_at = payload.shipByDate;
    }
    if (payload.orderNumber !== undefined) {
      next.order_id = payload.orderNumber;
      next.orderId = payload.orderNumber;
    }
    if (payload.outOfStock !== undefined || payload.isOutOfStock !== undefined) {
      const boolValue =
        payload.isOutOfStock !== undefined
          ? payload.isOutOfStock
          : Boolean(String(payload.outOfStock || '').trim());
      next.is_out_of_stock = boolValue;
      next.isOutOfStock = boolValue;
      next.out_of_stock = payload.outOfStock;
      next.outOfStock = payload.outOfStock;
      if (boolValue) {
        if (payload.oosKind !== undefined) {
          next.oos_kind = payload.oosKind;
          next.oosKind = payload.oosKind;
        }
        if (payload.oosSku !== undefined) {
          next.oos_sku = payload.oosSku;
          next.oosSku = payload.oosSku;
        }
        if (payload.oosSkuCatalogId !== undefined) {
          next.oos_sku_catalog_id = payload.oosSkuCatalogId;
          next.oosSkuCatalogId = payload.oosSkuCatalogId;
        }
        if (payload.oosKitPartId !== undefined) {
          next.oos_kit_part_id = payload.oosKitPartId;
          next.oosKitPartId = payload.oosKitPartId;
        }
        if (payload.oosQtyShort !== undefined) {
          next.oos_qty_short = payload.oosQtyShort;
          next.oosQtyShort = payload.oosQtyShort;
        }
        if (payload.oosTitle !== undefined) {
          next.oos_title = payload.oosTitle;
          next.oosTitle = payload.oosTitle;
        }
        if (payload.oosZohoItemId !== undefined) {
          next.oos_zoho_item_id = payload.oosZohoItemId;
          next.oosZohoItemId = payload.oosZohoItemId;
        }
      } else {
        next.oos_kind = null;
        next.oosKind = null;
        next.oos_sku = null;
        next.oosSku = null;
        next.oos_sku_catalog_id = null;
        next.oosSkuCatalogId = null;
        next.oos_kit_part_id = null;
        next.oosKitPartId = null;
        next.oos_qty_short = null;
        next.oosQtyShort = null;
        next.oos_title = null;
        next.oosTitle = null;
        next.oos_zoho_item_id = null;
        next.oosZohoItemId = null;
      }
    }
    if (payload.isUrgent !== undefined) {
      next.is_urgent = payload.isUrgent;
      next.isUrgent = payload.isUrgent;
    }
    if (payload.shippingTrackingNumber !== undefined) {
      next.shipping_tracking_number = payload.shippingTrackingNumber;
      next.shippingTrackingNumber = payload.shippingTrackingNumber;
    }
    if (payload.itemNumber !== undefined) {
      next.item_number = payload.itemNumber;
      next.itemNumber = payload.itemNumber;
    }
    if (payload.condition !== undefined) {
      next.condition = payload.condition;
    }
    if (payload.quantity !== undefined) {
      next.quantity = payload.quantity;
    }
    if (payload.productTitle !== undefined) {
      next.product_title = payload.productTitle;
      next.productTitle = payload.productTitle;
    }
    if (payload.sku !== undefined) {
      next.sku = payload.sku;
    }

    return next;
  };

  if (Array.isArray(current)) {
    return current.map(patchRow);
  }

  const bag = current as Record<string, unknown>;
  if (Array.isArray(bag.orders)) {
    return { ...bag, orders: bag.orders.map(patchRow) };
  }
  if (Array.isArray(bag.results)) {
    return { ...bag, results: bag.results.map(patchRow) };
  }
  if (Array.isArray(bag.shipped)) {
    return { ...bag, shipped: bag.shipped.map(patchRow) };
  }

  return current;
}

export function useOrderAssignment() {
  const queryClient = useQueryClient();

  return useOptimisticMutation({
    mutationFn: async (payload: OrderAssignPayload) => {
      const res = await fetch('/api/orders/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string })?.error || 'Failed to update order assignment');
      }
      return data;
    },
    caches: [
      { queryKey: ['orders'], match: 'prefix', update: applyOptimisticUpdate },
      { queryKey: ['shipped'], match: 'prefix', update: applyOptimisticUpdate },
      { queryKey: ['dashboard-table'], match: 'prefix', update: applyOptimisticUpdate },
    ],
    onSuccess: (_data, payload) => {
      if (payload.shippingTrackingNumber !== undefined) {
        bustLabelsCaches(queryClient);
        bustFulfillmentCaches(queryClient);
      } else if (payload.isUrgent !== undefined || payload.isOutOfStock !== undefined) {
        bustFulfillmentCaches(queryClient);
      }
      if (typeof window === 'undefined') return;
      const orderIds = payload.orderId ? [payload.orderId] : payload.orderIds || [];
      window.dispatchEvent(
        new CustomEvent('order-assignment-updated', {
          detail: {
            orderIds,
            testerId: payload.testerId,
            packerId: payload.packerId,
            testerName: payload.testerName,
            packerName: payload.packerName,
            orderNumber: payload.orderNumber,
            shipByDate: payload.shipByDate,
            outOfStock: payload.outOfStock,
            isOutOfStock: payload.isOutOfStock,
            isUrgent: payload.isUrgent,
            shippingTrackingNumber: payload.shippingTrackingNumber,
            itemNumber: payload.itemNumber,
            condition: payload.condition,
            productTitle: payload.productTitle,
          },
        }),
      );
    },
  });
}
