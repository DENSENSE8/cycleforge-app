// Leaf type-kernel for order rows.
import type { PriceSource } from '@/lib/orders/price-resolve';
import type { OutboundHandlingFact } from '@/lib/shipping/outbound-handling-facts';
import type { OutboundStorageLocation } from '@/lib/shipping/outbound-storage-path';
import type { CustomerBillTo, CustomerRecord } from '@/lib/customers/customer-display';
import type { OrderExceptionBlocker } from '@/lib/orders/order-exception-types';

export interface ShippedOrder {
  id: number;
  deadline_at?: string | null;
  ship_by_date?: string | null;
  /** Channel-placed date (ISO). Seeds the DATES top line. */
  order_date?: string | null;
  order_id: string;
  product_title: string;
  quantity?: string | null;
  item_number?: string | null;
  condition: string;
  shipment_id?: number | string | null;
  shipping_tracking_number?: string | null;
  tracking_numbers?: string[] | null;
  tracking_number_rows?: Array<{
    shipment_id: number | null;
    tracking: string;
    is_primary: boolean;
  }> | null;
  serial_number: string; // Aggregated from tech_serial_numbers
  sku: string;
  /**
   * QC actor. `/api/orders`: `testing_results.tested_by` of the latest bench
   * verdict on a unit allocated to this order. Shipped feeds: the
   * `tech_serial_numbers` serial scanner.
   */
  tested_by: number | null;
  test_date_time: string | null;   // aliased from tsn.created_at
  /** When {@link tested_by} recorded that verdict (`testing_results.created_at` on `/api/orders`). */
  test_activity_at?: string | null;
  /** The latest unit verdict behind {@link tested_by}; null when no allocated unit was ever tested. */
  qc_verdict?: 'PASS' | 'TEST_AGAIN' | 'TESTING_FAILED' | null;
  /** The verdict predates the order (`testing_results.created_at < orders.created_at`): a pre-tested unit pulled from stock. */
  qc_inherited?: boolean;
  /** QC assignee: assigned_tech_id of the origin receiving line of a unit allocated to this order (receiving_line_testing). */
  qc_assignee_id?: number | null;
  qc_assignee_name?: string | null;
  /** Staff ID assigned to the order's PICK work_assignment (`WA_PICK_LATERAL`). */
  picker_id?: number | null;
  picker_name?: string | null;
  /** Assigned picker `staff.color_hex`. */
  picker_color_hex?: string | null;
  /**
   * Pick actor — first of: inventory_events.actor_staff_id (PICKED / FORCE_PICK),
   * picking_sessions.picker_staff_id, the Picker desk's PICK / PICK_SCANNED scan.
   */
  picked_by?: number | null;
  picked_by_name?: string | null;
  picked_at?: string | null;       // the same arm's timestamp
  /** Staff ID assigned to pack — sourced from work_assignments.assigned_packer_id */
  packer_id: number | null;
  packed_by: number | null;
  packed_at: string | null;        // packer_logs.created_at (scan timestamp)
  /** `DOCK_STAGED` station event; physical dock proof, separate from packing. */
  dock_staged_at?: string | null;
  /** Live, allocated unit locations; never a guessed first-bin display value. */
  storage_locations?: OutboundStorageLocation[] | null;
  /**
   * The SKU's home bin (`sku_stock.location`) — where it is picked from while
   * nothing is allocated. Never outranks `storage_locations` on the record.
   */
  sku_home_location?: OutboundStorageLocation | null;
  /** The SKU's on-hand count (`SUM(sku_stock.stock)`); null when the SKU has no stock row. */
  sku_stock_on_hand?: number | null;
  /** Server-derived allocation progress for the mobile Orders roster. */
  allocated_unit_count?: number | null;
  picked_unit_count?: number | null;
  /** Catalog-owned physical handling requirements; unknown API input is normalized at the row boundary. */
  catalog_handling_flags?: OutboundHandlingFact[] | null;
  pack_activity_at?: string | null;
  /** SHIP_CONFIRM station_activity_logs.created_at — when it was scanned out at the dock. */
  ship_confirmed_at?: string | null;
  /** SHIP_CONFIRM station_activity_logs.staff_id — who scanned it out at the dock. */
  shipped_out_by?: number | null;
  shipped_out_by_name?: string | null;
  /** Pre-box facts (`PREBOX_FACTS_LATERAL`): */
  prebox_unit_count?: number | null;
  pre_boxed_count?: number | null;
  pre_boxed_by_name?: string | null;
  pre_boxed_at?: string | null;
  /** Current packing-bench placement (`order_pack_placements` → `locations`), selected on EVERY orders row by `/api/orders`. */
  pack_location_id?: number | null;
  pack_location_name?: string | null;
  pack_location_kind?: string | null;
  packer_photos_url: any;
  tracking_type: string | null;
  account_source: string | null;
  /** Operator-set admin page link (`orders.admin_url`); wins over the derived marketplace URL. */
  admin_url?: string | null;
  /**
   * Phase-5 governing-event READ projections (denormalized from audit_logs onto
   * `orders`): first-time-only stamps of when tracking was added / a label was
   * printed. Drive the row's TRK/LBL "done" dots. audit_logs stays the SoR.
   */
  tracking_added_at?: string | null;
  label_printed_at?: string | null;
  /** Legacy single overwritable annotation on `orders`. */
  notes: string;
  /** Operator-set triage tag that tints this row, org-wide, plus who set it and when. */
  row_flag?: { flag: string | null; by: string | null; at: string | null } | null;
  /** How many `order_notes` entries this order has. Drives the row indicator. */
  note_count?: number | null;
  sale_amount?: string | number | null;
  currency?: string | null;
  /* Resolved display price — one number per line, plus its provenance. */
  /** Integer cents. Null = nothing priced this line; render a dash, not $0. */
  price_cents?: number | null;
  /** ISO-4217; 'USD' when the row stored no currency. */
  price_currency?: string;
  /** Which fact won: realised sale, allocated unit, channel listing, or none. Full list shape only (absent on `listShape=queue`). */
  price_source?: PriceSource;
  /** The channel that priced it — null for a sold price and for a unit price. */
  price_platform?: string | null;
  /** True when this is an ASK, not revenue. Surfaces must mark it (≈). */
  price_is_estimate?: boolean;
  status_history: any;
  /** Derived from shipping_tracking_numbers carrier status — not stored on orders */
  is_shipped?: boolean;
  /** Operator blocked the line — `orders.is_out_of_stock`. */
  is_out_of_stock?: boolean;
  /** Shortage kind — listing / kit / catalog child / other Zoho item. */
  oos_kind?: 'listing' | 'kit_part' | 'catalog_child' | 'catalog_other' | null;
  /** Short SKU (listing or component). */
  oos_sku?: string | null;
  oos_sku_catalog_id?: number | null;
  /** `sku_kit_parts.id` when `oos_kind === 'kit_part'`. */
  oos_kit_part_id?: number | null;
  oos_qty_short?: number | string | null;
  /** Hover-card title — listing title or component name. */
  oos_title?: string | null;
  /** Zoho `items.zoho_item_id` for the short product (denorm of order_line_shortages). */
  oos_zoho_item_id?: string | null;
  replenishment_status?: string | null;
  replenishment_po_number?: string | null;
  shortage_link_status?: string | null;
  /** Operator-marked urgent. */
  is_urgent?: boolean;
  /** Catalog FK — present on the live `/api/orders` queue projection. */
  sku_catalog_id?: number | null;
  /** Catalog listing image from `sku_catalog.image_url` (orders queue join). */
  catalog_image_url?: string | null;
  /** Catalog product family from `sku_catalog.category` (orders queue join). */
  catalog_category?: string | null;
  shipment_status?: string | null;
  latest_status_code?: string | null;
  latest_status_label?: string | null;
  latest_status_description?: string | null;
  latest_status_category?: string | null;
  is_delivered?: boolean;
  carrier?: string | null;
  latest_event_at?: string | null;
  has_exception?: boolean | null;
  /** Carrier ETA (primary shipment), null once delivered. */
  estimated_delivery_at?: string | null;
  delivered_at?: string | null;
  exception_at?: string | null;
  is_terminal?: boolean | null;
  created_at: string | null;
  tested_by_name?: string | null;
  packed_by_name?: string | null;
  packer_name?: string | null;
  /** Assigned packer `staff.color_hex` (work_assignments.assigned_packer_id). */
  packer_color_hex?: string | null;
  /** `packer_logs.id` for DELETE; from packerlogs API join. */
  packer_log_id?: number | null;
  /** Latest `pack_verification_events.outcome` for this packer_log (Review hydrate). */
  verification_outcome?: string | null;
  /** `station_activity_logs.id` when delete has no packer_logs row (e.g. some FBA scans). */
  station_activity_log_id?: number | null;
  /** The `orders.id` a Shipped package row resolved to (`packer-logs-week` `o.id AS order_row_id`); null when the scan matched no order line… */
  order_row_id?: number | null;
  /** FK to customers — linked buyer (e.g. Amazon MFN shipping contact). */
  customer_id?: number | null;
  /**
   * The linked customer-book row (`orders.customer_id → customers`, org-scoped),
   * joined by `/api/orders`. Null when unlinked; absent on reads without the join.
   */
  customer?: CustomerRecord | null;
  /**
   * The paired ShipStation order's ship-to (`shipstation_order_refs.ship_to`,
   * same keys as {@link CustomerBillTo}), joined by `/api/orders` only when the
   * order has no `customer_id`. Absent on reads without the join.
   */
  shipstation_ship_to?: CustomerBillTo | null;
  /** Marketplace buyer checkout note (`orders.buyer_note`, migration 2026-07-03p). */
  buyer_note?: string | null;
  /** Who moves it out: Amazon 'AFN' (FBA) | 'MFN', or 'PICKUP' (counter pickup, no label). Null = we ship it. */
  fulfillment_channel?: string | null;
  row_source?: 'order' | 'exception';
  exception_reason?: string | null;
  exception_status?: string | null;
  fnsku?: string | null;
  fnsku_log_id?: number | null;
  /** SAL row id — single source of truth anchor for this scan session. */
  sal_id?: number | null;
  /**
   * A HELD order's release facts — set only by `exceptionRowToQueueRow` (the
   * Exceptions desk); read through `resolveOrdersHoldValue`, never ad hoc.
   */
  hold?: {
    category: string;
    owner: string;
    action: string;
    blockers: readonly OrderExceptionBlocker[];
    /** Other unpaired orders on this item number — one pairing releases them too. */
    siblingUnpairedCount: number;
  } | null;
}
