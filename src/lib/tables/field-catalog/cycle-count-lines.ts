/** Cycle-count LINES field catalog — the bindable facts of ONE `cycle_count_lines` row. */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';

export const CYCLECOUNTLINES_FIELD_CATALOG: FieldCatalog = [
  { id: 'cycle-count-lines.bin', family: 'cycle-count-lines', label: 'Bin', displayType: 'id', slotKinds: ['identity', 'status', 'subtitle'], paths: { value: 'binName', fallback: 'binId' } },
  { id: 'cycle-count-lines.sku', family: 'cycle-count-lines', label: 'SKU', displayType: 'text', slotKinds: ['status', 'subtitle'], paths: { value: 'sku' } },
  { id: 'cycle-count-lines.expected', family: 'cycle-count-lines', label: 'Expected', displayType: 'number', slotKinds: ['status', 'subtitle'], paths: { value: 'expectedQty' } },
  { id: 'cycle-count-lines.counted', family: 'cycle-count-lines', label: 'Counted', displayType: 'number', slotKinds: ['status', 'subtitle'], paths: { value: 'countedQty' } },
  { id: 'cycle-count-lines.variance', family: 'cycle-count-lines', label: 'Δ', displayType: 'number', slotKinds: ['status', 'subtitle'], paths: { value: 'variance' } },
  { id: 'cycle-count-lines.status', family: 'cycle-count-lines', label: 'Status', displayType: 'tag', slotKinds: ['status', 'subtitle'], paths: { value: 'status' } },
  { id: 'cycle-count-lines.tolerance', family: 'cycle-count-lines', label: 'Tol', displayType: 'text', slotKinds: ['status', 'subtitle'], paths: { value: 'varianceTol' } },
  { id: 'cycle-count-lines.counted_by', family: 'cycle-count-lines', label: 'Counted by', displayType: 'person', slotKinds: ['status', 'subtitle'], paths: { display: 'countedByName', name: 'countedByName', value: 'countedByStaffId' } },
  { id: 'cycle-count-lines.counted_at', family: 'cycle-count-lines', label: 'Counted at', displayType: 'date', slotKinds: ['status', 'subtitle'], paths: { value: 'countedAt' } },
  { id: 'cycle-count-lines.approved_by', family: 'cycle-count-lines', label: 'Decided by', displayType: 'person', slotKinds: ['status', 'subtitle'], paths: { display: 'approvedByName', name: 'approvedByName', value: 'approvedByStaffId' } },
  { id: 'cycle-count-lines.approved_at', family: 'cycle-count-lines', label: 'Decided at', displayType: 'date', slotKinds: ['status', 'subtitle'], paths: { value: 'approvedAt' } },
];

/** The PRODUCT default: */
export const CYCLECOUNTLINES_PRODUCT_LAYOUT: DataTableColumnLayout = {
  morph: 'compound',
  identityFieldId: 'cycle-count-lines.bin',
  statusBindings: [
    { fieldId: 'cycle-count-lines.expected' },
    { fieldId: 'cycle-count-lines.counted' },
    { fieldId: 'cycle-count-lines.variance' },
    { fieldId: 'cycle-count-lines.counted_by' },
  ],
  subtitleBindings: [{ fieldId: 'cycle-count-lines.tolerance' }],
  amountFieldId: null,
}

export const CYCLECOUNTLINES_TABLE_LAYOUT_ID = 'cycle-count-lines';
