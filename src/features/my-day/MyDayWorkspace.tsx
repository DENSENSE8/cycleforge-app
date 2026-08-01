'use client';

/**
 * My Day — Home Today's composition root (Workbench contract:
 * `.claude/rules/display/workbench.md`).
 *
 * Three modules, one job each (F0 of
 * `docs/todo/daily-triage-FRONTEND-PLAN-VALIDATION.md`):
 *   {@link MyDayRail}       — the collection map (ranked personal work)
 *   {@link MyDayTriagePane} — the focus surface for the picked row
 *   {@link useMyDayFeed}    — the one client of `GET /api/my-day`
 *
 * This file now owns only what spans them: the feed's loading/error gate and
 * the current pick. Selection stays local `useState` — F0 adds no routing, so
 * it is not URL-durable yet (that lands with F1's filters).
 */

import { useMemo, useState } from 'react';
import { Loader2 } from '@/components/Icons';
import type { MyDaySelectedItem } from '@/lib/my-day/my-day-types';
import { useMyDayFeed } from './useMyDayFeed';
import { MyDayRail } from './MyDayRail';
import { MyDayTriagePane } from './MyDayTriagePane';

export function MyDayWorkspace() {
  const { data, isLoading, isError } = useMyDayFeed();
  const [selected, setSelected] = useState<MyDaySelectedItem | null>(null);

  const selectedId = useMemo(() => {
    if (!selected) return null;
    return selected.kind === 'work_order' ? selected.row.id : selected.item.id;
  }, [selected]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
        <span className="ml-2 text-role-caption font-medium text-text-muted">Loading My Day…</span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-6 text-center">
          <p className="text-role-caption font-semibold text-rose-700">Could not load My Day. Try refreshing.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-surface-canvas text-text-default">
      <MyDayRail data={data} selectedId={selectedId} onSelect={setSelected} />
      <MyDayTriagePane selected={selected} />
    </div>
  );
}
