import type { Order } from '@/components/station/upnext/upnext-types';
import type { TechRecord } from '@/hooks/useTechLogs';
import type { RefreshDomain } from '@/lib/refresh/domains';

export const SHIPPING_RAIL_REFRESH_EVENTS = ['tech-log-added'] as const;

/** Refresh domains the shipping rail renders (was the two broadcast names). */
export const SHIPPING_RAIL_REFRESH_DOMAINS = ['orders.outbound'] as const satisfies readonly RefreshDomain[];

/** Normalize status so ShippingScanWorkspace opens the post-ship serial-edit path. */
export function normalizeShippedRailStatus(
  status: string | null | undefined,
  isShipped?: boolean | null,
): string {
  const s = String(status || '').trim().toUpperCase();
  if (s === 'SHIPPED' || s === 'SHIPPED_EXT') return s;
  if (isShipped) return 'SHIPPED';
  return s || 'SHIPPED';
}

/** `/api/orders/recent` row (shipped-out slice). */
interface RecentOrderRow {
  id: number;
  order_id: string;
  product_title: string;
  item_number: string | null;
  sku: string;
  quantity: string | number | null;
  account_source: string | null;
  condition: string | null;
  tracking_number: string | null;
  is_shipped: boolean;
  status: string | null;
  ship_by_date: string | null;
  ship_confirmed_at: string | null;
  created_at: string;
}

type ShippedHistoryRow = Order & { ship_confirmed_at: string | null };

/** Map `/api/orders/recent` → rail Order (personal last-N ship-outs). */
export function recentOrderToShippedRow(row: RecentOrderRow): ShippedHistoryRow {
  return {
    id: Number(row.id),
    ship_by_date: row.ship_by_date ?? null,
    created_at: row.created_at ?? null,
    order_id: String(row.order_id || ''),
    product_title: String(row.product_title || ''),
    item_number: row.item_number ?? null,
    account_source: row.account_source ?? null,
    sku: String(row.sku || ''),
    condition: row.condition ?? null,
    quantity: row.quantity != null ? String(row.quantity) : null,
    status: normalizeShippedRailStatus(row.status, row.is_shipped),
    shipping_tracking_number: String(row.tracking_number || ''),
    is_out_of_stock: false,
    tester_id: null,
    tester_name: null,
    has_tech_scan: false,
    is_shipped: true,
    ship_confirmed_at: row.ship_confirmed_at ?? null,
  };
}

/** Map a History {@link TechRecord} → rail preview `Order` shape. */
export function techRecordToPreviewOrder(record: TechRecord): Order {
  return {
    id: Number(record.order_db_id ?? record.id),
    ship_by_date: record.ship_by_date ?? null,
    created_at: record.created_at ?? null,
    order_id: String(record.order_id || ''),
    product_title: String(record.product_title || ''),
    item_number: record.item_number ?? null,
    account_source: record.account_source ?? null,
    sku: String(record.sku || ''),
    condition: record.condition ?? null,
    quantity: record.quantity != null ? String(record.quantity) : null,
    status: normalizeShippedRailStatus(record.status, record.is_shipped),
    shipping_tracking_number: String(record.shipping_tracking_number || ''),
    is_out_of_stock: Boolean(record.is_out_of_stock),
    tester_id: record.tested_by ?? null,
    tester_name: null,
    has_tech_scan: true,
    is_shipped: Boolean(record.is_shipped),
  };
}

/** Rail row id — aligns preview selection with order_db_id when present. */
export function techRecordRailId(record: TechRecord): number {
  return Number(record.order_db_id ?? record.id);
}
