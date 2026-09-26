'use client';

/**
 * The inventory diagnostics dashboard's three engine mounts — the CLIENT ISLANDS of an RSC page.
 * and registers nothing (operator ruling 2026-09-12, `ADMIN_TABLE_ALLOW`).
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
  /** The binding's `navigate` record plane, wired to the router. */
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
