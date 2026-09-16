'use client';

/**
 * The inventory diagnostics dashboard's three engine mounts — the CLIENT
 * ISLANDS of an RSC page.
 *
 * `/inventory/health` is a server component and `DataTable` is client code, so
 * each ported section crosses the boundary here. The eight loaders stay on the
 * server (`./inventory-admin-data`): these components take already-fetched rows
 * as props and never fetch. Same shape as
 * `../returns/RecentReturnsTable.tsx` and `../sku/[sku]/SkuDetailTables.tsx` —
 * spread the family's feed onto `DataTable` and nothing else.
 *
 * Three mounts, three families, and only ONE of them is new to the engine:
 *
 * - {@link DriftAlertsTable} mounts `admin-drift-alerts` (one open
 *   `stock_alerts` DRIFT row).
 * - {@link SkuDriftTable} mounts `admin-sku-drift` (one `v_sku_stock_drift`
 *   comparison). Its clean-drift prose is the table's own empty state, not a
 *   branch that swaps the table out for a paragraph.
 * - {@link RecentInventoryEventsTable} mounts `inventory-events` — the family
 *   the Ledger and the per-SKU pulse already mount. No catalog, no tableId, no
 *   second events registration; the narrower row shape is translated in
 *   `./inventory-admin-rows`, and a bind/hide/reorder an org makes on the
 *   Ledger lands here too.
 *
 * The `AllocationsSection` bucket summary is NOT here: a `GROUP BY state` row
 * is not an entity, so it renders as a KPI tile band in `./TableSections.tsx`
 * and registers nothing (operator ruling 2026-09-12, `ADMIN_TABLE_ALLOW`).
 *
 * Sort and search are LOCAL state inside each family's feed hook: this page has
 * six row sections and no search params of its own, and two of them writing the
 * same `?sort=` would fight.
 */

import { useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/tables/DataTable';
import { useAdminDriftAlertsSpreadsheet } from '@/components/inventory/drift-grid/useAdminDriftAlertsSpreadsheet';
import { useAdminSkuDriftSpreadsheet } from '@/components/inventory/drift-grid/useAdminSkuDriftSpreadsheet';
import { useInventoryEventsSpreadsheet } from '@/components/inventory/events-grid/useInventoryEventsSpreadsheet';
import type { DriftAlertRow, SkuDriftRow } from '@/lib/inventory/drift-rows';
import { recentInventoryEventRows } from './inventory-admin-rows';
import type { RecentEventRow } from './inventory-admin-data';

/** Open DRIFT alerts, on the `admin-drift-alerts` compound row. */
export function DriftAlertsTable({ rows }: { rows: readonly DriftAlertRow[] }) {
  const router = useRouter();
  /**
   * The binding's `navigate` record plane, wired to the router.
   *
   * This is the retired SKU cell's `<a>`: the reach-through is declared once on
   * the entity (`ADMIN_DRIFT_ALERTS_TABLE_BINDING.recordPlane`) and the mount
   * supplies the only thing a binding cannot hold — the router.
   */
  const openSku = useCallback(
    (row: DriftAlertRow) => {
      if (!row.sku) return;
      router.push(`/inventory/health/sku/${encodeURIComponent(row.sku)}`);
    },
    [router],
  );

  const sheet = useAdminDriftAlertsSpreadsheet({ rows, onOpenRow: openSku });
  return <DataTable {...sheet} totalCount={rows.length} />;
}

/** `sku_stock` ↔ ledger drift, on the `admin-sku-drift` compound row. */
export function SkuDriftTable({ rows }: { rows: readonly SkuDriftRow[] }) {
  const router = useRouter();
  // The same reach-through, off this family's own `navigate` plane: the SKU
  // page is the record behind a drift row too.
  const openSku = useCallback(
    (row: SkuDriftRow) => {
      if (!row.sku) return;
      router.push(`/inventory/health/sku/${encodeURIComponent(row.sku)}`);
    },
    [router],
  );

  const sheet = useAdminSkuDriftSpreadsheet({ rows, onOpenRow: openSku });
  return <DataTable {...sheet} totalCount={rows.length} />;
}

/** The last 50 inventory events, on the REGISTERED `inventory-events` family. */
export function RecentInventoryEventsTable({ events }: { events: readonly RecentEventRow[] }) {
  const rows = useMemo(() => recentInventoryEventRows(events), [events]);
  const sheet = useInventoryEventsSpreadsheet({
    events: rows,
    emptyMessage: 'No events yet. Empty until a flagged path emits.',
    searchPlaceholder: 'Filter events…',
  });
  return <DataTable {...sheet} totalCount={rows.length} />;
}
