'use client';

import { useState, type ReactNode } from 'react';
import type { GridSelectGutterChrome } from '@/components/ui/GridRowCheckbox';
import type { RowGroup } from '@/lib/group-rows';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { IncomingGridColumn } from '@/lib/receiving/receiving-grid-layout';
import {
  SlotTableGroupFold,
  SlotTableGroupFoldBody,
  SlotTableGroupParentRow,
} from '@/components/tables/compound/SlotTableGroupParentRow';
import { orderCarrierBoxes } from '@/lib/orders/order-group-identity';
import { receivingGroupIdentity } from '@/lib/receiving/receiving-group-identity';
import { IncomingGridRow } from './IncomingGridRow';
import { receivingGroupRollup } from '@/lib/receiving/receiving-group-rollup';
import { receivingCompoundView } from '@/lib/receiving/receiving-compound-view';
import { displayReceivingProductTitle } from '@/components/station/receiving-grid/cells';
import { bandQtyRollupPart } from '@/lib/receiving/receiving-group-rollup';

interface IncomingGridGroupRowProps {
  group: RowGroup<ReceivingLineRow>;
  baseStripeIndex: number;
  isMobile: boolean;
  selectMode: boolean;
  /** This row is the record currently open in the Incoming inspector. */
  selectedId: number | null;
  selectedIds: Set<number>;
  handleSelectRow: (row: ReceivingLineRow) => void;
  handleToggleRow: (row: ReceivingLineRow) => void;
  clickSelect?: boolean;
  selectGutterChrome?: GridSelectGutterChrome;
  columns: readonly IncomingGridColumn[];
  /**
   * Commit an inline NOTE edit. Present ⇒ the compound title cell's note line
   * edits in place; absent ⇒ read-only. An Incoming row IS a receiving line, so
   * its `notes` is the same scalar working field Unbox edits — capability, not
   * a second cell.
   */
}

/**
 * One PO group inside the Incoming LedgerGrid.
 *
 * A multi-line PO paints the engine-owned group treatment, identical to Unbox
 * History and To-ship (operator 2026-09-14): the shared title band
 * ({@link SlotTableGroupParentRow}) carrying rolled status + qty facts, with
 * the fold's single black bottom hairline closing the group in both fold
 * states. The leaves quiet their PO (`quietIdentity`) because the band
 * speaks it once.
 *
 * A fold of one is a bare leaf — no band, no outline, no quieting. This
 * supersedes the old "always a flat list" ruling, which Unbox History already
 * reversed; grouping still drives upstream ordering either way.
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
}: IncomingGridGroupRowProps) {
  // A fold of one is just a line — no band, no quieting.
  const multi = group.rows.length > 1;
  const [folded, setFolded] = useState(false);
  const identity = multi ? receivingGroupIdentity(group.rows) : null;
  const { carriers, boxCount, trackings } = orderCarrierBoxes(group.rows);
  const ids = group.rows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n));
  const checkedCount = ids.filter((id) => selectedIds.has(id)).length;
   const checked = checkedCount === 0 ? false : checkedCount === ids.length ? true : 'mixed';

  // Band rollups (operator 2026-09-14, "implement all 1-3") — same summary-row
  // grammar as the Unbox/History band: rolled status pill + summed qty under
  // the lead product title.
  const rollup = receivingGroupRollup(group.rows);
  const bandView = receivingCompoundView(group.rows[0]!, {
    title: displayReceivingProductTitle(group.rows[0]!),
    stateLabel: rollup.label,
    stateTone: rollup.tone,
    stateTip: rollup.tip,
    delayDays: null,
    tracking: null,
    orderId: null,
  });
  bandView.subtitleParts = [
    bandQtyRollupPart('incoming.qty', rollup.qtyReceived, rollup.qtyExpected),
  ];

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
      quietIdentity={multi}
    />
  );

  return (
    <SlotTableGroupFold multi={multi}>
      {multi ? (
        <SlotTableGroupParentRow
          identity={identity}
          carriers={carriers}
          boxCount={boxCount}
          trackings={trackings}
          columns={columns}
          identityColumnKey="fulfillment"
          checked={checked}
          onToggle={() => {
            const turnOn = checked !== true;
            for (const row of group.rows) {
              if (selectedIds.has(row.id) !== turnOn) handleToggleRow(row);
            }
          }}
          selectCount={group.rows.length}
          folded={folded}
          onToggleFold={() => setFolded((open) => !open)}
          view={bandView}
        />
      ) : null}
      {folded ? null : (
        <SlotTableGroupFoldBody multi={multi}>
          {group.rows.map((row, i) => renderLeaf(row, baseStripeIndex + i))}
        </SlotTableGroupFoldBody>
      )}
    </SlotTableGroupFold>
  );
}
