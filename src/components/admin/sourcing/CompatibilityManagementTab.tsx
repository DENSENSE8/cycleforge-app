'use client';

/**
 * Main pane for /admin?section=compatibility — a flat audit table of
 * model ↔ part compatibility edges, optionally filtered to one model via
 * ?boseModelId. Per-model editing lives in the Bose Models section; this view
 * is the cross-cutting "what's linked to what" table with inline delete.
 */

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@/queries/keys';
import { Layers } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { AdminTable, type AdminTableColumn } from '@/design-system/components/AdminTable';

interface EdgeRow {
  id: number;
  bose_model_id: number;
  sku_id: number;
  part_role: string;
  is_oem: boolean;
  fit: string;
  confidence: string;
  source: string;
  model_number: string;
  model_name: string;
  sku: string;
  product_title: string;
}

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

  const { data, isLoading } = useQuery<{ items: EdgeRow[] }>({
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

  const columns: AdminTableColumn<EdgeRow>[] = useMemo(
    () => [
      {
        key: 'model',
        header: 'Model',
        type: 'text',
        cell: (r) => (
          <div>
            <div className="font-semibold text-text-default">{r.model_name}</div>
            <div className="text-role-caption text-text-soft">{r.model_number}</div>
          </div>
        ),
      },
      {
        key: 'part',
        header: 'Part',
        type: 'text',
        cell: (r) => (
          <div>
            <div className="font-semibold text-text-default">{r.product_title}</div>
            <div className="text-role-caption text-text-soft">{r.sku}</div>
          </div>
        ),
      },
      {
        key: 'role',
        header: 'Role',
        type: 'tag',
        cell: (r) => <span className="text-text-muted">{r.part_role}</span>,
      },
      {
        key: 'fit',
        header: 'Fit',
        type: 'tag',
        cell: (r) => (
          <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-role-micro font-semibold text-text-muted">
            {r.is_oem ? 'OEM ' : ''}
            {r.fit}
          </span>
        ),
      },
      {
        key: 'source',
        header: 'Source',
        type: 'text',
        cell: (r) => <span className="text-role-caption text-text-soft">{r.source}</span>,
      },
      {
        key: 'actions',
        header: '',
        align: 'right',
        cell: (r) => (
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => remove.mutate(r.id)}
            className="text-rose-600 hover:text-rose-700"
          >
            Remove
          </Button>
        ),
      },
    ],
    [remove],
  );

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <div className="w-full space-y-4">
        <h2 className="text-lg font-semibold text-text-default">
          Compatibility edges{' '}
          {!isLoading ? <span className="text-text-faint">({rows.length})</span> : null}
        </h2>
        <AdminTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          loading={isLoading}
          isSearching={Boolean(boseModelId)}
          searchEmptyMessage="No compatibility edges for this model."
          emptyMessage="Link parts to models in the Bose Models section, then audit them here."
          empty={
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
    </div>
  );
}
