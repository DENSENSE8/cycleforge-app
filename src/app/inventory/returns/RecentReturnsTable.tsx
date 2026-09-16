'use client';

/**
 * Admin › Returns — the CLIENT ISLAND for `/inventory/returns`.
 *
 * The page is an RSC: it guards, it runs the intake server action, and it
 * reads the last fifty `RETURNED` events. None of that moves. This file is
 * only the boundary the slot engine needs (hooks, layout cascade, header
 * sort), and it takes its rows as props — the SQL stays on the server.
 *
 * Same shape as `../events/EventsExplorerTable.tsx`: spread the family's feed
 * onto DataTable and nothing else.
 */

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/tables/DataTable';
import { useAdminReturnsSpreadsheet } from '@/components/inventory/returns-grid/useAdminReturnsSpreadsheet';
import type { RecentReturnRow } from '@/lib/inventory/returns-row';

export function RecentReturnsTable({ rows }: { rows: RecentReturnRow[] }) {
  const router = useRouter();

  /**
   * The binding's `navigate` record plane, wired to the router.
   *
   * This is the retired `unit` cell's `<Link>`: the reach-through is declared
   * once on the entity (`ADMIN_RETURNS_TABLE_BINDING.recordPlane`) and the
   * mount supplies the only thing a binding cannot hold — the router. A row
   * whose event carries no unit has nowhere to go and does nothing.
   */
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
