import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import type { QcLabelRow } from '@/lib/labels/qc-label-row';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import { makeQcLabelsGridDescriptor, QC_LABELS_GRID_CAPABILITIES } from './qc-labels-grid-descriptor';
import { QC_LABELS_GRID_COLUMNS, type QcLabelsGridColumn } from './qc-labels-grid-layout';

const QC_LABELS_TABLE_DEFINITION = parseTableDefinition({
  id: 'units.qc-labels',
  // QC labels are a view over physical inventory units, not a second entity.
  tableId: 'inventory-units',
  entityFamily: 'units',
  cellMapKey: 'units',
  ariaLabel: 'QC product labels',
  testId: 'qc-labels-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: QC_LABELS_GRID_CAPABILITIES,
  columns: QC_LABELS_GRID_COLUMNS,
});

export const QC_LABELS_TABLE_BINDING: TableSurfaceBinding<QcLabelRow, QcLabelsGridColumn> = {
  definition: QC_LABELS_TABLE_DEFINITION,
  columns: QC_LABELS_GRID_COLUMNS,
  makeDescriptor: makeQcLabelsGridDescriptor,
  recordPlane: {
    kind: 'stage-overlay',
    reason: 'A product-label row opens its physical inventory unit record.',
  },
};

