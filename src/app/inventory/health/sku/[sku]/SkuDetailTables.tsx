'use client';

/** The per-SKU page's FIVE engine mounts — the CLIENT ISLANDS of an RSC page. */

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/tables/DataTable';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import { useUnitsSpreadsheet } from '@/components/inventory/units-grid/useUnitsSpreadsheet';
import type { UnitsGridColumnKey } from '@/components/inventory/units-grid/units-grid-layout';
import { useInventoryEventsSpreadsheet } from '@/components/inventory/events-grid/useInventoryEventsSpreadsheet';
import { useSkuBinsSpreadsheet } from '@/components/inventory/sku-bins-grid/useSkuBinsSpreadsheet';
import { useSkuAllocationsSpreadsheet } from '@/components/inventory/sku-allocations-grid/useSkuAllocationsSpreadsheet';
import { useSkuLedgerSpreadsheet } from '@/components/inventory/sku-ledger-grid/useSkuLedgerSpreadsheet';
import type { UnitAllocationTableRow } from '@/lib/inventory/unit-allocation-row';
import {
  skuAllocationTableRows,
  skuBinTableRows,
  skuLedgerTableRows,
  skuPulseEventRows,
  skuUnitsOverviewRows,
  type SkuAllocationLoaderRow,
  type SkuBinLoaderRow,
  type SkuEventRow,
  type SkuIdentity,
  type SkuLedgerLoaderRow,
  type SkuRecentUnitRow,
} from './sku-detail-rows';

/** Recent serial units for this SKU, on the `inventory-units` sheet. */
export function SkuRecentUnitsTable({
  units,
  sku,
  productTitle,
}: {
  units: readonly SkuRecentUnitRow[];
} & SkuIdentity) {
  const identity = useMemo<SkuIdentity>(() => ({ sku, productTitle }), [sku, productTitle]);
  const router = useRouter();
  const rows = useMemo(() => skuUnitsOverviewRows(units, identity), [units, identity]);

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<UnitsGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);

  const search = useMemo(
    () => ({ value: query, onChange: setQuery, placeholder: 'Filter units…' }),
    [query],
  );

  // The unit page is where a serial's record lives on the admin side — the
  // same href the retired Serial column linked to, now a ROW open instead of
  // a bespoke link inside a cell.
  const sheet = useUnitsSpreadsheet({
    rows,
    loading: false,
    search,
    sort,
    dir,
    onSortChange: (key, nextDir) => {
      setSort(key);
      setDir(nextDir);
    },
    onOpen: (row) => router.push(`/inventory?unit=${row.id}`),
    emptyMessage: 'No serial units for this SKU.',
  });

  return <DataTable {...sheet} />;
}

/** Recent inventory events for this SKU, on the `inventory-events` compound row. */
export function SkuEventsTable({
  events,
  sku,
  productTitle,
}: {
  events: readonly SkuEventRow[];
} & SkuIdentity) {
  const identity = useMemo<SkuIdentity>(() => ({ sku, productTitle }), [sku, productTitle]);
  const rows = useMemo(() => skuPulseEventRows(events, identity), [events, identity]);

  const sheet = useInventoryEventsSpreadsheet({
    events: rows,
    emptyMessage: 'No events recorded for this SKU yet.',
    searchPlaceholder: 'Filter events…',
  });

  return <DataTable {...sheet} />;
}

/** Bin distribution for this SKU, on its own `sku-bins` compound family. */
export function SkuBinsTable({
  bins,
  sku,
  productTitle,
}: {
  bins: readonly SkuBinLoaderRow[];
} & SkuIdentity) {
  const identity = useMemo<SkuIdentity>(() => ({ sku, productTitle }), [sku, productTitle]);
  const rows = useMemo(() => skuBinTableRows(bins, identity), [bins, identity]);

  const sheet = useSkuBinsSpreadsheet({ rows });

  return <DataTable {...sheet} totalCount={rows.length} />;
}

/** Open allocations against this SKU's units, on the `unit-allocations` family. */
export function SkuAllocationsTable({
  allocations,
}: {
  allocations: readonly SkuAllocationLoaderRow[];
}) {
  const router = useRouter();
  const rows = useMemo(() => skuAllocationTableRows(allocations), [allocations]);

  /** The binding's `navigate` record plane, wired to the router. */
  const openUnit = useCallback(
    (row: UnitAllocationTableRow) => {
      if (row.serial_unit_id == null) return;
      router.push(`/inventory?unit=${row.serial_unit_id}`);
    },
    [router],
  );

  const sheet = useSkuAllocationsSpreadsheet({ rows, onOpenRow: openUnit });

  return <DataTable {...sheet} totalCount={rows.length} />;
}

/** The authoritative signed-quantity ledger, on its own `sku-ledger` family. */
export function SkuLedgerTable({ ledger }: { ledger: readonly SkuLedgerLoaderRow[] }) {
  const rows = useMemo(() => skuLedgerTableRows(ledger), [ledger]);

  const sheet = useSkuLedgerSpreadsheet({ rows });

  return <DataTable {...sheet} totalCount={rows.length} />;
}
