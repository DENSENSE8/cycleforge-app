'use client';

import { useCallback } from 'react';
import { toast } from '@/lib/toast';
import type { Order } from '@/components/station/upnext/upnext-types';
import { dispatchUpNextPreview } from '@/utils/events';
import { normalizeShippedRailStatus } from './shipping-rail-shared';

interface LookupOrder {
  id: number;
  order_id: string;
  product_title: string | null;
  sku: string | null;
  condition: string | null;
  status: string | null;
  quantity: string | null;
  account_source: string | null;
  created_at: string | null;
  item_number: string | null;
  ship_by_date: string | null;
  picker_id: number | null;
  packer_id: number | null;
  tracking_numbers: string[] | null;
  is_out_of_stock?: boolean;
}

function lookupToPreviewOrder(order: LookupOrder): Order {
  return {
    id: Number(order.id),
    ship_by_date: order.ship_by_date ?? null,
    created_at: order.created_at ?? null,
    order_id: String(order.order_id || ''),
    product_title: String(order.product_title || ''),
    item_number: order.item_number ?? null,
    account_source: order.account_source ?? null,
    sku: String(order.sku || ''),
    condition: order.condition ?? null,
    quantity: order.quantity != null ? String(order.quantity) : null,
    status: normalizeShippedRailStatus(order.status, false),
    shipping_tracking_number: String(order.tracking_numbers?.[0] || ''),
    picker_id: order.picker_id ?? null,
    packer_id: order.packer_id ?? null,
    is_out_of_stock: Boolean(order.is_out_of_stock),
    has_pick_scan: false,
    is_shipped: false,
  };
}

/** Preview stance's OPEN for Ready to Pack / Shipping — same contract as {@link useUnboxPreviewOpen}: */
export function useShippingPreviewOpen() {
  return useCallback(async (value: string): Promise<Order | null> => {
    const raw = value.trim();
    if (!raw) return null;
    const res = await fetch(`/api/orders/lookup/${encodeURIComponent(raw)}`, {
      cache: 'no-store',
    });
    if (res.ok) {
      const json = (await res.json()) as { order?: LookupOrder | null };
      const order = json.order ?? null;
      if (order?.id) {
        const preview = lookupToPreviewOrder(order);
        dispatchUpNextPreview({ kind: 'find', sel: { entityType: 'order', id: preview.id } });
        return preview;
      }
    } else if (res.status !== 404) {
      throw new Error(`orders-lookup ${res.status}`);
    }

    const unitRes = await fetch(`/api/serial-units/${encodeURIComponent(raw)}?include=full`, {
      cache: 'no-store',
    });
    if (unitRes.ok) {
      const unitJson = (await unitRes.json()) as { serial_unit?: { id?: number } };
      const unitId = Number(unitJson.serial_unit?.id);
      if (Number.isFinite(unitId) && unitId > 0) {
        dispatchUpNextPreview({ kind: 'find', sel: { entityType: 'unit', id: unitId } });
        return null;
      }
    }

    toast.warning('Nothing on file for that value');
    return null;
  }, []);
}
