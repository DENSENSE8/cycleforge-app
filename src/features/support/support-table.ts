/**
 * `support.items` — the /support table (owner 2026-10-04): one single-height
 * row per Support item, three facts and nothing else — Order ID · Platform ·
 * Customer question. The list's order, grouping and narrowing are the left
 * sidebar's (`?sort=` `?group=` facets, Find) and the status chips'; the
 * header sorts nothing. A row opens its record on the desk stage (`?item=`).
 */

import { makeGridSurfaceDescriptor, type GridSurfaceCapabilities, type GridSurfaceDescriptor, type LedgerGridColumnModel } from '@/design-system/components/grid';
import { gridFrozenLeft, gridTemplate } from '@/design-system/components/grid/grid-column-geometry';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import type { RowGroup } from '@/lib/group-rows';
import type { ColumnType } from '@/lib/tables/table-columns';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import { supportListGroupOf, type SupportListGroup, type SupportListRow } from '@/lib/support/list/support-list';
import { supportItemTitle } from './support-face';

export type SupportTableColumnKey = 'order' | 'platform' | 'question';

export interface SupportTableColumn extends LedgerGridColumnModel {
  key: SupportTableColumnKey;
  type?: ColumnType;
  sortable?: boolean;
}

export const SUPPORT_TABLE_COLUMNS: readonly SupportTableColumn[] = [
  { key: 'order', width: 'minmax(10.5rem, 10.5rem)', label: 'Order ID', gridLabel: 'Order ID', type: 'id', frozen: true, sortable: false },
  { key: 'platform', width: 'minmax(10rem, 10rem)', label: 'Platform', gridLabel: 'Platform', type: 'text', sortable: false },
  { key: 'question', width: 'minmax(18rem, 1fr)', label: 'Customer question', gridLabel: 'Customer question', type: 'text', sortable: false },
];

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * A cell as plain text — what the cell paints, what a cut-off cell shows on
 * hover. Never a raw relay address (the question is scrubbed; the contact is
 * not a column).
 */
export function supportTableCellText(row: SupportListRow, key: SupportTableColumnKey): string {
  switch (key) {
    case 'order':
      return row.primaryOrder?.orderNumber ?? '';
    case 'platform': {
      const platform = row.platform?.label ?? null;
      const account = row.account?.label ?? null;
      if (!platform) return account ?? '';
      return account && !same(account, platform) ? `${platform} · ${account}` : platform;
    }
    case 'question':
      return supportItemTitle(row);
  }
}

/** Read-only rows, no check-set, no day bands — a list to open from. */
export const SUPPORT_TABLE_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  dayBands: false,
};

export function makeSupportTableDescriptor(columns: readonly SupportTableColumn[]): GridSurfaceDescriptor<SupportListRow, SupportTableColumn> {
  return makeGridSurfaceDescriptor<SupportListRow, SupportTableColumn>(
    'support.items',
    columns,
    { isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true) },
    SUPPORT_TABLE_CAPABILITIES,
  );
}

export function supportTableGridTemplate(columns: readonly SupportTableColumn[] = SUPPORT_TABLE_COLUMNS): string {
  return gridTemplate(columns);
}

export function supportTableFrozenLeft(columns: readonly SupportTableColumn[], key: SupportTableColumnKey): string {
  return gridFrozenLeft(columns, key);
}

/**
 * The server's rows (already grouped in order) → the table's bands: one
 * unlabelled band, or one per `?group=` value with its label as the sticky
 * section header.
 */
export function supportTableBands(
  rows: readonly SupportListRow[],
  group: SupportListGroup,
): { bands: [string, RowGroup<SupportListRow>[]][]; sectionHeaders: Record<string, string> | undefined } {
  const bands = new Map<string, RowGroup<SupportListRow>[]>();
  const sectionHeaders: Record<string, string> = {};
  for (const row of rows) {
    const key = supportListGroupOf(row, group);
    const band = key ? `group:${key.key}` : 'all';
    if (key) sectionHeaders[band] = key.label;
    const groups = bands.get(band) ?? [];
    groups.push({ key: `support:${row.itemId}`, rows: [row] });
    bands.set(band, groups);
  }
  return { bands: [...bands], sectionHeaders: group === 'none' ? undefined : sectionHeaders };
}

const SUPPORT_TABLE_DEFINITION = parseTableDefinition({
  id: 'support.items',
  tableId: 'support',
  entityFamily: 'support',
  cellMapKey: 'support',
  ariaLabel: 'Support items',
  testId: 'support-items-grid',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: SUPPORT_TABLE_CAPABILITIES,
  columns: SUPPORT_TABLE_COLUMNS,
});

export const SUPPORT_TABLE_BINDING: TableSurfaceBinding<SupportListRow, SupportTableColumn> = {
  definition: SUPPORT_TABLE_DEFINITION,
  columns: SUPPORT_TABLE_COLUMNS,
  makeDescriptor: makeSupportTableDescriptor,
  recordPlane: { kind: 'stage-overlay', reason: 'A Support item opens its conversation on the desk stage (`?item=`), the table mounted underneath.' },
};
