'use client';

/**
 * Main pane for /admin?section=compatibility — a flat audit table of
 * model ↔ part compatibility edges, optionally filtered to one model via
 * ?boseModelId. Per-model editing lives in the Bose Models section; this view
 * is the cross-cutting "what's linked to what" table with inline delete.
 */

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@/queries/keys';
import { DataTable } from '@/components/tables/DataTable';
import { useCompatibilitySpreadsheet } from '@/components/admin/sourcing/compatibility/useCompatibilitySpreadsheet';
import type { CompoundRowAction } from '@/components/tables/compound/compound-row-model';
import type { CompatibilityEdgeRow } from '@/lib/sourcing/compatibility-edge-row';


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

  const queryKey = boseModelId
    ? qk.partCompatibility.forModel(Number(boseModelId))
    : qk.partCompatibility.all;

  const { data, isLoading } = useQuery<{ items: CompatibilityEdgeRow[] }>({
    queryKey,
    queryFn: () =>
      jsonFetch(boseModelId ? `/api/part-compatibility?boseModelId=${boseModelId}` : '/api/part-compatibility'),
  });

  const remove = useMutation({
    mutationFn: (id: number) => jsonFetch(`/api/part-compatibility/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.partCompatibility.all });
      queryClient.invalidateQueries({ queryKey: qk.boseModels.all });
    },
  });

  const rows = useMemo(() => data?.items ?? [], [data]);

  /*
    The one VERB, resolved per row. It was a trailing ACTIONS cell with a delete
    button — a per-family cell, and the reason this tab could not mount the
    shared row.
  */
  const rowActions = useCallback(
    (row: CompatibilityEdgeRow): readonly CompoundRowAction[] => [
      {
        key: 'remove',
        label: 'Delete rule',
        tone: 'danger',
        onSelect: () => remove.mutate(row.id),
      },
    ],
    [remove],
  );

  const sheet = useCompatibilitySpreadsheet({ rows, loading: isLoading, rowActions });

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <div className="w-full space-y-4">
        <h2 className="text-lg font-semibold text-text-default">
          Compatibility edges{' '}
          {!isLoading ? <span className="text-text-faint">({rows.length})</span> : null}
        </h2>
        <DataTable {...sheet} totalCount={rows.length} />
      </div>
    </div>
  );
}
