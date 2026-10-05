'use client';

/**
 * The /support table — the canonical `DataTable` over `SUPPORT_TABLE_BINDING`:
 * one single-height row per Support item (Order ID · Platform · Customer
 * question), banded under sticky group heads while the sidebar's Group by is
 * set. No toolbar: views, sort, group, facets and Find are the left
 * sidebar's. A row (click, or Enter on a focused row) opens its record.
 */

import { memo } from 'react';
import { DataTable } from '@/components/tables/DataTable';
import { GridCellDash } from '@/components/ui/grid-cells';
import { LedgerGridLeafRow, gridCellAlignClass } from '@/design-system/components/grid';
import { LEDGER_GRID_FROZEN_CELL, ledgerGridCell } from '@/design-system/components/grid/grid-cell-chrome';
import type { RowGroup } from '@/lib/group-rows';
import type { SupportListRow } from '@/lib/support/list/support-list';
import { cn } from '@/utils/_cn';
import {
  SUPPORT_TABLE_BINDING,
  SUPPORT_TABLE_CAPABILITIES,
  supportTableCellText,
  supportTableFrozenLeft,
  supportTableGridTemplate,
  type SupportTableColumn,
  type SupportTableColumnKey,
} from './support-table';

const NO_SORT = () => undefined;
/** Module-level: a fresh function each render re-flattens every virtualized row. */
const supportRowKey = (row: SupportListRow) => String(row.itemId);

export function SupportTable({
  rows,
  bands,
  sectionHeaders,
  loading,
  openId,
  onOpen,
  emptyMessage,
}: {
  rows: SupportListRow[];
  bands: [string, RowGroup<SupportListRow>[]][];
  sectionHeaders: Record<string, string> | undefined;
  loading: boolean;
  openId: number | null;
  onOpen: (row: SupportListRow) => void;
  emptyMessage: string;
}) {
  const renderRow = (row: SupportListRow, columns: readonly SupportTableColumn[]) => (
    <SupportTableRow key={row.itemId} row={row} columns={columns} open={row.itemId === openId} onOpen={onOpen} />
  );
  return (
    <DataTable<SupportListRow, SupportTableColumnKey, SupportTableColumn>
      binding={SUPPORT_TABLE_BINDING}
      hideToolbar
      unpaged
      rows={rows}
      orderGroupsByDate={bands}
      sectionHeaders={sectionHeaders}
      getRowId={supportRowKey}
      loading={loading}
      emptyMessage={emptyMessage}
      scrollToKey={openId == null ? null : String(openId)}
      sort={null}
      dir={null}
      onSortChange={NO_SORT}
      renderGroup={(group, _stripe, { columns }) => <>{group.rows.map((row) => renderRow(row, columns))}</>}
      renderRow={(row, _stripe, { columns }) => renderRow(row, columns)}
    />
  );
}

const SupportTableRow = memo(function SupportTableRow({
  row,
  columns,
  open,
  onOpen,
}: {
  row: SupportListRow;
  columns: readonly SupportTableColumn[];
  /** This row's record is open. */
  open: boolean;
  onOpen: (row: SupportListRow) => void;
}) {
  const question = supportTableCellText(row, 'question');
  return (
    <LedgerGridLeafRow<SupportTableColumn>
      data-desk-record-key={row.itemId}
      data-support-item={row.itemId}
      data-support-status={row.status}
      role="button"
      tabIndex={0}
      aria-current={open || undefined}
      aria-label={`Open ${question}`}
      onClick={() => onOpen(row)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || event.key !== 'Enter') return;
        event.preventDefault();
        onOpen(row);
      }}
      columns={columns}
      template={supportTableGridTemplate(columns)}
      selected={open}
      capabilities={SUPPORT_TABLE_CAPABILITIES}
      className="cursor-pointer"
      renderCell={(col, { rule }) => {
        const text = supportTableCellText(row, col.key);
        const frozen = col.frozen === true;
        return (
          <div
            key={col.key}
            data-col={col.key}
            title={text || undefined}
            className={cn(
              ledgerGridCell({ rule, inset: 'grid' }),
              gridCellAlignClass(col),
              frozen && LEDGER_GRID_FROZEN_CELL,
              'min-w-0 whitespace-nowrap text-role-caption',
              col.key === 'order' ? 'font-mono font-semibold text-text-default' : col.key === 'question' ? 'text-text-default' : 'text-text-muted',
            )}
            style={frozen ? { left: supportTableFrozenLeft(columns, col.key) } : undefined}
          >
            {text ? <span className="min-w-0 truncate">{text}</span> : <GridCellDash />}
          </div>
        );
      }}
    />
  );
});
