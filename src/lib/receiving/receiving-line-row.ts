/** `ReceivingLineRow` — the canonical receiving-line row shape returned by /api/receiving-lines and consumed across the… */

/** One materialised `receiving_line_unit` — an *expected physical unit* on the line, with its scanned serial resolved. */
export interface ReceivingLineUnitView {
  /** Durable unit identity — survives serial deletes and ordinal renumbering. */
  id: number;
  /** Display order within the line (1-based). Renumbered on reflow; NOT an identity. */
  ordinal: number;
  /** Linked `serial_units.id`, or null for a not-yet-scanned unit. */
  serial_unit_id: number | null;
  /** The linked serial's number; null when this unit has no serial yet. */
  serial: string | null;
  /** Operator waived the serial for THIS unit. Line-scoped waiver lives on the row. */
  serial_absent: boolean;
  /** Class-D `serial_absent_reason` vocabulary code; null when not waived. */
  serial_absent_reason: string | null;
  /** Per-unit grade that survives reload (durable home for today's local pendingGrade). */
  condition_grade: string | null;
}

/**
 * One physical unit's fast Receiving status. This is the browser-safe wire
 * shape of `receiving_unit_stage_facts`; event tables remain the source of
 * truth and list surfaces read this projection in one batch.
 */
export interface ReceivingUnitStageFactView {
  receiving_line_unit_id: number;
  receiving_line_id: number;
  receiving_id: number | null;
  ordinal: number;
  serial_unit_id: number | null;
  unit_uid: string | null;
  serial: string | null;
  condition_grade: string | null;
  triage_state: 'NOT_STARTED' | 'TRIAGED';
  label_state: 'MISSING' | 'PRINTED';
  qc_state: 'PENDING' | 'TEST_AGAIN' | 'PASSED' | 'FAILED';
  latest_verdict: string | null;
  tested_at: string | null;
  tested_by: number | null;
  tested_by_name: string | null;
  primary_support_ticket_id: number | null;
  updated_at: string;
}

/** One open investigation / claim exception a filed ticket recorded (`ticket_reasons`). */
export interface TicketReason {
  /** A `RECEIVING_EXCEPTION_CODES` value (investigation or claim family). */
  code: string;
  /** The ticket that recorded it ("#<id>"); null = flagged without a ticket. */
  ticket: string | null;
}

export interface ReceivingLineRow {
  id: number;
  receiving_id: number | null;
  /** Real `shipping_tracking_numbers.id` for a shipment-anchored delivered-unscanned row (no receiving_line). */
  shipment_ref?: number | null;
  /** Client-minted identity for an OPTIMISTIC scan row (the triage "importing" stub). */
  client_event_id?: string;
  tracking_number: string | null;
  /** Legacy Zoho PO reference#/tracking text on the line (pickup placeholder detection). */
  zoho_reference_number?: string | null;
  tracking_source?: 'shipment' | 'receiving' | 'zoho_reference' | null;
  carrier: string | null;
  shipment_status?: string | null;
  is_delivered?: boolean;
  delivered_at?: string | null;
  zoho_item_id: string | null;
  zoho_line_item_id: string | null;
  zoho_purchase_receive_id: string | null;
  zoho_purchaseorder_id: string | null;
  zoho_purchaseorder_number: string | null;
  item_name: string | null;
  /** The Zoho item's own title (items.name, canonical product SoT). ALWAYS preferred for display — the PO line's item_name is a listing-style per-receipt title, not the product title. Null only when the line has no Zoho item. */
  zoho_item_title?: string | null;
  /** Canonical Zoho catalog title (sku_catalog.product_title), joined by SKU. Prefer over item_name for display; null when the SKU isn't catalogued yet. */
  catalog_product_title?: string | null;
  /** Canonical sku_catalog.id for this line's SKU. Keys the SKU pairing surface; null when the SKU isn't catalogued yet. */
  sku_catalog_id?: number | null;
  sku: string | null;
  quantity_received: number;
  quantity_expected: number | null;
  qa_status: string;
  workflow_status: string | null;
  disposition_code: string;
  condition_grade: string;
  disposition_audit: unknown[];
  needs_test: boolean;
  assigned_tech_id: number | null;
  zoho_sync_source: string | null;
  zoho_last_modified_time: string | null;
  zoho_synced_at: string | null;
  receiving_type: string | null;
  /** Unfound-line intake classification (receiving_lines.intake_type): po | return | trade_in. Null on Zoho-matched lines. */
  intake_type?: string | null;
  /** Operator platform override on a manually-added unfound line (receiving_lines.source_platform_pill). Null on Zoho-matched lines. */
  source_platform_pill?: string | null;
  /**
   * Carton-level DEFAULT receiving type (receiving.intake_type): PO|RETURN|TRADE_IN.
   * The carton pill edits this; receiving_type above overrides per line.
   * Effective line type = receiving_type ?? carton_intake_type ?? 'PO'. Migration 2026-06-13b.
   */
  carton_intake_type?: string | null;
  /** Operator's durable per-item note. Never printed — the printed face is `label_note`. 2026-07-31. */
  notes: string | null;
  /** Printed label face center text for this line (carton face center / As Listed disclosure).
   *  Split out of `notes` so an item note can be written without printing it. 2026-07-31. */
  label_note?: string | null;
  /** Zoho PO line description (read-only import); shown in the Zoho Notes tab. 2026-06-24. */
  zoho_notes?: string | null;
  /** Zoho PO line unit cost (read-only mirror of Zoho line.rate); pg numeric → string. 2026-06-24. */
  unit_price?: string | null;
  /** Carton-level support notes from `receiving.support_notes` (same for all lines on the package). */
  receiving_support_notes?: string | null;
  /** Carton-level OVERALL Zoho PO note (`receiving.zoho_notes`, from the Zoho PO header).
   *  The Zoho Notes tab's primary content; distinct from the per-line `zoho_notes` (item desc). */
  receiving_zoho_notes?: string | null;
  /** Carton-level listing URL from `receiving.listing_url` (same for all lines on the package). */
  receiving_listing_url?: string | null;
  /** Line-level listing URL from `receiving_line.listing_url`. */
  listing_url?: string | null;
  /** RETURN "check for" reason: `receiving_line_return.return_reason`, else carton `receiving.return_reason`. */
  return_reason?: string | null;
  /** Marketplace RMA / return id (`receiving_line_return.rma_ref`). */
  return_rma_ref?: string | null;
  /** Original sale order # the return came back against (`receiving_line_return.source_order_id`). */
  return_source_order_id?: string | null;
  /** Derived faceted bucket for `view=incoming` — computed on read from the carrier status on shipping_tracking_numbers (DELIVERED_UNOPENED,… */
  delivery_state?:
    | 'DELIVERED_UNOPENED'
    | 'DELIVERED_NOT_UNBOXED'
    | 'ARRIVING_TODAY'
    | 'STALLED'
    | 'IN_TRANSIT'
    | 'TRACKING_UNAVAILABLE'
    | 'PENDING_CARRIER'
    | 'CARRIER_MISMATCH'
    | 'AWAITING_TRACKING'
    | 'WRONG_DESTINATION'
    | 'RECEIVED'
    | 'UNKNOWN'
    | null;
  /** Carrier last event timestamp (Incoming). */
  shipment_latest_event_at?: string | null;
  /** Last successful carrier poll (Incoming). */
  shipment_last_checked_at?: string | null;
  /** Latest carrier event city (Incoming). */
  shipment_latest_event_city?: string | null;
  /** Latest carrier event postal (Incoming) — wrong-destination compare. */
  shipment_latest_event_postal?: string | null;
  /** True when delivered event postal ≠ warehouse ship-from. */
  wrong_destination?: boolean;
  /**
   * Tracking provenance for Incoming chips:
   * - `carrier_confirmed` — STN has been polled (last_checked_at or status)
   * - `seller_reported` — tracking text present but carrier never answered
   */
  tracking_confidence?: 'carrier_confirmed' | 'seller_reported' | null;
  /** Zoho PO date (`zoho_po_mirror.po_date`) — when the buyer authored the PO upstream (Incoming view only). */
  po_date?: string | null;
  /** Vendor-promised delivery date from zoho_po_mirror (Incoming view only). */
  expected_delivery_date?: string | null;
  /** Vendor name from zoho_po_mirror (Incoming views + History `view=activity`). */
  vendor_name?: string | null;
  /** `view=exceptions` — why the line needs a person (`IncomingExceptionCode`). */
  exception_code?: string | null;
  /** `view=exceptions` — the org ship-from ZIP5 the wrong-destination arm compared against. */
  warehouse_postal?: string | null;
  /**
   * Hours-since-delivered SLA band for the delivered-unscanned hunt queue
   * (`lt_24h` | `h24_48` | `gt_48h`). Set on synthetic shipment rows only.
   */
  delivered_age_band?: 'lt_24h' | 'h24_48' | 'gt_48h' | null;
  /** eBay claim deadline (civil date, `YYYY-MM-DD`) — the date after which an item-not-received can no longer be filed. */
  claim_by_date?: string | null;
  /** Universal Incoming purchase identity (receiving_lines spine cache; Incoming view only). */
  inbound_source_type?: string | null;
  source_order_id?: string | null;
  platform_account_id?: number | null;
  platform_account_label?: string | null;
  /** Zoho PO mirror status (`zoho_po_mirror.status`) — incoming + scanned views. */
  zoho_status?: string | null;
  /** When the PO mirror last synced (`zoho_po_mirror.last_synced_at`) — the age of {@link zoho_status}, disclosed by the `zoho` chip's tooltip. */
  zoho_status_synced_at?: string | null;
  /** view=incoming_removed only — signals for {@link resolveIncomingRemovalReason}. */
  removed_written_off?: boolean;
  removed_aged_out?: boolean;
  removed_at?: string | null;
  created_at: string | null;
  /** Last write to the line row itself (qty bump, condition, notes, …).
   *  Drives the unbox rail's sort + time label (sort=unbox_activity). */
  updated_at?: string | null;
  /** Most-recent scan/receive time. Server sorts view=recent/all by this. */
  last_activity_at?: string | null;
  /** Latest verdict time in the active Testing History scope (tester + week). */
  tested_at?: string | null;
  /** Door-scan ("scanned at") timestamp — receiving.received_at (view=recent/all/received). */
  received_at?: string | null;
  /** Staff who recorded the door scan (receiving.received_by → staff.name). */
  received_by_name?: string | null;
  /** Unbox timestamp — receiving.unboxed_at; null until the carton is unboxed. */
  unboxed_at?: string | null;
  /** Terminal "Received" (DONE) transition time — receiving_lines.received_done_at;
   *  null until the line is fully received. Distinct from received_at (door scan). */
  received_done_at?: string | null;
  /** Moment the carton was first opened on the Unbox surface (receiving.unbox_opened_at, or the UNBOX_SCAN_OPENED ops_event). */
  unbox_opened_at?: string | null;
  /**
   * When this staffer last opened the line on Quality Control
   * (`receiving_line_testing_opens.opened_at`). QC Recent rail age + sort axis.
   * Null on other views.
   */
  testing_opened_at?: string | null;
  /** Staff who unboxed (receiving.unboxed_by → staff.name). */
  unboxed_by_name?: string | null;
  /** Staff who first opened the carton in Unbox; fallback actor when completion did not stamp `unboxed_by`. */
  unbox_opened_by_name?: string | null;
  /** First tracking scan time (receiving_scans, earliest). */
  scanned_at?: string | null;
  /** Staff who first scanned the tracking (receiving_scans.scanned_by → staff.name). */
  scanned_by_name?: string | null;
  /** Count of recorded testing verdicts for this line (view=testing and view=testing_opened; null on other views). */
  tested_count?: number | null;
  image_url: string | null;
  source_platform: string | null;
  /** Shared unbox/test urgency flag (receiving.is_priority) — rank-0 in the Prioritize sort. */
  is_priority?: boolean | null;
  /** Manual priority-tier override (receiving.priority_tier): null = Auto, 0..3 = Priority/High/Medium/Low. */
  priority_tier?: number | null;
  /**
   * receiving.source — 'zoho_po' | 'unmatched' | 'local_pickup'.
   * Drives which workspace variant mounts (LineEditPanel vs UnfoundLineEditPanel).
   * Optional so callers that don't fetch from /api/receiving-lines still typecheck.
   */
  receiving_source?: string | null;
  /**
   * Saved serial_units for this line. `current_status` reflects the
   * unit's lifecycle position (RECEIVED → IN_TEST → TESTED / ON_HOLD …)
   * and drives the per-unit testing verdict pills in the tech workspace.
   */
  serials?: Array<{
    id: number;
    serial_number: string;
    current_status?: string;
    condition_grade?: string | null;
    /** Handling-unit (H-#### tote) this unit currently sits in, if any. */
    handling_unit_id?: number | null;
    /** Minted unit identity; presence = the unit has been labeled at least once. */
    unit_uid?: string | null;
  }> | null;
  /** Materialised per-unit rows for this line (`receiving_line_unit`), ordinal order. */
  units?: ReceivingLineUnitView[] | null;
  /** Fast unit workflow projection, attached only on list surfaces that need it. */
  unit_stage_facts?: ReceivingUnitStageFactView[] | null;
  /** Count of photos attached to this line's carton (from photos table, entity_type='RECEIVING'). */
  photo_count?: number;
  /** Any support ticket on the line, its carton or its shipment, stored as "#<id>". */
  zendesk_ticket?: string | null;
  /** A ticket FILED on this line or carton (`sqlReceivingZendeskTicketColumn`); a shipment mention is not. */
  claim_ticket?: string | null;
  /**
   * What the filed tickets mean: the OPEN investigation / claim exceptions on
   * this line or its carton, oldest first (`ticket_reasons`). Empty = the
   * ticket (if any) carries no reason.
   */
  ticket_reasons?: TicketReason[];
  /** Triage staging shelf/lane — `receiving_triage.staging_location_id`, FK into `locations`. */
  staging_location_id?: number | null;
  /** Joined shelf label (`room · name` or `name`) for Unbox Queue Location column. */
  staging_location_label?: string | null;
  /** Triage priority lane — `receiving_triage.priority_lane` (see triage-lane-policy.ts). */
  priority_lane?: string | null;
  /** Triage pairing-hub outcome — `receiving.pairing_state`: UNFOUND | MATCHED | WAIVED. */
  pairing_state?: string | null;
  /** `receiving.triage_complete` — set by the real "Save for unbox" transition. Not threaded onto every feed yet; see `triage-complete-local` client-tracked fallback. */
  triage_complete?: boolean | null;
  /** `receiving.triage_completed_at` — when the carton was staged/saved for unbox. */
  triage_completed_at?: string | null;
  /** Carton first opened on Unbox with no prior triage door scan. */
  unbox_only_intake?: boolean;
  /** Server stamp when operator explicitly picked condition_grade. */
  condition_set_at?: string | null;
  /** The grading ACT — gate for the Condition procedure step (`receiving_line_testing.condition_graded_at`, 2026-08-01c). */
  condition_graded_at?: string | null;
  /**
   * Carton-level: an operator confirmed the contents against this line list
   * (`receiving_unbox.contents_confirmed_at`). Gate for the Contents step.
   */
  contents_confirmed_at?: string | null;
  /** Server stamp when a receiving label was first printed for this line (Print step). */
  label_printed_at?: string | null;
  /** An operator confirmed they read this line's printed label face (`receiving_line_testing.label_previewed_at`, 2026-08-02). */
  label_previewed_at?: string | null;
  /**
   * Unbox commit `stage` — intended putaway bin stamped on
   * `receiving_line_putaway` after print. Distinct from Arrival
   * `staging_location_id` on the carton triage street.
   */
  staged_at?: string | null;
  staged_location_id?: number | null;
  staged_location_name?: string | null;
  staged_location_barcode?: string | null;
  staged_location_room?: string | null;
  staged_location_row_label?: string | null;
  staged_location_col_label?: string | null;
  /**
   * Bin code AS STAMPED (`receiving_line_putaway.location_code`). History reads
   * this, not the joined live row — renaming a bin must not rewrite what a past
   * putaway says the operator confirmed.
   */
  staged_location_code?: string | null;
  staged_by?: number | null;
  staged_by_name?: string | null;
  /**
   * Operator waived the serial for this line (no serial available — cable / bulk
   * part / return with none). Durable `receiving_line_testing.serial_absent`;
   * completes the Unbox stepper's Serial step alongside a captured serial.
   */
  serial_absent?: boolean;
  /** Class-D `serial_absent_reason` vocabulary code for the waiver; null when not waived. */
  serial_absent_reason?: string | null;
  /**
   * Rail fetcher stamp — line + distinct-SKU counts for adaptive title mode
   * (unbox Recent per-carton; door-scan per-PO). Set client-side only.
   */
  rail_title_context?: {
    line_count: number;
    distinct_sku_count: number;
  };
  /**
   * Org-defined custom field values (def `key` → value), hydrated by
   * `attachCustomFieldsToRows` on browse reads. Absent when none set.
   */
  customFields?: Record<string, string | number | boolean | null>;
}
