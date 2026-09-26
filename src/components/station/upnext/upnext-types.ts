/**
 * Shared order / FBA plan shapes used by live shipping + FBA sidebar surfaces.
 * (Legacy UpNext queue item types were removed with the orphan UpNext tree.)
 */

/** Open FBA plan row for the /fba workspace sidebar. */
export interface FbaPlanQueueItem {
  /** Internal DB id (`fba_shipments.id`) — distinct from {@link shipment_ref}. */
  id: number;
  /** Plan code shown to staff (`fba_shipments.shipment_ref`). */
  shipment_ref: string;
  due_date: string | null;
  total_items: number;
  total_expected_qty: number;
  ready_item_count: number;
  shipped_item_count: number;
  created_by_name: string | null;
  created_at: string;
  amazon_shipment_id?: string | null;
  tracking_numbers?: { tracking_number: string; carrier: string; label?: string | null }[];
}

export interface Order {
  id: number;
  ship_by_date: string | null;
  created_at: string | null;
  order_id: string;
  product_title: string;
  item_number: string | null;
  account_source: string | null;
  sku: string;
  condition?: string | null;
  quantity?: string | null;
  status: string;
  shipping_tracking_number: string;
  /** orders.is_out_of_stock — operator blocked/OOS flag. */
  is_out_of_stock?: boolean;
  /** @deprecated Prefer is_out_of_stock. */
  out_of_stock?: string | null;
  /** Staff id from work_assignments; null means unassigned (visible to all techs) */
  tester_id?: number | null;
  /** Display name of the assigned tester */
  tester_name?: string | null;
  /** PACK work_assignment (realtime may populate before next /api/orders/next fetch) */
  packer_id?: number | null;
  packer_name?: string | null;
  /** True when a tech_serial_numbers scan exists for this shipment_id (order already processed) */
  has_tech_scan?: boolean;
  /** Derived from shipping_tracking_numbers carrier status */
  is_shipped?: boolean;
}
