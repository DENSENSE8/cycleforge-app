'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { DataTable } from '@/components/tables/DataTable';
import { useWarrantyClaims, useWarrantyUrlState } from '@/hooks/useWarrantyClaims';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import type { RowGroup } from '@/lib/group-rows';
import type { WarrantyClaimListRow } from '@/lib/warranty/types';
import { WARRANTY_TABLE_BINDING } from '@/components/warranty/grid/warranty-table-definition';
import { useWarrantyTableLayout } from '@/components/warranty/grid/useWarrantyTableLayout';
import {
  WarrantyGridRow,
  warrantyClaimItemLabel,
} from '@/components/warranty/grid/WarrantyGridRow';
import {
  defaultDirForWarrantyColumn,
  isWarrantyColumnSortable,
  warrantySheetColumnsFor,
  warrantySortFactFor,
  type WarrantyGridColumn,
  type WarrantyGridColumnKey,
} from '@/components/warranty/grid/warranty-grid-layout';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import { useWorkbenchSearchParam } from '@/hooks/useWorkbenchSearchParam';

/** Row order for a column sort. */
function compareWarrantyRows(
  a: WarrantyClaimListRow,
  b: WarrantyClaimListRow,
  fact: string,
  dir: GridSortDir,
): number {
  const sign = dir === 'asc' ? 1 : -1;
  switch (fact) {
    case 'title':
      return sign * (warrantyClaimItemLabel(a) || '').localeCompare(warrantyClaimItemLabel(b) || '');
    case 'warranty.claim':
      return sign * a.claimNumber.localeCompare(b.claimNumber);
    case 'warranty.serial':
      return sign * (a.serialNumber || '').localeCompare(b.serialNumber || '');
    case 'warranty.customer':
      return sign * (a.customerName || '').localeCompare(b.customerName || '');
    case 'warranty.status':
      return sign * a.status.localeCompare(b.status);
    case 'warranty.clock': {
      const av = a.daysRemaining;
      const bv = b.daysRemaining;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return sign * (av - bv);
    }
    case 'warranty.logged':
      return sign * a.createdAt.localeCompare(b.createdAt);
    default:
      return 0;
  }
}

/** Right-pane warranty claims map — the data host that mounts the Workbench spreadsheet SoT (`NonlinearTableHost` + the warranty table… */
export function WarrantyClaimsTable() {
  const { status, expiringSoon, openClaimId, openClaim } = useWarrantyUrlState();
  const { searchQuery: search, setSearch } = useWorkbenchSearchParam();

  const {
    data: claims = [],
    isLoading,
    isFetching,
    error,
  } = useWarrantyClaims({ status, search, expiringSoon });

  // ▦ portals into Band-1 controls (find lives in Support sidebar — Units recipe).
  const scrollRef = useRef<HTMLDivElement>(null);

  // The COLUMNS are the effective slot layout's materialization (staff ?? org
  // ?? product — wave 1.4 hand-model kill). Sort keys are the mounted track
  // keys; each resolves to its bound field's fact through `warrantySortFactFor`.
  const { effectiveLayout: warrantyLayout, fields: warrantyFields } = useWarrantyTableLayout();
  const columns = useMemo(() => warrantySheetColumnsFor(warrantyLayout), [warrantyLayout]);
  const sortFactByKey = useMemo(
    () => new Map(columns.map((c) => [c.key as string, warrantySortFactFor(c)])),
    [columns],
  );

  const {
    sort: columnSort,
    dir: sortDir,
    setSort,
  } = useUrlColumnSort<WarrantyGridColumnKey>({
    isColumn: (raw) => isWarrantyColumnSortable(columns, raw),
    defaultDir: (key) => defaultDirForWarrantyColumn(columns, key),
  });

  // One-shot "settle" re-render after the grid first has data:
  const [, settleTick] = useState(0);
  const hasRows = claims.length > 0;
  useEffect(() => {
    if (isLoading || !hasRows) return;
    const raf = requestAnimationFrame(() => settleTick((t) => t + 1));
    return () => cancelAnimationFrame(raf);
  }, [isLoading, hasRows]);

  const orderGroupsByDate = useMemo<[string, RowGroup<WarrantyClaimListRow>[]][]>(() => {
    const sortFact = columnSort ? (sortFactByKey.get(columnSort) ?? null) : null;
    const ordered =
      sortFact && sortDir
        ? [...claims].sort((a, b) => compareWarrantyRows(a, b, sortFact, sortDir))
        : claims;
    const groups = ordered.map((claim) => ({ key: `claim:${claim.id}`, rows: [claim] }));
    // One unnamed band — a claim list has no day/fold axis.
    return [['', groups]];
  }, [claims, columnSort, sortFactByKey, sortDir]);

  // Degrade-not-fail:
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
          columns={columns}
          fields={warrantyFields}
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
          renderGroup={(group, _stripe, { columns: visible }) => (
            <>{group.rows.map((claim) => renderLeaf(claim, visible))}</>
          )}
          renderRow={(row, _stripe, { columns: visible }) => renderLeaf(row, visible)}
        />
      </div>
    </div>
  );
}
