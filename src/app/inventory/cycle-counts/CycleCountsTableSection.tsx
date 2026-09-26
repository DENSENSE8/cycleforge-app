'use client';

/** Admin › Cycle count campaigns — the PAGE feed for `/inventory/cycle-counts`, and the RSC boundary for the desk. */

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { DataTable } from '@/components/tables/DataTable';
import { useCycleCountsSpreadsheet } from '@/components/inventory/cycle-counts/useCycleCountsSpreadsheet';
import type { CycleCountCampaignRow } from '@/lib/inventory/cycle-count-campaign-row';

export function CycleCountsTableSection({ rows }: { rows: CycleCountCampaignRow[] }) {
  const router = useRouter();
  // The binding's record plane is `navigate`; this is that route. The campaign
  // name used to be an `<a>` inside a cell — a per-family control in the one
  // place the shared row will not take one.
  const onOpenRow = useCallback(
    (row: CycleCountCampaignRow) => router.push(`/inventory/cycle-counts/${row.id}`),
    [router],
  );

  const sheet = useCycleCountsSpreadsheet({ rows, onOpenRow });

  return (
    <div className="flex h-[70vh] min-h-0 min-w-0 flex-col">
      <DataTable {...sheet} totalCount={rows.length} />
    </div>
  );
}
