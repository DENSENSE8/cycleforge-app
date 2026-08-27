import type { ReceivingDetailsLog } from '@/components/station/receiving-details-log';
import type { CartonInspectorReceiving } from '@/components/receiving/inspector/carton-inspector-model';

/** `CartonInspectorReceiving` → `ReceivingDetailsLog` for pipeline / progress SoTs. */
export function cartonToReceivingDetailsLog(receiving: CartonInspectorReceiving): ReceivingDetailsLog {
  return {
    id: String(receiving.id),
    timestamp: receiving.created_at ?? '',
    tracking: receiving.tracking ?? undefined,
    source: receiving.source,
    source_platform: receiving.source_platform,
    intake_type: receiving.intake_type,
    qa_status: receiving.qa_status,
    disposition_code: receiving.disposition_code,
    condition_grade: receiving.condition_grade,
    is_return: receiving.is_return ?? undefined,
    return_platform: receiving.return_platform,
    return_reason: receiving.return_reason,
    needs_test: receiving.needs_test ?? undefined,
    target_channel: receiving.target_channel,
    received_at: receiving.received_at,
    received_by: receiving.received_by ?? null,
    received_by_name: receiving.received_by_name,
    unboxed_at: receiving.unboxed_at,
    unboxed_by: receiving.unboxed_by ?? null,
    unboxed_by_name: receiving.unboxed_by_name,
    tracking_scanned_at: receiving.tracking_scanned_at,
    tracking_scanned_by: receiving.tracking_scanned_by ?? null,
    tracking_scanned_by_name: receiving.tracking_scanned_by_name,
    unbox_opened_at: receiving.unbox_opened_at,
    unbox_opened_by: receiving.unbox_opened_by ?? null,
    unbox_opened_by_name: receiving.unbox_opened_by_name,
    zoho_purchase_receive_id: receiving.zoho_purchase_receive_id,
    zoho_purchaseorder_id: receiving.zoho_purchaseorder_id,
    zoho_purchaseorder_number: receiving.zoho_purchaseorder_number,
    listing_url: receiving.listing_url,
    staging_location_label: receiving.staging_location_label,
    priority_lane: receiving.priority_lane,
    pairing_state: receiving.pairing_state,
    triage_complete: receiving.triage_complete,
    triage_completed_at: receiving.triage_completed_at,
  };
}
