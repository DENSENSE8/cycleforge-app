'use client';

/** Admin › Returns — the CLIENT ISLAND for `/inventory/returns`. */

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/tables/DataTable';
import { useAdminReturnsSpreadsheet } from '@/components/inventory/returns-grid/useAdminReturnsSpreadsheet';
import type { RecentReturnRow } from '@/lib/inventory/returns-row';

export function RecentReturnsTable({ rows }: { rows: RecentReturnRow[] }) {
  const router = useRouter();

  /** The binding's `navigate` record plane, wired to the router. */
  const openUnit = useCallback(
    (row: RecentReturnRow) => {
      if (row.serial_unit_id == null) return;
      router.push(`/inventory?unit=${row.serial_unit_id}`);
    },
    [router],
  );

  const sheet = useAdminReturnsSpreadsheet({ rows, onOpenRow: openUnit });

  return (
    <div className="flex h-[60vh] min-h-0 min-w-0 flex-col">
      <DataTable {...sheet} totalCount={rows.length} />
    </div>
  );
}
