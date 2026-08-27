'use client';

import type { ReactNode } from 'react';
import type { GridSelectGutterChrome } from '@/components/ui/GridRowCheckbox';
import type { RowGroup } from '@/lib/group-rows';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { IncomingGridColumn } from '@/lib/receiving/receiving-grid-layout';
import { IncomingGridRow } from './IncomingGridRow';

interface IncomingGridGroupRowProps {
  group: RowGroup<ReceivingLineRow>;
  baseStripeIndex: number;
  isMobile: boolean;
  selectMode: boolean;
  selectedId: number | null;
  selectedIds: Set<number>;
  handleSelectRow: (row: ReceivingLineRow) => void;
  handleToggleRow: (row: ReceivingLineRow) => void;
  clickSelect?: boolean;
  selectGutterChrome?: GridSelectGutterChrome;
  columns?: readonly IncomingGridColumn[];
  /**
   * Commit an inline NOTE edit. Present ⇒ the compound title cell's note line
   * edits in place; absent ⇒ read-only. An Incoming row IS a receiving line, so
   * its `notes` is the same scalar working field Unbox edits — capability, not
   * a second cell.
   */
  onCommitNote?: (row: ReceivingLineRow, next: string) => void;
}

/**
 * One PO group inside the Incoming LedgerGrid.
 *
 * Always a flat list of leaf lines — no collapsible PO title summary (same
 * Sheets golden as Unbox History). Grouping still drives upstream ordering;
 * each line is its own selectable record.
 */
export function IncomingGridGroupRow({
  group,
  baseStripeIndex,
  isMobile,
  selectMode,
  selectedId,
  selectedIds,
  handleSelectRow,
  handleToggleRow,
  clickSelect = false,
  selectGutterChrome = 'always',
  columns,
  onCommitNote,
}: IncomingGridGroupRowProps) {
  const renderLeaf = (row: ReceivingLineRow, stripeIndex: number): ReactNode => (
    <IncomingGridRow
      key={row.id}
      row={row}
      index={stripeIndex}
      isMobile={isMobile}
      selectMode={selectMode}
      // Two independent planes: `isOpen` is the record in the inspector,
      // `isChecked` is bulk membership. Click-select collapses interaction onto
      // the row (click = toggle; dblclick = open) while keeping both flags.
      isOpen={selectedId === row.id}
      isChecked={selectMode && selectedIds.has(row.id)}
      onSelect={() => handleSelectRow(row)}
      onToggle={() => handleToggleRow(row)}
      clickSelect={clickSelect}
      selectGutterChrome={selectGutterChrome}
      columns={columns}
      onCommitNote={onCommitNote ? (next) => onCommitNote(row, next) : undefined}
    />
  );

  return (
    <>
      {group.rows.map((row, i) => renderLeaf(row, baseStripeIndex + i))}
    </>
  );
}
