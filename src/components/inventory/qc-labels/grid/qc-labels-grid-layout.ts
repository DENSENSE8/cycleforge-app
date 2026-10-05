import { gridTemplate } from '@/design-system/components/grid/grid-column-geometry';
import type { ColumnType } from '@/lib/tables/table-columns';

export type QcLabelsGridColumnKey =
  | 'status'
  | 'label'
  | 'product'
  | 'serial'
  | 'sku'
  | 'location'
  | 'order'
  | 'prints'
  | 'last-printed';

export interface QcLabelsGridColumn {
  key: QcLabelsGridColumnKey;
  width: string;
  label: string;
  gridLabel: string;
  type?: ColumnType;
  dateFace?: 'day' | 'stamp' | 'duration';
  align?: 'start' | 'end' | 'center';
  resizable?: boolean;
  sortable?: boolean;
}

/**
 * One explicit column model for the whole labels ledger. A content value can
 * truncate inside its track, but it can never resize or displace another fact.
 */
export const QC_LABELS_GRID_COLUMNS: readonly QcLabelsGridColumn[] = [
  { key: 'status', width: 'minmax(8rem, 8rem)', label: 'Status', gridLabel: 'Status', type: 'tag', resizable: true, sortable: true },
  { key: 'label', width: 'minmax(12rem, 12rem)', label: 'Label ID', gridLabel: 'Label ID', type: 'id', resizable: true, sortable: true },
  { key: 'product', width: 'minmax(16rem, 1fr)', label: 'Product', gridLabel: 'Product', type: 'text', resizable: true, sortable: true },
  { key: 'serial', width: 'minmax(11rem, 11rem)', label: 'Serial number', gridLabel: 'Serial number', type: 'id', resizable: true, sortable: true },
  { key: 'sku', width: 'minmax(10rem, 10rem)', label: 'SKU', gridLabel: 'SKU', type: 'id', resizable: true, sortable: true },
  { key: 'location', width: 'minmax(8rem, 8rem)', label: 'Location', gridLabel: 'Location', type: 'location', resizable: true, sortable: true },
  { key: 'order', width: 'minmax(8rem, 8rem)', label: 'Order', gridLabel: 'Order', type: 'id', resizable: true, sortable: true },
  { key: 'prints', width: 'minmax(5.5rem, 5.5rem)', label: 'Prints', gridLabel: 'Prints', type: 'number', align: 'end', resizable: true, sortable: true },
  { key: 'last-printed', width: 'minmax(10rem, 10rem)', label: 'Last printed', gridLabel: 'Last printed', type: 'date', dateFace: 'stamp', align: 'end', resizable: true, sortable: true },
];

export function qcLabelsGridTemplate(columns: readonly QcLabelsGridColumn[]): string {
  return gridTemplate(columns);
}

