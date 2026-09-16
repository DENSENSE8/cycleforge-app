'use client';

/**
 * The per-SKU page's FIVE engine mounts — the CLIENT ISLANDS of an RSC page.
 *
 * `/inventory/health/sku/[sku]` is a server component and `DataTable` is client
 * code, so each ported section crosses the boundary here. The eight loaders
 * stay on the server: these components take already-fetched rows as props and
 * never fetch.
 *
 * No section owns a table, and no section is a `.tsx` of its own — this file is
 * the page's one client boundary, so a mount costs an exported function here
 * and nothing else:
 *
 * - units and events mount families that were already registered
 *   (`inventory-units` sheet, `inventory-events` compound), so a bind / hide /
 *   reorder an org makes on the Units browse or the Ledger lands here too;
 * - allocations mount the registered `unit-allocations` family through this
 *   desk's own layout document (`sku-allocations`) — one catalog, one
 *   resolver, one adapter, two sets of defaults, because the two feeds resolve
 *   different facts (see `field-catalog/sku-allocations-layout.ts`);
 *   the row OPENS the unit, which is the retired cell's `<Link>` as a declared
 *   record plane;
 * - bins and the ledger are families of their own (`sku-bins`, `sku-ledger`):
 *   a (sku, bin) pair and a signed stock movement are entities nothing else in
 *   the product lists.
 *
 * The page's narrower SQL is translated in `./sku-detail-rows`, never forked
 * into a second catalog.
 *
 * Sort and search are LOCAL state on purpose: these are panes on a page with
 * five row sections, and two of them writing the same `?sort=` would fight
 * (the same rule `useInventoryEventsSpreadsheet` documents for the Ledger's
 * two mounts).
 *
 * The empty state is each feed's `emptyMessage`, which is why the page no
 * longer wraps a section in `rows.length > 0 ?`: a vanished panel cannot tell
 * an operator the difference between "nothing is holding this stock" and "this
 * page does not have that section".
 */

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

  /**
   * The binding's `navigate` record plane, wired to the router.
   *
   * This is the retired `unit` cell's `<Link>`: the reach-through is declared
   * once on the binding (`SKU_ALLOCATIONS_TABLE_BINDING.recordPlane`) and the
   * mount supplies the only thing a binding cannot hold — the router. A hold
   * whose feed omits the unit has nowhere to go and does nothing.
   */
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
