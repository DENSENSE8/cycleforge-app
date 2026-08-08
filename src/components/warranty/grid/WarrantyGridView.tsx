'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { NonlinearTableHost } from '@/components/tables/NonlinearTableHost';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import type { RowGroup } from '@/lib/group-rows';
import type { WarrantyClaimListRow } from '@/lib/warranty/types';
import { WARRANTY_TABLE_BINDING } from './warranty-table-definition';
import { WarrantyGridColumnHeader } from './WarrantyGridColumnHeader';
import { WarrantyGridRow, warrantyClaimItemLabel } from './WarrantyGridRow';
import {
  defaultDirForWarrantyGridSort,
  isWarrantyGridSortable,
  type WarrantyGridColumn,
  type WarrantyGridColumnKey,
} from './warranty-grid-layout';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

/** Staff-prefs identity — one warranty spreadsheet, one Fields selection. */

interface WarrantyGridViewProps {
  rows: WarrantyClaimListRow[];
  loading: boolean;
  /** Settled with no claims at all. */
  emptyMessage: string;
  /** Settled with none matching the filter — a different answer (clear it). */
  searchEmptyMessage?: string;
  isSearching?: boolean;
  /** The claim open at the record plane (`?open=`), highlighted in the map. */
  openClaimId: number | null;
  onOpenClaim: (id: number) => void;
  /** FULL canonical column list — `LedgerGridSurface` resolves visibility. */
  columns?: readonly WarrantyGridColumn[];
}

/**
 * Row order for a column sort.
 *
 * `warranty` sorts on `daysRemaining`, and **null sorts last in both
 * directions** rather than as 0 or ±Infinity: a claim with no computed clock
 * (no delivered date and no packed estimate yet) is an *unknown*, not "expired"
 * and not "maximum cover". Folding it to a number would park those rows at
 * whichever end of the list the operator is actually reading.
 */
function compareWarrantyRows(
  a: WarrantyClaimListRow,
  b: WarrantyClaimListRow,
  key: WarrantyGridColumnKey,
  dir: GridSortDir,
): number {
  const sign = dir === 'asc' ? 1 : -1;
  switch (key) {
    case 'title':
      return sign * (warrantyClaimItemLabel(a) || '').localeCompare(warrantyClaimItemLabel(b) || '');
    case 'claim':
      return sign * a.claimNumber.localeCompare(b.claimNumber);
    case 'serial':
      return sign * (a.serialNumber || '').localeCompare(b.serialNumber || '');
    case 'customer':
      return sign * (a.customerName || '').localeCompare(b.customerName || '');
    case 'status':
      return sign * a.status.localeCompare(b.status);
    case 'warranty': {
      const av = a.daysRemaining;
      const bv = b.daysRemaining;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return sign * (av - bv);
    }
    case 'logged':
      return sign * a.createdAt.localeCompare(b.createdAt);
    default:
      return 0;
  }
}

/**
 * Warranty claims spreadsheet — warranty-native adapter over
 * {@link LedgerGridSurface}. Same shell recipe as {@link PickupGridView}
 * (airtable skin + scrollX + click-to-sort), flat: a claim has no one-to-many
 * fold, so every group is a singleton.
 *
 * Read-only map. Selection is the RECORD plane — the row writes `?open=` and the
 * detail panel takes it from there.
 */
export function WarrantyGridView({
  rows,
  loading,
  emptyMessage,
  searchEmptyMessage,
  isSearching,
  openClaimId,
  onOpenClaim,
  columns,
}: WarrantyGridViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Column sort is DURABLE: `?colsort=`/`?coldir=` (workbench URL-as-state law).
  // NOT `?sort=` — `/support` already spends that param elsewhere, and the
  // warranty mode's own filters live on `?wstatus=`/`?wexp=`.
  const {
    sort: columnSort,
    dir: sortDir,
    setSort,
  } = useUrlColumnSort<WarrantyGridColumnKey>({
    isColumn: isWarrantyGridSortable,
    defaultDir: defaultDirForWarrantyGridSort,
  });

  // One-shot "settle" re-render after the grid first has data — same reason as
  // PickupGridView: the virtualized LedgerGrid mounts its scroll element in the
  // same commit the data arrives, and with no async label/selection churn in
  // this subtree its internal re-measure can miss on first paint, leaving the
  // body blank until the first interaction.
  const [, settleTick] = useState(0);
  const hasRows = rows.length > 0;
  useEffect(() => {
    if (loading || !hasRows) return;
    const raf = requestAnimationFrame(() => settleTick((t) => t + 1));
    return () => cancelAnimationFrame(raf);
  }, [loading, hasRows]);

  const orderGroupsByDate = useMemo<[string, RowGroup<WarrantyClaimListRow>[]][]>(() => {
    const ordered =
      columnSort && sortDir
        ? [...rows].sort((a, b) => compareWarrantyRows(a, b, columnSort, sortDir))
        : rows;
    const groups = ordered.map((claim) => ({ key: `claim:${claim.id}`, rows: [claim] }));
    // One unnamed band — a claim list has no day/fold axis. Safe to emit even
    // when empty: `LedgerGrid` decides emptiness from ROW count (`hasGridRows`),
    // not band count, so a band holding nothing still resolves to the teaching
    // box rather than headers over a void.
    return [['', groups]];
  }, [rows, columnSort, sortDir]);

  const renderLeaf = (claim: WarrantyClaimListRow, visible: readonly WarrantyGridColumn[]) => (
    <WarrantyGridRow
      key={claim.id}
      claim={claim}
      isSelected={claim.id === openClaimId}
      onOpenClaim={onOpenClaim}
      columns={visible}
    />
  );

  return (
    <NonlinearTableHost<WarrantyClaimListRow, WarrantyGridColumnKey, WarrantyGridColumn>
      binding={WARRANTY_TABLE_BINDING}
      columns={columns}
      orderGroupsByDate={orderGroupsByDate}
      rows={rows}
      getRowId={(r) => String(r.id)}
      sort={columnSort}
      dir={sortDir}
      onSortChange={setSort}
      loading={loading}
      emptyMessage={emptyMessage}
      searchEmptyMessage={searchEmptyMessage}
      isSearching={isSearching}
      scrollRef={scrollRef}
      renderColumnHeader={({ toggleColumnSort, onResizeColumn, onResetColumn, columns: visible }) => (
        <WarrantyGridColumnHeader
          columns={visible}
          activeSort={columnSort}
          sortDir={sortDir}
          onSortColumn={toggleColumnSort}
          onResizeColumn={onResizeColumn}
        onResetColumn={onResetColumn}
        />
      )}
      renderGroup={(group, _stripe, { columns: visible }) => (
        <>{group.rows.map((claim) => renderLeaf(claim, visible))}</>
      )}
      renderRow={(row, _stripe, { columns: visible }) => renderLeaf(row, visible)}
    />
  );
}
