// Leaf type-kernel for order rows. Dependency-free by design: low-layer modules
// (utils/*, hooks/*) import these row shapes WITHOUT pulling in the heavy
// query module (lib/neon/orders-queries → db). lib/neon/orders-queries
// re-exports ShippedOrder from here so its existing callers are unaffected.

export interface ShippedOrder {
  id: number;
  deadline_at?: string | null;
  ship_by_date?: string | null;
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
  /** Staff ID assigned to test — sourced from work_assignments.assigned_tech_id */
  tester_id: number | null;
  tested_by: number | null;
  test_date_time: string | null;   // aliased from tsn.created_at
  test_activity_at?: string | null;
  next_test_activity_at?: string | null;
  /** Staff ID assigned to pack — sourced from work_assignments.assigned_packer_id */
  packer_id: number | null;
  packed_by: number | null;
  packed_at: string | null;        // packer_logs.created_at (scan timestamp)
  pack_activity_at?: string | null;
  /** SHIP_CONFIRM station_activity_logs.created_at — when it was scanned out at the dock. */
  ship_confirmed_at?: string | null;
  /** SHIP_CONFIRM station_activity_logs.staff_id — who scanned it out at the dock. */
  shipped_out_by?: number | null;
  shipped_out_by_name?: string | null;
  next_pack_activity_at?: string | null;
  /**
   * Current packing-bench placement (`order_pack_placements` → `locations`),
   * selected on EVERY orders row by `/api/orders`. Declared here so the grid
   * cell and the `?packStation=` board filter stop casting the row inline —
   * both did, which is how a field on the wire stayed invisible to the type.
   * Null when the order is not staged at a bench.
   */
  pack_location_id?: number | null;
  pack_location_name?: string | null;
  pack_location_kind?: string | null;
  pack_duration?: string | null;
  test_duration?: string | null;
  packer_photos_url: any;
  tracking_type: string | null;
  account_source: string | null;
  /**
   * Phase-5 governing-event READ projections (denormalized from audit_logs onto
   * `orders`): first-time-only stamps of when tracking was added / a label was
   * printed. Drive the row's TRK/LBL "done" dots. audit_logs stays the SoR.
   */
  tracking_added_at?: string | null;
  label_printed_at?: string | null;
  /**
   * Legacy single overwritable annotation on `orders`. Superseded by the
   * append-only `order_notes` trail (see {@link ShippedOrder.note_count}) —
   * kept because station rows still render it, but new writes belong on the
   * trail, where they keep an author and a timestamp.
   */
  notes: string;
  /**
   * Operator-set triage tag that tints this row, org-wide, plus who set it and
   * when. `null` when unflagged. Vocabulary + presentation:
   * `src/lib/orders/order-row-flags.ts` — an id this build does not know
   * resolves to no tint rather than an arbitrary colour.
   */
  row_flag?: { flag: string | null; by: string | null; at: string | null } | null;
  /** How many `order_notes` entries this order has. Drives the row indicator. */
  note_count?: number | null;
  sale_amount?: string | number | null;
  currency?: string | null;
  status_history: any;
  /** Derived from shipping_tracking_numbers carrier status — not stored on orders */
  is_shipped?: boolean;
  /** Operator blocked the line — `orders.is_out_of_stock`. */
  is_out_of_stock?: boolean;
  /**
   * Operator expedite toggle (`orders.is_urgent`). Declared on the leaf row
   * type because the QUEUE ORDER reads it — urgent rows lead the fulfillment
   * board (`useOrdersQueueRows` / `queueUrgentRank`) — and an ordering fact
   * that only exists behind a cast is one refactor away from being dropped.
   */
  is_urgent?: boolean;
  /**
   * Backorder coverage facts (PO / inbound tracking / ETA). Painted only via
   * {@link formatShortageCoverage} — never concatenate in a cell.
   */
  shortage_coverage?: {
    po_number?: string | null;
    inbound_tracking?: string | null;
    eta?: string | null;
  } | null;
  /** Catalog listing image from `sku_catalog.image_url` (orders queue join). */
  catalog_image_url?: string | null;
  shipment_status?: string | null;
  latest_status_code?: string | null;
  latest_status_label?: string | null;
  latest_status_description?: string | null;
  latest_status_category?: string | null;
  is_delivered?: boolean;
  carrier?: string | null;
  latest_event_at?: string | null;
  has_exception?: boolean | null;
  exception_at?: string | null;
  is_terminal?: boolean | null;
  created_at: string | null;
  /**
   * When the CUSTOMER placed the order, from the channel (`orders.order_date`,
   * written by the eBay / Amazon syncs). Null on anything that never carried
   * one — a manual row, a CSV import, a backfill — where `created_at` (the
   * import stamp) is the only date there is. The compound DATES cell falls back
   * to it and says so in the tooltip; the two are never conflated.
   */
  order_date?: string | null;
  tested_by_name?: string | null;
  packed_by_name?: string | null;
  tester_name?: string | null;
  packer_name?: string | null;
  /** Assigned picker `staff.color_hex` (work_assignments.assigned_tech_id). */
  tester_color_hex?: string | null;
  /** Assigned packer `staff.color_hex` (work_assignments.assigned_packer_id). */
  packer_color_hex?: string | null;
  /** `packer_logs.id` for DELETE; from packerlogs API join. */
  packer_log_id?: number | null;
  /** Latest `pack_verification_events.outcome` for this packer_log (Review hydrate). */
  verification_outcome?: string | null;
  /** `station_activity_logs.id` when delete has no packer_logs row (e.g. some FBA scans). */
  station_activity_log_id?: number | null;
  /** FK to customers — linked buyer (e.g. Amazon MFN shipping contact). */
  customer_id?: number | null;
  /**
   * Marketplace buyer checkout note (`orders.buyer_note`, migration 2026-07-03p).
   * Mirrored raw by the channel sync and projected into `entity_signals`; this
   * is the display path onto the order record. Present on `SELECT *` reads
   * (`getOrderById`); absent from leaner queue projections, so every consumer
   * must render it presence-driven.
   */
  buyer_note?: string | null;
  /** Amazon fulfillment channel: 'AFN' (FBA) | 'MFN'. Null for non-Amazon. */
  fulfillment_channel?: string | null;
  row_source?: 'order' | 'exception';
  exception_reason?: string | null;
  exception_status?: string | null;
  fnsku?: string | null;
  fnsku_log_id?: number | null;
  /** SAL row id — single source of truth anchor for this scan session. */
  sal_id?: number | null;
}
