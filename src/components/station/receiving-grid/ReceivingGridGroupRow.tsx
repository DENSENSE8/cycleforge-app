'use client';

import { useState, type ReactNode } from 'react';
import { CollapsibleGroupRow } from '@/components/ui/CollapsibleGroupRow';
import type { RowGroup } from '@/lib/group-rows';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { GridColumnDisplayPref } from '@/design-system/components/grid';
import type { ReceivingGridColumn } from '@/lib/receiving/receiving-grid-layout';
import type { ReceivingActivityAxis } from '@/components/station/receiving-lines-table-helpers';
import { ReceivingGridGroupSummary } from './ReceivingGridGroupSummary';
import { ReceivingGridRow } from './ReceivingGridRow';

interface ReceivingGridGroupRowProps {
  group: RowGroup<ReceivingLineRow>;
  baseStripeIndex: number;
  isMobile: boolean;
  selectMode: boolean;
  selectedId: number | null;
  selectedIds: Set<number>;
  handleSelectRow: (row: ReceivingLineRow) => void;
  /**
   * Select-gutter click — bulk membership only, never opens a record. Present
   * only where the row body has been handed to the record plane (History);
   * omitted on the single-gesture surfaces (Unbox workbench, Testing, Pickup).
   */
  handleToggleRow?: (row: ReceivingLineRow) => void;
  handleSelectGroup: (ids: readonly number[]) => void;
  activityAxis?: ReceivingActivityAxis;
  isHistory?: boolean;
  columns?: readonly ReceivingGridColumn[];
  /** Per-hideKey display prefs (highlight / chip). */
  columnDisplay?: Readonly<Record<string, GridColumnDisplayPref>>;
}

/**
 * One PO group inside the Unbox / History LedgerGrid. Singleton → plain row;
 * multi-line → collapsible summary + child rows.
 */
export function ReceivingGridGroupRow({
  group,
  baseStripeIndex,
  isMobile,
  selectMode,
  selectedId,
  selectedIds,
  handleSelectRow,
  handleToggleRow,
  handleSelectGroup,
  activityAxis = 'unboxed',
  isHistory = false,
  columns,
  columnDisplay,
}: ReceivingGridGroupRowProps) {
  const isMulti = group.rows.length > 1;
  const hasSelected = group.rows.some(
    (r) => selectedId === r.id || (selectMode && selectedIds.has(r.id)),
  );
  const [expanded, setExpanded] = useState(selectMode || hasSelected);

  const renderLeaf = (row: ReceivingLineRow, stripeIndex: number): ReactNode => (
    <ReceivingGridRow
      key={row.id}
      row={row}
      index={stripeIndex}
      isMobile={isMobile}
      selectMode={selectMode}
      // Two independent planes: `isOpen` is the focused record, `isChecked` is
      // bulk membership. Collapsing them into one flag is what let an always-on
      // select mode turn the whole row into a checkbox. On a surface that has
      // NOT split them, only one can be true at a time — the row click writes
      // whichever the mode says — so `isOpen` stays gated on `!selectMode`
      // there, preserving the legacy fill exactly.
      isOpen={handleToggleRow ? selectedId === row.id : !selectMode && selectedId === row.id}
      isChecked={selectMode && selectedIds.has(row.id)}
      onSelect={() => handleSelectRow(row)}
      onToggle={handleToggleRow ? () => handleToggleRow(row) : undefined}
      activityAxis={activityAxis}
      isHistory={isHistory}
      columns={columns}
      columnDisplay={columnDisplay}
    />
  );

  if (!isMulti) {
    return <>{renderLeaf(group.rows[0], baseStripeIndex)}</>;
  }

  const childIds = group.rows.map((r) => r.id);
  const selectedCount = childIds.filter((id) => selectedIds.has(id)).length;
  const allSelected = selectMode && childIds.length > 0 && selectedCount === childIds.length;
  const someSelected = selectMode && selectedCount > 0 && !allSelected;

  const onToggleGroupSelect = () => {
    setExpanded(true);
    handleSelectGroup(childIds);
  };

  return (
    <CollapsibleGroupRow
      index={baseStripeIndex}
      showChevron={false}
      nestRail={false}
      expanded={expanded}
      onToggle={setExpanded}
      summary={
        <ReceivingGridGroupSummary
          rows={group.rows}
          isMobile={isMobile}
          columns={columns}
          activityAxis={activityAxis}
          isHistory={isHistory}
          selectMode={selectMode}
          allSelected={allSelected}
          someSelected={someSelected}
          onToggleGroupSelect={onToggleGroupSelect}
        />
      }
    >
      {group.rows.map((row, i) => renderLeaf(row, baseStripeIndex + 1 + i))}
    </CollapsibleGroupRow>
  );
}
