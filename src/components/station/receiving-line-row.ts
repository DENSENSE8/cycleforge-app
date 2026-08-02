/**
 * `ReceivingLineRow` — the canonical receiving-line row shape returned by
 * /api/receiving-lines and consumed across the receiving/station/sidebar UI.
 *
 * Extracted out of `ReceivingLinesTable.tsx` into this leaf module so that
 * low-level utilities (e.g. `utils/events.ts`) and lib helpers can reference
 * the type WITHOUT importing the heavy table component — which previously
 * created import cycles (utils → component → … → utils). `ReceivingLinesTable`
 * re-exports this type for backwards compatibility, so existing importers are
 * unaffected.
 */
/**
 * One materialised `receiving_line_unit` — an *expected physical unit* on the
 * line, with its scanned serial resolved. The wire shape both
 * /api/receiving-lines and /api/receiving/:id emit, built by the single reader
 * `fetchLineUnits` (src/lib/receiving/ensure-line-units.ts) so the two
 * endpoints cannot drift.
 *
 * Note the two `serial_absent` scopes, which are NOT interchangeable:
 * `ReceivingLineRow.serial_absent` waives the WHOLE line
 * (`receiving_line_testing`); this one waives THIS unit only. Both are live —
 * see the precedence rule in derive-receiving-step-states.ts.
 *
 * Plan: docs/todo/per-unit-no-serial-EXECUTION-PROMPT.md §3.
 */
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

export interface ReceivingLineRow {
  id: number;
  receiving_id: number | null;
  /**
   * Real `shipping_tracking_numbers.id` for a shipment-anchored delivered-unscanned
   * row (no receiving_line). The row's `id` is a negative, collision-free React key
   * only — recover the true shipment id from THIS field, never by decoding `id`
   * (see `shipmentIdFromDeliveredUnscannedRow`). Null on every line-anchored row.
   */
  shipment_ref?: number | null;
  /**
   * Client-minted identity for an OPTIMISTIC scan row (the triage "importing"
   * stub). Carries across the stub → resolved-row reconcile so the sidebar rail
   * keys both renders by the same value (see SidebarRailShell `getReconcileId`)
   * and updates the row IN PLACE instead of unmount+remount. Absent on every
   * server-fetched row — those fall back to keying by `id`.
   */
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
  /**
   * Derived faceted bucket for `view=incoming` — computed on read from the
   * carrier status on shipping_tracking_numbers (DELIVERED_UNOPENED,
   * ARRIVING_TODAY, STALLED, IN_TRANSIT, PENDING_CARRIER, AWAITING_TRACKING).
   * Null on other views.
   */
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
  /** Vendor name from zoho_po_mirror (Incoming view only). */
  vendor_name?: string | null;
  /**
   * Hours-since-delivered SLA band for the delivered-unscanned hunt queue
   * (`lt_24h` | `h24_48` | `gt_48h`). Set on synthetic shipment rows only.
   */
  delivered_age_band?: 'lt_24h' | 'h24_48' | 'gt_48h' | null;
  /**
   * eBay claim deadline (civil date, `YYYY-MM-DD`) — the date after which an
   * item-not-received can no longer be filed. A SECOND, external clock, distinct
   * from `delivered_age_band`: it expires whether or not the warehouse acts. Set
   * on delivered-not-unboxed rows sourced from eBay; null everywhere else.
   */
  claim_by_date?: string | null;
  /**
   * Universal Incoming purchase identity (receiving_lines spine cache; Incoming
   * view only). `inbound_source_type` badges the row's source ('zoho' | 'ebay' | …);
   * `source_order_id` is the external order id (the eBay order#) shown when the
   * line has no Zoho PO; `platform_account_*` name the buyer/storefront account
   * the purchase was made on. Null on plain Zoho lines / other views.
   */
  inbound_source_type?: string | null;
  source_order_id?: string | null;
  platform_account_id?: number | null;
  platform_account_label?: string | null;
  /**
   * Zoho PO mirror status (`zoho_po_mirror.status`) — incoming + scanned views.
   * Phase 2: when terminal (received/closed/billed/cancelled) the row is badged
   * "Zoho: received" instead of being hidden, so a physically-present box stays
   * actionable while the financial-state mismatch is visible.
   */
  zoho_status?: string | null;
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
  /** Moment the carton was first opened on the Unbox surface
   *  (receiving.unbox_opened_at, or the UNBOX_SCAN_OPENED ops_event). This is the
   *  unbox rail's time-label + sort axis — the SAME value the right-pane Overview
   *  shows as "Opened for unbox". Distinct from received_at (door scan) and
   *  scanned_at (first physical scan). Null until the carton is opened in Unbox. */
  unbox_opened_at?: string | null;
  /** Staff who unboxed (receiving.unboxed_by → staff.name). */
  unboxed_by_name?: string | null;
  /** First tracking scan time (receiving_scans, earliest). */
  scanned_at?: string | null;
  /** Staff who first scanned the tracking (receiving_scans.scanned_by → staff.name). */
  scanned_by_name?: string | null;
  /**
   * Count of recorded testing verdicts for this line (view=testing only;
   * null on other views). Scoped to the tester when the feed is. Drives the
   * Testing rail's "tested k/N" without re-deriving from workflow_status.
   */
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
  /**
   * Materialised per-unit rows for this line (`receiving_line_unit`), ordinal
   * order. Present only on the `?include=serials` reads that resolve them;
   * **optional through Phase 3** so every existing consumer keeps compiling and
   * the `serials[]` path above stays the live one until Phase 4 retires it.
   *
   * Empty array = the line has been read but has nothing to materialise (qty 0
   * / unfound placeholder). `undefined` = this response didn't resolve units.
   */
  units?: ReceivingLineUnitView[] | null;
  /** Count of photos attached to this line's carton (from photos table, entity_type='RECEIVING'). */
  photo_count?: number;
  /** Filed Zendesk ticket # for this line (receiving_lines.zendesk_ticket), stored as "#<id>". */
  zendesk_ticket?: string | null;
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
  /**
   * The grading ACT — gate for the Condition procedure step
   * (`receiving_line_testing.condition_graded_at`, 2026-08-01c). Distinct from
   * `condition_set_at`, which is the COALESCE-once first-set stamp and survives
   * a reopen; this one is cleared by one. `condition_grade` is NOT NULL with a
   * default, so it exists on an untouched line and can never be the gate.
   */
  condition_graded_at?: string | null;
  /**
   * Carton-level: an operator confirmed the contents against this line list
   * (`receiving_unbox.contents_confirmed_at`). Gate for the Contents step.
   */
  contents_confirmed_at?: string | null;
  /** Server stamp when a receiving label was first printed for this line (Print step). */
  label_printed_at?: string | null;
  /**
   * An operator confirmed they read this line's printed label face
   * (`receiving_line_testing.label_previewed_at`, 2026-08-02). Gate for the
   * Label capture step — distinct from `label_printed_at`, which is the commit
   * act the terminal dock owns.
   */
  label_previewed_at?: string | null;
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
}
