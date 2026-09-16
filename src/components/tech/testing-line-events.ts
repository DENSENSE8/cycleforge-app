import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

/**
 * Workspace / accordion convenience for Testing — NOT rail safety.
 *
 * `TestingRecentRail` does **not** subscribe to `receiving-line-updated`
 * (mode bus isolation). Prefer narrow patches here (`{ id, serials }`,
 * workflow/qa fields from verdict responses). Never broadcast a full by-id
 * `GET ?id=` row — that response cannot reproduce the Testing dock's
 * `tested_at` age axis and used to blank/jump rail times when the dock
 * still listened. QC Recent now ages `testing_opened_at` only.
 *
 * Strips `last_activity_at` / null `tested_at` so any residual bus listener
 * (workspace selection merge, sibling rails) cannot clobber a verdict stamp
 * with scan/import time from a by-id normalize.
 */
export function dispatchTestingLineUpdated(
  row: Partial<ReceivingLineRow> & { id: number },
) {
  const patch = { ...row };
  delete patch.last_activity_at;
  if (patch.tested_at == null) delete patch.tested_at;
  dispatchLineUpdated(patch);
}

/**
 * Allowlisted workspace fields from a by-id / include=serials hydrate.
 * Serials + line workflow/qty the Testing panel reads — nothing else.
 */
export function narrowTestingWorkspacePatch(
  line: ReceivingLineRow,
): Partial<ReceivingLineRow> & { id: number } {
  return {
    id: line.id,
    serials: line.serials ?? [],
    workflow_status: line.workflow_status,
    qa_status: line.qa_status,
    disposition_code: line.disposition_code,
    quantity_received: line.quantity_received,
    quantity_expected: line.quantity_expected,
    tested_count: line.tested_count,
    notes: line.notes,
    condition_grade: line.condition_grade,
    item_name: line.item_name,
    sku: line.sku,
    catalog_product_title: line.catalog_product_title,
    zoho_item_title: line.zoho_item_title,
  };
}
