'use client';

/**
 * Admin › Cycle count campaigns — the PAGE feed for
 * `/inventory/cycle-counts`, and the RSC boundary for the desk.
 *
 * The page is a server component: it guards the permission, runs
 * `loadCampaigns` and owns the create form (a server action). `DataTable` is a
 * client island — staff prefs, the Fields picker, the search box and column
 * drag all live in the browser — so the page renders THIS and hands the
 * already-loaded rows across as plain props. No fetch moves to the client.
 *
 * It exists for the boundary and nothing else: the mount holds no column
 * model, no cell and no row component (`TABLE_ENGINE_ACCEPTANCE`). Same shape
 * as `EventsExplorerTable` one route over.
 */

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
