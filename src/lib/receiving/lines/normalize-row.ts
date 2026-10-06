/** Shape a raw `receiving_line` SQL row into the API's wire row. */

import type { ListingSerialRef, TicketReason } from '../receiving-line-row';

/**
 * Wire timestamps as strings. `SELECT rl.*` (and uncast street columns) arrive
 * from node-pg as `Date`; callers do `(stamp || '').trim()` and crash on Date.
 */
function asStampText(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

/** A staff FK as the wire's id (`StaffAvatar` / `StaffBadge` colour by id); null when unset. */
function asStaffId(value: unknown): number | null {
  const id = Number(value);
  return value != null && Number.isInteger(id) && id > 0 ? id : null;
}

export function normalizeRow(row: Record<string, unknown>) {
  // Tracking identity resolves in priority order:
  const shipmentTracking    = (row.shipment_tracking_number as string | null) ?? null;
  const receivingTracking   = (row.receiving_tracking_number as string | null) ?? null;
  const zohoReferenceNumber = (row.zoho_reference_number as string | null) ?? null;

  const tracking =
    shipmentTracking ?? receivingTracking ?? zohoReferenceNumber ?? null;
  const trackingSource =
    shipmentTracking ? 'shipment'
    : receivingTracking ? 'receiving'
    : zohoReferenceNumber ? 'zoho_reference'
    : null;

  // Carrier from the canonical shipment row wins; fall back to the legacy
  // receiving_carton.carrier text. 'UNKNOWN' sentinel (from permissive registration)
  // is hidden — surfaces as null so UI renders plainly.
  const shipmentCarrierRaw = (row.shipment_carrier as string | null) ?? null;
  const shipmentCarrier = shipmentCarrierRaw && shipmentCarrierRaw.toUpperCase() !== 'UNKNOWN'
    ? shipmentCarrierRaw
    : null;
  const carrier = shipmentCarrier ?? (row.carrier as string | null) ?? null;

  return {
    id:                       Number(row.id),
    receiving_id:             row.receiving_id != null ? Number(row.receiving_id) : null,
    tracking_number:          tracking,
    tracking_source:          trackingSource,
    zoho_reference_number:    zohoReferenceNumber,
    carrier,
    shipment_status:          (row.shipment_status_category as string | null) ?? null,
    is_delivered:             !!row.shipment_is_delivered,
    delivered_at:             (row.shipment_delivered_at as string | null) ?? null,
    zoho_item_id:             (row.zoho_item_id as string | null) ?? null,
    zoho_line_item_id:        (row.zoho_line_item_id as string | null) ?? null,
    zoho_purchase_receive_id: (row.zoho_purchase_receive_id as string | null) ?? null,
    zoho_purchaseorder_id:    (row.zoho_purchaseorder_id as string | null) ?? null,
    zoho_purchaseorder_number: (row.zoho_purchaseorder_number as string | null) ?? (row.receiving_zoho_purchaseorder_number as string | null) ?? null,
    item_name:                (row.item_name as string | null) ?? null,
    // Canonical Zoho catalog title (sku_catalog.product_title), joined by SKU.
    catalog_product_title:    (row.catalog_product_title as string | null) ?? null,
    zoho_item_title:          (row.zoho_item_title as string | null) ?? null,
    // Canonical sku_catalog.id for this line's SKU (joined). Keys the SKU
    // pairing surface; null when the SKU isn't catalogued yet.
    sku_catalog_id:           row.sku_catalog_id != null ? Number(row.sku_catalog_id) : null,
    sku:                      (row.sku as string | null) ?? null,
    quantity_received:        Number(row.quantity_received ?? 0),
    quantity_expected:        row.quantity_expected != null ? Number(row.quantity_expected) : null,
    qa_status:                (row.qa_status as string) ?? 'PENDING',
    workflow_status:          (row.workflow_status as string | null) ?? null,
    disposition_code:         (row.disposition_code as string) ?? 'HOLD',
    condition_grade:          (row.condition_grade as string) ?? 'USED_A',
    // "As listed" — what the purchase listing said (sql-listing-evidence.ts). A SELECT without the
    // evidence fragment (the PATCH re-fetch) leaves them off the wire, so a merged patch never blanks them.
    purchase_condition_grade: 'purchase_condition_grade' in row ? ((row.purchase_condition_grade as string | null) ?? null) : undefined,
    listing_serials:          Array.isArray(row.listing_serials) ? (row.listing_serials as ListingSerialRef[]) : undefined,
    listing_photo_ids:        Array.isArray(row.listing_photo_ids) ? (row.listing_photo_ids as unknown[]).map(Number) : undefined,
    condition_set_at:         (row.condition_set_at as string | null) ?? null,
    label_printed_at:         (row.label_printed_at as string | null) ?? null,
    // Unbox procedure ACKNOWLEDGEMENT stamps — the gates for the `condition`, `contents` and `label` capture steps…
    condition_graded_at:      (row.condition_graded_at as string | null) ?? null,
    contents_confirmed_at:    (row.contents_confirmed_at as string | null) ?? null,
    label_previewed_at:       (row.label_previewed_at as string | null) ?? null,
    // Unbox commit `stage` — intended putaway (receiving_line_putaway).
    staged_at:                (row.staged_at as string | null) ?? null,
    staged_location_id:       row.staged_location_id != null ? Number(row.staged_location_id) : null,
    staged_location_name:     (row.staged_location_name as string | null) ?? null,
    staged_location_barcode:  (row.staged_location_barcode as string | null) ?? null,
    staged_location_room:     (row.staged_location_room as string | null) ?? null,
    staged_location_row_label:(row.staged_location_row_label as string | null) ?? null,
    staged_location_col_label:(row.staged_location_col_label as string | null) ?? null,
    // Point-in-time snapshot written by the stage route — the face the operator
    // actually confirmed. Survives a later rename of the bin.
    staged_location_code:     (row.staged_location_code as string | null) ?? null,
    staged_by:                row.staged_by != null ? Number(row.staged_by) : null,
    staged_by_name:           (row.staged_by_name as string | null) ?? null,
    // Denormalized serial projection (rlt.serial_projection) surfaced by the list builders as `serials` — the FAST DEFAULT for first-frame…
    serials:                  Array.isArray(row.serials)
                              ? (row.serials as Array<{ id: number; serial_number: string; condition_grade: string | null }>)
                              : undefined,
    disposition_audit:        (row.disposition_audit as unknown[]) ?? [],
    needs_test:               !!row.needs_test,
    is_priority:              !!row.is_priority,
    priority_tier:            row.priority_tier != null ? Number(row.priority_tier) : null,
    assigned_tech_id:         row.assigned_tech_id != null ? Number(row.assigned_tech_id) : null,
    zoho_sync_source:         (row.zoho_sync_source as string | null) ?? null,
    zoho_last_modified_time:  (row.zoho_last_modified_time as string | null) ?? null,
    zoho_synced_at:           (row.zoho_synced_at as string | null) ?? null,
    notes:                    (row.notes as string | null) ?? null,
    // Printed label face center — split from `notes` 2026-07-31 so an item note
    // need not print. Arrives via `rl.*`; null on views whose SELECT omits it.
    label_note:               (row.label_note as string | null) ?? null,
    zoho_notes:               (row.zoho_notes as string | null) ?? null,
    unit_price:               (row.unit_price as string | null) ?? null,
    receiving_support_notes:  (row.receiving_support_notes as string | null) ?? null,
    receiving_zoho_notes:     (row.receiving_zoho_notes as string | null) ?? null,
    receiving_listing_url:    (row.receiving_listing_url as string | null) ?? null,
    listing_url:              (row.listing_url as string | null) ?? null,
    // RETURN intake facts (receiving_line_return, 1:1) — reason falls back to
    // the carton's `return_reason` in SQL. Null on PO lines / placeholder rows.
    return_reason:            (row.return_reason as string | null) ?? null,
    return_rma_ref:           (row.return_rma_ref as string | null) ?? null,
    return_source_order_id:   (row.return_source_order_id as string | null) ?? null,
    // Purchasing-source PO receipt state, and how old that answer is.
    zoho_status:              (row.zoho_status as string | null) ?? null,
    zoho_status_synced_at:    (row.zoho_status_synced_at as string | null) ?? null,
    // view=incoming_removed only — the two removal signals the row shape does
    // not already carry. Precedence is NOT decided here: the client resolves it
    // through `resolveIncomingRemovalReason`, so there is one ladder.
    removed_written_off:      row.removed_written_off === true,
    removed_aged_out:         row.removed_aged_out === true,
    removed_at:               (row.removed_at as string | null) ?? null,
    // view=exceptions only — the reason code and the ZIP it was judged against.
    exception_code:           (row.exception_code as string | null) ?? null,
    warehouse_postal:         (row.warehouse_postal as string | null) ?? null,
    // Incoming-view only; null on other views (SELECT omits the columns).
    delivery_state:           (row.delivery_state as string | null) ?? null,
    po_date:                  (row.po_date as string | null) ?? null,
    expected_delivery_date:   (row.expected_delivery_date as string | null) ?? null,
    vendor_name:              (row.vendor_name as string | null) ?? null,
    // Universal Incoming purchase identity (spine cache cols via rl.*, plan §6.3).
    inbound_source_type:      (row.inbound_source_type as string | null) ?? null,
    source_order_id:          (row.source_order_id as string | null) ?? null,
    platform_account_id:      row.platform_account_id != null ? Number(row.platform_account_id) : null,
    platform_account_label:   (row.platform_account_label as string | null) ?? null,
    shipment_has_exception:   row.shipment_has_exception == null ? null : !!row.shipment_has_exception,
    shipment_latest_event_at: (row.shipment_latest_event_at as string | null) ?? null,
    shipment_last_checked_at: (row.shipment_last_checked_at as string | null) ?? null,
    shipment_latest_event_city: (row.shipment_latest_event_city as string | null) ?? null,
    shipment_latest_event_postal: (row.shipment_latest_event_postal as string | null) ?? null,
    shipment_is_terminal:     row.shipment_is_terminal == null ? null : !!row.shipment_is_terminal,
    shipment_estimated_delivery_at: (row.shipment_estimated_delivery_at as string | null) ?? null,
    shipment_signed_by:       (row.shipment_signed_by as string | null) ?? null,
    shipment_delivery_attempts: row.shipment_delivery_attempts == null ? null : Number(row.shipment_delivery_attempts),
    receiving_type:            (row.receiving_type as string | null) ?? 'PO',
    // Per-line unfound intake classification (override grain; null on Zoho lines).
    intake_type:               (row.intake_type as string | null) ?? null,
    // Carton-level default receiving type (receiving.intake_type). The carton
    // pill edits this; receiving_type above overrides per line. Migration 2026-06-13b.
    carton_intake_type:        (row.receiving_intake_type as string | null) ?? null,
    // Door-scan vs unbox split (history columns).
    received_at:              asStampText(row.receiving_received_at),
    received_by_name:         (row.received_by_name as string | null) ?? null,
    received_by_id:           asStaffId(row.receiving_received_by),
    // Terminal "Received" (DONE) transition time — distinct from the door-scan
    // received_at above. Drives History's "Received" sort axis. Comes from
    // `rl.*` uncast, so coerce Date → ISO (see {@link asStampText}).
    received_done_at:         asStampText(row.received_done_at),
    unboxed_at:               asStampText(row.receiving_unboxed_at),
    unboxed_by_name:          (row.unboxed_by_name as string | null) ?? null,
    unboxed_by_id:            asStaffId(row.receiving_unboxed_by),
    unbox_opened_by_name:     (row.unbox_opened_by_name as string | null) ?? null,
    unbox_opened_by_id:       asStaffId(row.receiving_unbox_opened_by),
    scanned_at:               asStampText(row.first_scanned_at),
    scanned_by_name:          (row.scanned_by_name as string | null) ?? null,
    scanned_by_id:            asStaffId(row.first_scanned_by),
    // First-class "opened for unbox" time (receiving.unbox_opened_at / UNBOX_SCAN_OPENED).
    // Unboxed rail + History `unboxed_newest` read THIS for label + sort — same
    // axis. Selected on view=unbox_opened / activity / all; null elsewhere.
    unbox_opened_at:          asStampText(row.unbox_opened_at),
    testing_opened_at:        asStampText(row.testing_opened_at),
    tested_at:                asStampText(row.tested_at),
    unbox_only_intake:        row.unbox_only_intake === true,
    triage_complete:          row.triage_complete === true,
    triage_completed_at:      asStampText(row.triage_completed_at),
    staging_location_id:      row.staging_location_id != null ? Number(row.staging_location_id) : null,
    staging_location_label:   (row.staging_location_label as string | null) ?? null,
    priority_lane:            (row.priority_lane as string | null) ?? null,
    pairing_state:            (row.pairing_state as string | null) ?? null,
    created_at:               asStampText(row.created_at),
    // Last write to the line itself (qty bump, condition, notes, …). Drives
    // the unbox_activity sort's tiebreak in the placeholder merge.
    updated_at:               asStampText(row.updated_at),
    // Most-recent activity timestamp matching the server's sort order.
    last_activity_at:         asStampText(row.testing_opened_at)
                              ?? asStampText(row.viewed_at)
                              ?? asStampText(row.tested_at)
                              ?? asStampText(row.needs_test_at)
                              ?? asStampText(row.last_scan_at)
                              ?? asStampText(row.receiving_received_at)
                              ?? asStampText(row.created_at)
                              ?? null,
    // Recorded testing verdicts for this line (view=testing only; null elsewhere).
    // Scoped to the tester when the feed is. Drives the rail's "tested k/N".
    tested_count:             row.tested_count != null ? Number(row.tested_count) : null,
    image_url:                (row.image_url as string | null) ?? null,
    source_platform:          (row.receiving_source_platform as string | null) ?? null,
    /** receiving.source — 'zoho_po' | 'unmatched' | 'local_pickup'. Drives which workspace variant mounts. */
    receiving_source:         (row.receiving_source as string | null) ?? null,
    photo_count:              row.photo_count != null ? Number(row.photo_count) : 0,
    zendesk_ticket:           (row.zendesk_ticket as string | null) ?? null,
    claim_ticket:             (row.claim_ticket as string | null) ?? null,
    ticket_reasons:           asTicketReasons(row.ticket_reasons),
  };
}

/** One receiving-lines feed row, as every GET path serves it. */
export type NormalizedReceivingLine = ReturnType<typeof normalizeRow>;


/** A lineless carton rendered as a `receiving_line`-shaped placeholder row (synthetic id `-receiving_id`). */
const UNMATCHED_EMPTY_LINE_LABEL = 'Unfound PO';

export function buildUnmatchedEmptyReceivingLine(pkg: Record<string, unknown>): Record<string, unknown> {
  const rid = Number(pkg.id);
  // The same line-less placeholder serves both unmatched cartons and finalized local pickup POs (one receiving row per PO, items live in…
  const source = String(pkg.receiving_source || 'unmatched');
  const isPickup = source === 'local_pickup';
  // An unfound carton is RECEIVED once it has been unboxed at the dock — for a lineless placeholder the only signal is receiving.unboxed_at…
  const unboxedAt = pkg.receiving_unboxed_at ?? pkg.unbox_opened_at ?? null;
  return {
    id: -rid,
    receiving_id: rid,
    receiving_tracking_number: pkg.receiving_tracking_number,
    carrier: pkg.carrier,
    receiving_received_at: pkg.receiving_received_at,
    receiving_unboxed_at: unboxedAt,
    unboxed_by_name: pkg.unboxed_by_name ?? null,
    receiving_unboxed_by: pkg.receiving_unboxed_by ?? null,
    unbox_opened_by_name: pkg.unbox_opened_by_name ?? null,
    receiving_unbox_opened_by: pkg.receiving_unbox_opened_by ?? null,
    receiving_support_notes: pkg.receiving_support_notes ?? null,
    receiving_zoho_notes: pkg.receiving_zoho_notes ?? null,
    receiving_listing_url: pkg.receiving_listing_url ?? null,
    receiving_source: source,
    receiving_source_platform: pkg.receiving_source_platform,
    receiving_zoho_purchaseorder_number: pkg.receiving_zoho_purchaseorder_number,
    shipment_tracking_number: pkg.shipment_tracking_number,
    shipment_carrier: pkg.shipment_carrier,
    shipment_status_category: pkg.shipment_status_category,
    shipment_is_delivered: pkg.shipment_is_delivered,
    shipment_delivered_at: pkg.shipment_delivered_at,
    shipment_estimated_delivery_at: pkg.shipment_estimated_delivery_at ?? null,
    shipment_signed_by: pkg.shipment_signed_by ?? null,
    shipment_delivery_attempts: pkg.shipment_delivery_attempts ?? null,
    item_name: isPickup
      ? String(pkg.receiving_tracking_number || 'Local pickup')
      : UNMATCHED_EMPTY_LINE_LABEL,
    sku: null,
    zoho_item_id: null,
    zoho_line_item_id: null,
    zoho_purchase_receive_id: null,
    zoho_purchaseorder_id: null,
    zoho_purchaseorder_number: pkg.receiving_zoho_purchaseorder_number ?? null,
    // An operator-linked id on a carton that has no line yet (link-carton-identifier.ts writes receiving_carton.source_order_id and leaves the…
    source_order_id: pkg.receiving_source_order_id ?? null,
    quantity_received: 0,
    quantity_expected: null,
    qa_status: 'PENDING',
    // Unfound cartons opened on the Unbox surface (unbox_opened_at) or physically
    // unboxed at the dock (unboxed_at) read as DONE ("RECEIVED") locally.
    workflow_status: unboxedAt ? 'DONE' : 'ARRIVED',
    disposition_code: 'HOLD',
    condition_grade: 'BRAND_NEW',
    disposition_audit: [],
    needs_test: true,
    is_priority: !!pkg.is_priority,
    priority_tier: pkg.priority_tier ?? null,
    assigned_tech_id: null,
    zoho_sync_source: null,
    zoho_last_modified_time: null,
    zoho_synced_at: null,
    notes: null,
    zoho_notes: null,
    unit_price: null,
    receiving_type: 'PO',
    created_at: pkg.created_at,
    // Genuine door scan only — the "Scanned" display is triage-owned. The
    // unbox-open time stays in its own first-class field below, never folded into
    // first_scanned_at (which would make "Scanned" react to opening in Unbox).
    first_scanned_at: pkg.first_scanned_at,
    unbox_opened_at: pkg.unbox_opened_at ?? null,
    last_scan_at: pkg.last_scan_at,
    image_url: null,
    photo_count: pkg.photo_count,
    zendesk_ticket: pkg.zendesk_ticket ?? null,
    claim_ticket: pkg.claim_ticket ?? null,
    ticket_reasons: pkg.ticket_reasons ?? [],
    zoho_reference_number: null,
  };
}

/** `ticket_reasons` jsonb → typed pairs; anything malformed drops out. */
function asTicketReasons(raw: unknown): TicketReason[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const code = typeof item?.code === 'string' ? item.code : '';
    if (!code) return [];
    const ticket = typeof item.ticket === 'string' && item.ticket.trim() ? item.ticket.trim() : null;
    return [{ code, ticket }];
  });
}
