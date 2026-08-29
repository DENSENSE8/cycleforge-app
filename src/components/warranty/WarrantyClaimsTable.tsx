'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { DataTable } from '@/components/tables/DataTable';
import { useWarrantyClaims, useWarrantyUrlState } from '@/hooks/useWarrantyClaims';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import type { RowGroup } from '@/lib/group-rows';
import type { WarrantyClaimListRow } from '@/lib/warranty/types';
import { WARRANTY_TABLE_BINDING } from '@/components/warranty/grid/warranty-table-definition';
import {
  WarrantyGridRow,
  warrantyClaimItemLabel,
} from '@/components/warranty/grid/WarrantyGridRow';
import {
  defaultDirForWarrantyGridSort,
  isWarrantyGridSortable,
  type WarrantyGridColumn,
  type WarrantyGridColumnKey,
} from '@/components/warranty/grid/warranty-grid-layout';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import { cn } from '@/utils/_cn';

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
 * Right-pane warranty claims map — the data host that mounts the Workbench
 * spreadsheet SoT (`NonlinearTableHost` + the warranty table definition)
 * directly. Read-only map: selection is the RECORD plane — the row writes
 * `?open=` and the detail panel takes it from there.
 *
 * Search / status / expiring filters all live in the sidebar (URL params); this
 * reads the SAME params so both share one React Query cache key. Column sort is
 * DURABLE on `?colsort=`/`?coldir=` (NOT `?sort=` — `/support` spends that param
 * elsewhere, and the warranty mode's own filters live on `?wstatus=`/`?wexp=`).
 */
export function WarrantyClaimsTable() {
  const searchParams = useSearchParams();
  const search = String(searchParams.get('search') || '').trim();
  const { status, expiringSoon, openClaimId, openClaim } = useWarrantyUrlState();

  const { data: claims = [], isLoading, error } = useWarrantyClaims({ status, search, expiringSoon });

  // ▦ portals into Band-1 controls (find lives in Support sidebar — Units recipe).
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    sort: columnSort,
    dir: sortDir,
    setSort,
  } = useUrlColumnSort<WarrantyGridColumnKey>({
    isColumn: isWarrantyGridSortable,
    defaultDir: defaultDirForWarrantyGridSort,
  });

  // One-shot "settle" re-render after the grid first has data: the virtualized
  // LedgerGrid mounts its scroll element in the same commit the data arrives,
  // and with no async label/selection churn in this subtree its internal
  // re-measure can miss on first paint, leaving the body blank until the first
  // interaction.
  const [, settleTick] = useState(0);
  const hasRows = claims.length > 0;
  useEffect(() => {
    if (isLoading || !hasRows) return;
    const raf = requestAnimationFrame(() => settleTick((t) => t + 1));
    return () => cancelAnimationFrame(raf);
  }, [isLoading, hasRows]);

  const orderGroupsByDate = useMemo<[string, RowGroup<WarrantyClaimListRow>[]][]>(() => {
    const ordered =
      columnSort && sortDir
        ? [...claims].sort((a, b) => compareWarrantyRows(a, b, columnSort, sortDir))
        : claims;
    const groups = ordered.map((claim) => ({ key: `claim:${claim.id}`, rows: [claim] }));
    // One unnamed band — a claim list has no day/fold axis. Safe to emit even
    // when empty: `LedgerGrid` decides emptiness from ROW count (`hasGridRows`),
    // not band count, so a band holding nothing still resolves to the teaching
    // box rather than headers over a void.
    return [['', groups]];
  }, [claims, columnSort, sortDir]);

  // Degrade-not-fail: the claim list is this pane's PRIMARY resource, so a
  // failed fetch earns the retryable error state rather than an empty grid that
  // would read as "no claims" — the exact lie the four settled states exist to
  // prevent (`display/workbench.md`).
  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center bg-surface-canvas p-8">
        <div className="rounded-none border border-dashed border-border-danger bg-surface-danger px-4 py-6 text-center">
          <p className="text-sm font-semibold text-text-danger">
            {error instanceof Error ? error.message : 'Could not load warranty claims.'}
          </p>
        </div>
      </div>
    );
  }

  const renderLeaf = (claim: WarrantyClaimListRow, visible: readonly WarrantyGridColumn[]) => (
    <WarrantyGridRow
      key={claim.id}
      claim={claim}
      isSelected={claim.id === openClaimId}
      onOpenClaim={(id) => openClaim(id === openClaimId ? null : id)}
      columns={visible}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-canvas">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <DataTable<WarrantyClaimListRow, WarrantyGridColumnKey, WarrantyGridColumn>
          binding={WARRANTY_TABLE_BINDING}
          orderGroupsByDate={orderGroupsByDate}
          rows={claims}
          getRowId={(r) => String(r.id)}
          sort={columnSort}
          dir={sortDir}
          onSortChange={setSort}
          loading={isLoading}
          emptyMessage="No warranty claims logged yet."
          searchEmptyMessage="No warranty claims match these filters."
          scrollRef={scrollRef}
          search={{ value: search, onChange: setSearch, placeholder: 'Search claims…' }}
          renderGroup={(group, _stripe, { columns: visible }) => (
            <>{group.rows.map((claim) => renderLeaf(claim, visible))}</>
          )}
          renderRow={(row, _stripe, { columns: visible }) => renderLeaf(row, visible)}
        />
      </div>
    </div>
  );
}
