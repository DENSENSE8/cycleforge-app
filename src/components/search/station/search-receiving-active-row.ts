import type {
  CartonInspectorLine,
  CartonInspectorReceiving,
} from '@/components/receiving/inspector/carton-inspector-model';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { buildUnmatchedStubRow } from '@/components/sidebar/receiving/receiving-sidebar-shared';

/** Carton read payload → the workspace row `PoLinesAccordion` expects. */
export function searchReceivingActiveRow(
  receiving: CartonInspectorReceiving,
  lines: ReadonlyArray<CartonInspectorLine>,
): ReceivingLineRow {
  const line = lines[0];
  if (line) {
    return {
      id: line.id,
      receiving_id: receiving.id,
      tracking_number: line.tracking_number ?? receiving.tracking,
      carrier: receiving.carrier,
      zoho_item_id: null,
      zoho_line_item_id: null,
      zoho_purchase_receive_id: receiving.zoho_purchase_receive_id,
      zoho_purchaseorder_id: receiving.zoho_purchaseorder_id,
      zoho_purchaseorder_number:
        line.zoho_purchaseorder_number ?? receiving.zoho_purchaseorder_number,
      item_name: line.item_name,
      zoho_item_title: line.zoho_item_title,
      catalog_product_title: line.catalog_product_title,
      sku: line.sku,
      quantity_expected: line.quantity_expected,
      quantity_received: line.quantity_received ?? 0,
      qa_status: line.qa_status ?? 'PENDING',
      workflow_status: line.workflow_status,
      disposition_code: line.disposition_code ?? 'HOLD',
      condition_grade: line.condition_grade ?? '',
      disposition_audit: [],
      needs_test: receiving.needs_test ?? true,
      assigned_tech_id: null,
      zoho_sync_source: null,
      zoho_last_modified_time: null,
      zoho_synced_at: null,
      receiving_type: line.receiving_type ?? receiving.intake_type,
      carton_intake_type: receiving.intake_type,
      notes: line.notes,
      created_at: null,
      image_url: line.image_url ?? null,
      source_platform: receiving.source_platform,
      source_platform_pill: receiving.source_platform,
      receiving_source: receiving.source,
      receiving_listing_url: receiving.listing_url,
      serials: (line.serials ?? []).map((s) => ({
        id: s.id,
        serial_number: s.serial_number,
        condition_grade: s.condition_grade,
      })),
    };
  }

  return {
    ...buildUnmatchedStubRow(receiving.id, receiving.tracking ?? ''),
    zoho_purchaseorder_id: receiving.zoho_purchaseorder_id,
    zoho_purchaseorder_number: receiving.zoho_purchaseorder_number,
    source_platform: receiving.source_platform,
    receiving_type: receiving.intake_type,
    carton_intake_type: receiving.intake_type,
  };
}
