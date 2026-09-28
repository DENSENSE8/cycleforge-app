'use client';

/**
 * The Bose model list beside the Models / Compatibility detail on /sourcing.
 * It was the old context panel's picker; the contextual sidebar now owns the
 * filter (`?search=`, NavFind) and the Add model verb (`sourcing.add-model`,
 * the desk header), so this is only the list — in the stage, left of the
 * record it opens.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { qk } from '@/queries/keys';
import { AdminPickerRow, useAdminUrlState } from '../shared';
import { HoverTooltip } from '@/components/ui/HoverTooltip';

interface BoseModelListRow {
  id: number;
  model_number: string;
  model_name: string;
  family: string | null;
  compat_count: number;
}

export function BoseModelPickerPane({
  param,
  allRow,
}: {
  /** The URL param a pick writes: `model` (Models' editor) or `boseModelId` (Compatibility's edge filter). */
  param: 'model' | 'boseModelId';
  /** Compatibility's "every model" row, which clears `param`. */
  allRow?: { title: string; subtitle: string };
}) {
  const { searchParams, setParam } = useAdminUrlState();
  const search = searchParams.get('search') ?? '';
  const selected = searchParams.get(param) ?? '';

  const { data, isLoading } = useQuery<{ items: BoseModelListRow[] }>({
    queryKey: qk.boseModels.list(search, ''),
    queryFn: async () => {
      const q = search.trim();
      const url = q ? `/api/bose-models?q=${encodeURIComponent(q)}` : '/api/bose-models';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch Bose models');
      return res.json();
    },
  });
  const rows = useMemo(() => data?.items ?? [], [data]);

  return (
    <nav
      aria-label="Bose models"
      data-testid="sourcing-model-picker"
      className="h-full w-72 shrink-0 overflow-y-auto border-r border-border-soft bg-surface-card p-2"
    >
      <ul className="space-y-1.5">
        {allRow ? (
          <li>
            <AdminPickerRow
              selected={selected === ''}
              onPick={() => setParam((p) => p.delete(param))}
              title={allRow.title}
              subtitle={allRow.subtitle}
            />
          </li>
        ) : null}
        {isLoading ? (
          <li className="px-2 py-6 text-center text-xs text-text-faint">Loading models…</li>
        ) : rows.length === 0 ? (
          <li className="px-2 py-6 text-center text-xs text-text-faint">
            {search.trim() ? 'No models match the filter.' : 'No Bose models yet.'}
          </li>
        ) : (
          rows.map((row) => (
            <li key={row.id}>
              <AdminPickerRow
                selected={selected === String(row.id)}
                onPick={() => setParam((p) => p.set(param, String(row.id)))}
                title={row.model_name}
                subtitle={row.family ? `${row.model_number} · ${row.family}` : row.model_number}
                trailing={
                  <HoverTooltip
                    label={`${row.compat_count} compatible part${row.compat_count === 1 ? '' : 's'}`}
                    asChild
                    focusable={false}
                  >
                    <span className="rounded-full bg-surface-sunken inset-chip text-role-micro font-semibold text-text-muted">
                      {row.compat_count}
                    </span>
                  </HoverTooltip>
                }
              />
            </li>
          ))
        )}
      </ul>
    </nav>
  );
}
