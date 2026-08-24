'use client';

/**
 * Local Pickup display data — the LCPU product lines feeding the `/pickup`
 * receiving mode's rail + table. Sourced from `GET /api/local-pickup-orders/lines`
 * (the only LCPU dataset with products — `local_pickup_orders` + items; the Zoho
 * PO mirror is header-only). Row = product, group = LCPU order (Unbox family).
 */

import { useQuery } from '@tanstack/react-query';
import {
  parsePickupStatusTab,
  pickupOrderIsDone,
  pickupOrderNeedsProcess,
  type PickupStatusTab,
} from '@/lib/local-pickup/order-status';

export type { PickupStatusTab };
export { parsePickupStatusTab };

export interface PickupLine {
  id: number;
  order_id: number;
  sku: string | null;
  product_title: string;
  image_url: string | null;
  quantity: number;
  condition_grade: string;
  parts_status: string;
  missing_parts_note: string | null;
  condition_note: string | null;
  total_price: string;
  po_number: string | null;
  reference_number: string | null;
  customer_name: string | null;
  order_status: string;
  /** Linked receiving carton id once finalize/process started; null = need to process. */
  receiving_id: number | null;
  pickup_date: string | null;
  zoho_po_id: string | null;
  zoho_status: string | null;
  zoho_total: string | null;
  zoho_po_date: string | null;
  zoho_vendor_name: string | null;
}

export interface PickupOrderGroup {
  orderId: number;
  poNumber: string;
  customer: string | null;
  orderStatus: string;
  receivingId: number | null;
  zohoStatus: string | null;
  pickupDate: string | null;
  lines: PickupLine[];
  itemCount: number;
  totalValue: number;
}

/** True when this product line's order belongs on the Need to process tab. */
export function pickupLineNeedsProcess(line: PickupLine): boolean {
  return pickupOrderNeedsProcess({
    status: line.order_status,
    receivingId: line.receiving_id,
    itemCount: 1,
  });
}

/** Status-tab filter over flat product lines. */
export function pickupLineMatchesStatus(line: PickupLine, tab: PickupStatusTab): boolean {
  if (tab === 'all') return true;
  if (tab === 'done') return pickupOrderIsDone(line.order_status);
  if (tab === 'process') return pickupLineNeedsProcess(line);
  // draft — unfinished (not COMPLETED), including empty shells once they have lines
  return !pickupOrderIsDone(line.order_status);
}

/** React-query feed of every LCPU product line (newest pickup date first). */
export function usePickupLines() {
  return useQuery({
    queryKey: ['local-pickup-lines'],
    queryFn: async (): Promise<PickupLine[]> => {
      const res = await fetch('/api/local-pickup-orders/lines?limit=500', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Pickup lines failed (HTTP ${res.status})`);
      const data = (await res.json()) as { lines?: PickupLine[] };
      return Array.isArray(data.lines) ? data.lines : [];
    },
    staleTime: 30_000,
  });
}

/** Money helper — the endpoint returns a `numeric(12,2)::text` string. */
export function pickupMoney(raw: string | null | undefined): string {
  const n = Number((raw ?? '').trim());
  return `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
}

/**
 * Fold flat product lines into their LCPU orders, preserving the server's
 * newest-first ordering (the first line seen for an order fixes its position).
 */
export function groupPickupLines(lines: PickupLine[]): PickupOrderGroup[] {
  const byOrder = new Map<number, PickupOrderGroup>();
  for (const line of lines) {
    let group = byOrder.get(line.order_id);
    if (!group) {
      group = {
        orderId: line.order_id,
        poNumber: line.po_number || line.reference_number || `Order ${line.order_id}`,
        customer: line.customer_name || line.zoho_vendor_name || null,
        orderStatus: line.order_status,
        receivingId: line.receiving_id ?? null,
        zohoStatus: line.zoho_status,
        pickupDate: line.pickup_date,
        lines: [],
        itemCount: 0,
        totalValue: 0,
      };
      byOrder.set(line.order_id, group);
    }
    group.lines.push(line);
    group.itemCount += line.quantity;
    group.totalValue += Number(line.total_price) || 0;
  }
  return [...byOrder.values()];
}
