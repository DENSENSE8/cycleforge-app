'use client';

/**
 * Home "Tasks" mode (plan §6.2 / Phase B) — a Workbench over ops-plan tasks.
 *
 * Left: scope toggle (Mine / All) + a ranked list from GET /api/ops-plans/inbox.
 * Right: the selected task's detail with claim / complete / reopen (the existing
 * ops-plans task routes; permission-gated via `has`). Selection is durable in
 * the URL (`?task=`); the list live-refreshes on `ops_plan.updated` (Ably).
 *
 * Composes: the inbox API, TASK_STATUS_DOT, and the house one-row anatomy — no
 * new list engine, no new search waist.
 */

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, CheckCircle, ClipboardList } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { HorizontalButtonSlider } from '@/components/ui/HorizontalButtonSlider';
import { TASK_STATUS_DOT } from '@/components/sidebar/operations/plans-shared';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/utils/_cn';
import {
  useHomeTasks,
  useTaskActions,
  type HomeTaskItem,
  type HomeTasksScope,
} from './useHomeTasks';

const SCOPE_ITEMS = [
  { id: 'mine', label: 'Mine' },
  { id: 'all', label: 'All' },
];

function parseScope(raw: string | null): HomeTasksScope {
  return raw === 'all' ? 'all' : 'mine';
}

function statusDot(status: string) {
  return TASK_STATUS_DOT[status] ?? { dot: 'bg-surface-inverse-soft', label: status };
}

function TaskListRow({
  item,
  selected,
  onSelect,
}: {
  item: HomeTaskItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const dot = statusDot(item.status);
  const meta = [item.planTitle, item.station].filter(Boolean).join(' · ');
  return (
    // ds-raw-button: full-row task selector, not a standalone Button action
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full flex-col gap-0.5 px-4 py-2 text-left transition-colors',
        selected ? 'bg-blue-50 ring-1 ring-inset ring-blue-400' : 'hover:bg-gray-50',
      )}
    >
      <div className="flex items-center gap-2">
        <HoverTooltip label={dot.label} focusable={false}>
          <span className={cn('h-2 w-2 shrink-0 rounded-full', dot.dot)} />
        </HoverTooltip>
        <span className="truncate text-role-caption font-bold text-gray-900">{item.title}</span>
      </div>
      {meta ? (
        <span className="truncate pl-4 text-role-eyebrow font-semibold uppercase tracking-widest text-gray-500">
          {meta}
        </span>
      ) : null}
    </button>
  );
}

function TaskDetail({ item }: { item: HomeTaskItem }) {
  const { has } = useAuth();
  const { claim, complete, reopen } = useTaskActions();
  const busy = claim.isPending || complete.isPending || reopen.isPending;

  const isPlanTask = item.source === 'plan_task';
  const canClaim = has('operations.plans.claim');
  const canManage = has('operations.plans.manage');
  const dot = statusDot(item.status);

  const showClaim = isPlanTask && item.status === 'open' && item.assigneeStaffId == null && canClaim;
  const showComplete =
    isPlanTask && (item.status === 'in_progress' || item.assigneeStaffId != null) && item.status !== 'done' && canClaim;
  const showReopen = isPlanTask && item.status === 'in_progress' && canManage;

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="rounded-2xl border border-border-soft bg-surface-card p-6 shadow-sm">
        <div className="flex items-start gap-2">
          <span className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', dot.dot)} />
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-text-strong">{item.title}</h2>
            {item.subtitle ? <p className="mt-0.5 text-sm text-text-muted">{item.subtitle}</p> : null}
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3">
          {[
            ['Status', dot.label],
            ['Plan', item.planTitle ?? '—'],
            ['Station', item.station ?? '—'],
            ['Assignee', item.assigneeName ?? 'Unassigned'],
          ].map(([label, value]) => (
            <div key={label} className="space-y-1">
              <dt className="text-role-micro uppercase tracking-widest text-text-soft">{label}</dt>
              <dd className="truncate text-sm font-semibold text-text-strong">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 flex flex-wrap gap-2">
          {showClaim ? (
            <Button
              variant="primary"
              size="sm"
              disabled={busy}
              onClick={() => claim.mutate(item.id)}
              icon={claim.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
            >
              Claim
            </Button>
          ) : null}
          {showComplete ? (
            // ds-raw-button: emerald "complete" action — Button has no success/emerald variant yet (grow it → migrate)
            <button
              type="button"
              disabled={busy}
              onClick={() => complete.mutate(item.id)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
            >
              {complete.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              Complete
            </button>
          ) : null}
          {showReopen ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => reopen.mutate(item.id)}
              icon={reopen.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
            >
              Reopen
            </Button>
          ) : null}
          {item.source === 'work_assignment' && item.sourcePath ? (
            <Link
              href={item.sourcePath}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border-soft bg-surface px-3 py-1.5 text-sm font-semibold text-text-strong transition-colors hover:bg-surface-sunken"
            >
              Open work order
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function HomeTasksMode() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scope = parseScope(searchParams.get('scope'));
  const selectedId = searchParams.get('task');

  const { data, isLoading, isError } = useHomeTasks(scope);
  const items = data?.items ?? [];
  const selected = useMemo(
    () => items.find((it) => it.id === selectedId) ?? null,
    [items, selectedId],
  );

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null) params.delete(k);
        else params.set(k, v);
      }
      router.replace(`/?${params.toString()}`);
    },
    [router, searchParams],
  );

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* Left: ranked task list */}
      <div className="flex w-full max-w-md flex-col border-r border-border-soft bg-surface-card lg:w-[380px]">
        <div className="border-b border-border-hairline px-3 py-2">
          <HorizontalButtonSlider
            items={SCOPE_ITEMS}
            value={scope}
            onChange={(id) => setParams({ scope: id === 'mine' ? null : id, task: null })}
            variant="nav"
            dense
            className="w-full"
            aria-label="Task scope"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-border-hairline">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 px-4 py-10 text-role-caption text-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading tasks…
            </div>
          ) : isError ? (
            <div className="px-4 py-6">
              <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-6 text-center text-role-caption font-bold text-rose-700">
                Could not load tasks. Try refreshing.
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="px-4 py-6">
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-role-caption text-text-muted">
                {scope === 'mine' ? 'No open tasks assigned to you.' : 'No open tasks right now.'}
              </div>
            </div>
          ) : (
            items.map((item) => (
              <TaskListRow
                key={item.id}
                item={item}
                selected={item.id === selectedId}
                onSelect={() => setParams({ task: item.id })}
              />
            ))
          )}
        </div>
      </div>

      {/* Right: task detail */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-surface-canvas">
        {selected ? (
          <TaskDetail item={selected} />
        ) : (
          <div className="flex h-full items-center justify-center px-6">
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-6 py-8 text-center">
              <ClipboardList className="mx-auto h-6 w-6 text-text-soft" />
              <p className="mt-2 text-role-caption font-semibold text-text-muted">
                Select a task to view details and claim or complete it.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
