'use client';

import { useState, type ReactNode } from 'react';
import { CollapsibleGroupRow } from '@/components/ui/CollapsibleGroupRow';
import type { GridSelectGutterChrome } from '@/components/ui/GridRowCheckbox';
import type { RowGroup } from '@/lib/group-rows';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { IncomingGridColumn } from '@/lib/receiving/incoming-grid-layout';
import { IncomingGridGroupSummary } from './IncomingGridGroupSummary';
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
  handleSelectGroup: (ids: readonly number[]) => void;
  clickSelect?: boolean;
  selectGutterChrome?: GridSelectGutterChrome;
  columns?: readonly IncomingGridColumn[];
}

/**
 * One PO group inside the Incoming LedgerGrid. Singleton → plain row;
 * multi-line → collapsible summary + child rows.
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
  handleSelectGroup,
  clickSelect = false,
  selectGutterChrome = 'always',
  columns,
}: IncomingGridGroupRowProps) {
  const isMulti = group.rows.length > 1;
  const hasSelected = group.rows.some(
    (r) => selectedId === r.id || (selectMode && selectedIds.has(r.id)),
  );
  const [expanded, setExpanded] = useState(selectMode || hasSelected);

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
        <IncomingGridGroupSummary
          rows={group.rows}
          isMobile={isMobile}
          columns={columns}
          selectMode={selectMode}
          allSelected={allSelected}
          someSelected={someSelected}
          onToggleGroupSelect={onToggleGroupSelect}
          clickSelect={clickSelect}
          selectGutterChrome={selectGutterChrome}
        />
      }
    >
      {group.rows.map((row, i) => renderLeaf(row, baseStripeIndex + 1 + i))}
    </CollapsibleGroupRow>
  );
}
