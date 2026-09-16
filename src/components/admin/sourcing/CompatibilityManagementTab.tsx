'use client';

/**
 * Main pane for /sourcing?mode=compatibility — a flat audit table of
 * model ↔ part compatibility edges, optionally filtered to one model via
 * ?boseModelId. Per-model editing lives in the Bose Models section; this view
 * is the cross-cutting "what's linked to what" table.
 *
 * Off the second table engine 2026-09-12 (Wave D). The list is the slot
 * `DataTable` (`part-compatibility` PRODUCT_TABLES peer): header sort, the
 * Fields picker and org-bindable columns arrive from the engine, none of which
 * the six hand-written column objects it replaced could ever grow. That
 * history — including why the PART is the row and how the merged `OEM <fit>`
 * pill was split into two facts — lives in
 * `@/lib/tables/field-catalog/part-compatibility`.
 *
 * Remove is a ROW VERB (`part-compatibility-verbs.ts`) confirmed on a
 * stage-overlay plane. It used to be a trailing cell of `<Button>` JSX with no
 * confirm at all.
 */

import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@/queries/keys';
import { Layers } from '@/components/Icons';
import { DataTable } from '@/components/tables/DataTable';
import { PartCompatibilityRemovePlane } from '@/components/admin/sourcing/PartCompatibilityRemovePlane';
import { resolvePartCompatibilityRowActions } from '@/components/admin/sourcing/part-compatibility-verbs';
import { usePartCompatibilitySpreadsheet } from '@/components/admin/sourcing/usePartCompatibilitySpreadsheet';
import type { CompoundRowAction } from '@/components/tables/compound/compound-row-model';
import type { PartCompatibilityEdgeRow } from '@/lib/sourcing/part-compatibility-row';

async function jsonFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body;
}

export function CompatibilityManagementTab() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const boseModelId = searchParams.get('boseModelId') ?? '';
  const [removeTarget, setRemoveTarget] = useState<PartCompatibilityEdgeRow | null>(null);

  const queryKey = boseModelId
    ? qk.partCompatibility.forModel(Number(boseModelId))
    : qk.partCompatibility.all;

  const { data, isLoading } = useQuery<{ items: PartCompatibilityEdgeRow[] }>({
    queryKey,
    queryFn: () =>
      jsonFetch(boseModelId ? `/api/part-compatibility?boseModelId=${boseModelId}` : '/api/part-compatibility'),
  });

  const remove = useMutation({
    mutationFn: (id: number) => jsonFetch(`/api/part-compatibility/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      // BOTH invalidations, unchanged: the edge list itself, and the Bose
      // models list whose per-model part counts this row feeds.
      queryClient.invalidateQueries({ queryKey: qk.partCompatibility.all });
      queryClient.invalidateQueries({ queryKey: qk.boseModels.all });
      setRemoveTarget(null);
    },
  });

  const rows = useMemo(() => data?.items ?? [], [data]);

  const rowActions = useCallback(
    (row: PartCompatibilityEdgeRow): readonly CompoundRowAction[] =>
      resolvePartCompatibilityRowActions(row, { onRemove: setRemoveTarget }),
    [],
  );

  /**
   * The desk's TWO settled-empty states, preserved.
   *
   * `DataTable` derives its "no matches" face from whether the operator has
   * NARROWED the list (search text or an active facet). `?boseModelId` is not
   * that — it selects the FEED — so a filtered-and-empty list is still a
   * SETTLED empty and takes `emptyMessage`. Hence the message branches on the
   * param, which is what the retired mount spelled as
   * `isSearching={Boolean(boseModelId)}`; the first-run teaching box stays
   * unfiltered-only; and `searchEmptyMessage` covers the genuinely new case
   * the old table had no search box to reach.
   */
  const emptyMessage = boseModelId
    ? 'No compatibility edges for this model.'
    : 'Link parts to models in the Bose Models section, then audit them here.';

  const sheet = usePartCompatibilitySpreadsheet({
    rows,
    loading: isLoading,
    rowActions,
    emptyMessage,
  });

  return (
    <div className="relative flex h-full min-h-0 flex-col gap-4 p-6">
      <h2 className="shrink-0 text-lg font-semibold text-text-default">
        Compatibility edges{' '}
        {!isLoading ? <span className="text-text-faint">({rows.length})</span> : null}
      </h2>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <DataTable
          {...sheet}
          totalCount={rows.length}
          searchEmptyMessage="No compatibility edges match that filter."
          emptyState={
            boseModelId ? undefined : (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <Layers className="h-6 w-6 text-text-faint" />
                <p className="text-sm font-medium text-text-default">No compatibility edges</p>
                <p className="text-xs text-text-muted">
                  Link parts to models in the Bose Models section, then audit them here.
                </p>
              </div>
            )
          }
        />
      </div>

      <PartCompatibilityRemovePlane
        row={removeTarget}
        busy={remove.isPending}
        onClose={() => {
          if (!remove.isPending) setRemoveTarget(null);
        }}
        onConfirm={(row) => remove.mutate(row.id)}
      />
    </div>
  );
}
