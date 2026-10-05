import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { QcLabelRow } from '@/lib/labels/qc-label-row';
import type { QcLabelsGridColumn } from './qc-labels-grid-layout';

export const QC_LABELS_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  dayBands: false,
};

export function makeQcLabelsGridDescriptor(
  columns: readonly QcLabelsGridColumn[],
): GridSurfaceDescriptor<QcLabelRow, QcLabelsGridColumn> {
  return makeGridSurfaceDescriptor<QcLabelRow, QcLabelsGridColumn>(
    'inventory.qc-labels',
    columns,
    {
      isSortable: (key) => columns.some((column) => column.key === key && column.sortable !== false),
      sortDescFirst: (key) => key === 'prints' || key === 'last-printed',
      isLocked: () => false,
    },
    QC_LABELS_GRID_CAPABILITIES,
  );
}

