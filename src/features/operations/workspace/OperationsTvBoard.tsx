'use client';

/**
 * Operations TV / wall board (HOME-OPS Phase C, plan §7 / §27).
 *
 * Archetype: **Monitor** — observe-only, no durable selection, no edit chrome.
 * Data-first "what must be done on time" board for an unattended wall, read at
 * 3–5m: wall-scale KpiStrip + SectionCards (composed from the Monitor block
 * registry; the hero scale is the additive `size="wall"` grow of KpiTile, not a
 * page-local twin). Live via `ops_plan.updated` (useOperationsTvBoard); a
 * network blip degrades to a "Reconnecting" pill over the last board, never a
 * blank freeze (§27 — reused OfflineBanner's semantics inline because the `tv=1`
 * takeover overlay sits above the global banner's z-band).
 *
 * `blocked` has no first-class column until collab (Phase D); Overdue is the
 * honest stuck signal today and is what this shows.
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/utils/_cn';
import {
  KpiStrip,
  MonitorListBlock,
  MonitorListRow,
  MonitorPageShell,
  SectionCard,
} from '@/design-system/components/monitor';
import { framerVariants } from '@/design-system/foundations/motion-framer';
import { Activity, AlertTriangle, CheckCircle, Clock, Layers, Loader2, Warehouse } from '@/components/Icons';
import { formatDateKeyShort, formatTime12hPST } from '@/utils/date';
import type { TvBoard, TvBoardPlan, TvBoardStation, TvBoardTask, TvPlanSource } from '@/lib/ops-plans/tv-board';
import { useOperationsTvBoard } from './useOperationsTvBoard';

const SOURCE_LABEL: Record<TvPlanSource, string> = {
  agentic: 'Product plan',
  adoption: 'Adoption',
  authored: 'Floor plan',
};

/** navigator.onLine, tracked — the wall must show its own liveness. */
function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

export function OperationsTvBoard() {
  const query = useOperationsTvBoard();
  const online = useOnline();
  const state = query.data;
  const board = state?.board ?? null;
  const notEnabled = !!state && !state.enabled;

  // No data yet.
  if (query.isLoading) {
    return (
      <TvFrame>
        <div className="flex flex-1 items-center justify-center gap-3 text-text-faint">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-lg font-bold">Loading operations board…</span>
        </div>
      </TvFrame>
    );
  }

  if (notEnabled) {
    return (
      <TvFrame>
        <TeachingEmpty
          title="Operations TV board isn’t enabled here"
          detail="Ask an admin to enable the Operations wall board for this organization (feature flag ops_tv_board)."
        />
      </TvFrame>
    );
  }

  if (!board) {
    return (
      <TvFrame>
        <div className="mx-auto mt-16 max-w-xl rounded-2xl border border-dashed border-rose-200 bg-rose-50 px-6 py-10 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-rose-500" />
          <p className="mt-3 text-lg font-black text-rose-700">Couldn’t load the operations board</p>
          <p className="mt-1 text-sm font-semibold text-rose-500">Retrying automatically…</p>
        </div>
      </TvFrame>
    );
  }

  // We have a board — render it, degrading (not blanking) if the connection is
  // down or the latest refresh failed.
  const degraded = !online || query.isError || (query.failureCount > 0 && !query.isFetching);

  return <TvBoardBody board={board} online={online} degraded={degraded} />;
}

// ── Frame + header ───────────────────────────────────────────────────────────

function TvFrame({ children, header }: { children: React.ReactNode; header?: React.ReactNode }) {
  return (
    <MonitorPageShell stagger contentClassName="flex-1 mx-auto w-full max-w-[1800px] px-6 pt-6 pb-10 space-y-6">
      {header}
      {children}
    </MonitorPageShell>
  );
}

function StatusPill({ online, degraded, updatedAt }: { online: boolean; degraded: boolean; updatedAt: string }) {
  const tone = !online
    ? { dot: 'bg-rose-500', text: 'text-text-danger', label: 'Offline' }
    : degraded
      ? { dot: 'bg-amber-500', text: 'text-text-warning', label: 'Reconnecting' }
      : { dot: 'bg-emerald-500', text: 'text-text-success', label: 'Live' };
  return (
    <div className="flex items-center gap-3">
      <span className="inline-flex items-center gap-2 rounded-full border border-border-soft bg-surface-card px-3 py-1.5">
        <span className={cn('h-2.5 w-2.5 rounded-full', tone.dot, !degraded && online && 'animate-pulse')} aria-hidden />
        <span className={cn('text-role-caption font-black uppercase tracking-widest', tone.text)}>{tone.label}</span>
      </span>
      <span className="text-role-caption font-bold uppercase tracking-widest text-text-faint">
        Updated {formatTime12hPST(updatedAt)}
      </span>
    </div>
  );
}

function TvBoardBody({ board, online, degraded }: { board: TvBoard; online: boolean; degraded: boolean }) {
  const header = (
    <motion.header
      variants={framerVariants.monitorStaggerItem}
      className="flex flex-wrap items-center justify-between gap-4"
    >
      <div className="flex items-center gap-3.5">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-accent text-text-accent">
          <Activity className="h-7 w-7" />
        </span>
        <div>
          <h1 className="text-3xl font-black leading-none tracking-tight text-text-default">On-time board</h1>
          <p className="mt-1.5 text-role-caption font-bold uppercase tracking-widest text-text-soft">
            Operations · {formatDateKeyShort(board.dateKey)}
          </p>
        </div>
      </div>
      <StatusPill online={online} degraded={degraded} updatedAt={board.generatedAt} />
    </motion.header>
  );

  const kpis = [
    { label: 'Due today', value: board.counts.dueToday.toLocaleString(), valueClassName: 'text-text-info' },
    {
      label: 'Overdue',
      value: board.counts.overdue.toLocaleString(),
      valueClassName: board.counts.overdue > 0 ? 'text-text-danger' : 'text-text-default',
    },
    { label: 'In progress', value: board.counts.inProgress.toLocaleString(), valueClassName: 'text-text-warning' },
    { label: 'Open tasks', value: board.counts.open.toLocaleString(), valueClassName: 'text-text-default' },
  ];

  return (
    <TvFrame header={header}>
      <KpiStrip items={kpis} size="wall" stagger />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard stagger icon={AlertTriangle} eyebrow="Slipping" title="Overdue" headline={board.counts.overdue}>
          <TaskLane
            tasks={board.overdue}
            emptyIcon={CheckCircle}
            emptyLabel="Nothing overdue — the floor is on time."
            overdue
          />
          {board.overdue.length > 0 ? (
            <p className="mt-2 text-role-micro font-semibold uppercase tracking-widest text-text-faint">
              A first-class “blocked” signal arrives with collab (Phase D); overdue is today’s stuck proxy.
            </p>
          ) : null}
        </SectionCard>

        <SectionCard stagger icon={Clock} eyebrow="Today" title="Due today" headline={board.counts.dueToday}>
          <TaskLane
            tasks={board.dueToday}
            emptyIcon={CheckCircle}
            emptyLabel="No tasks due today."
          />
        </SectionCard>
      </div>

      <SectionCard
        stagger
        icon={Warehouse}
        eyebrow="Load"
        title="By station"
        meta={`${board.counts.open.toLocaleString()} open · ${board.counts.unscheduled.toLocaleString()} with no due date`}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {board.byStation.map((s) => (
            <StationTile key={s.station} station={s} />
          ))}
        </div>
      </SectionCard>

      {board.plans.length > 0 ? (
        <SectionCard stagger icon={Layers} eyebrow="Progress" title="Active plans">
          <div className="space-y-3">
            {board.plans.slice(0, 8).map((p) => (
              <PlanProgressRow key={p.planId} plan={p} />
            ))}
          </div>
        </SectionCard>
      ) : null}
    </TvFrame>
  );
}

// ── Lanes ────────────────────────────────────────────────────────────────────

function TaskLane({
  tasks,
  emptyIcon: EmptyIcon,
  emptyLabel,
  overdue = false,
}: {
  tasks: TvBoardTask[];
  emptyIcon: (p: { className?: string }) => JSX.Element;
  emptyLabel: string;
  overdue?: boolean;
}) {
  if (tasks.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border-soft bg-surface-canvas px-4 py-8 text-center">
        <EmptyIcon className="h-5 w-5 text-text-faint" />
        <span className="text-role-caption font-bold text-text-faint">{emptyLabel}</span>
      </div>
    );
  }
  return (
    <MonitorListBlock>
      {tasks.map((t) => (
        <MonitorListRow
          key={t.id}
          title={<span className="text-lg font-bold text-text-default">{t.title}</span>}
          meta={
            <span className="text-role-caption font-semibold uppercase tracking-widest text-text-soft">
              {t.station} · {t.planTitle}
              {t.assigneeName ? ` · ${t.assigneeName}` : ' · Unassigned'}
            </span>
          }
          trailing={
            overdue ? (
              <span className="rounded-full border border-border-danger bg-surface-danger px-2.5 py-1 text-role-caption font-black uppercase tracking-widest text-text-danger">
                {t.daysLate}d late
              </span>
            ) : (
              <span className="text-role-caption font-black uppercase tracking-widest text-text-info">
                {t.dueAt ? formatTime12hPST(t.dueAt) : 'Today'}
              </span>
            )
          }
        />
      ))}
    </MonitorListBlock>
  );
}

function StationTile({ station }: { station: TvBoardStation }) {
  const hasOverdue = station.overdue > 0;
  return (
    <div className="rounded-2xl border border-border-soft bg-surface-card p-4">
      <p className="text-role-caption font-black uppercase tracking-widest text-text-soft">{station.station}</p>
      <p
        className={cn(
          'mt-1.5 text-4xl font-black tabular-nums leading-none',
          hasOverdue ? 'text-text-danger' : station.open > 0 ? 'text-text-default' : 'text-text-faint',
        )}
      >
        {station.open.toLocaleString()}
      </p>
      <div className="mt-2 flex min-h-[1.25rem] flex-wrap items-center gap-1.5">
        {hasOverdue ? (
          <span className="rounded border border-border-danger bg-surface-danger inset-chip text-role-micro uppercase tracking-widest text-text-danger">
            {station.overdue} overdue
          </span>
        ) : null}
        {station.inProgress > 0 ? (
          <span className="rounded border border-border-warning bg-surface-warning inset-chip text-role-micro uppercase tracking-widest text-text-warning">
            {station.inProgress} active
          </span>
        ) : null}
        {station.agentic > 0 ? (
          <span className="text-role-micro font-semibold uppercase tracking-widest text-text-faint">
            {station.agentic} plan
          </span>
        ) : null}
      </div>
    </div>
  );
}

function PlanProgressRow({ plan }: { plan: TvBoardPlan }) {
  const pct = Math.max(0, Math.min(100, Math.round(plan.percentComplete)));
  const done = pct >= 100;
  return (
    <div className="rounded-xl border border-border-soft bg-surface-canvas p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-text-default">{plan.title}</p>
          <p className="mt-0.5 text-role-micro font-semibold uppercase tracking-widest text-text-faint">
            {SOURCE_LABEL[plan.source]} · {plan.done}/{plan.total} done
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 text-2xl font-black tabular-nums leading-none',
            done ? 'text-text-success' : 'text-text-default',
          )}
        >
          {pct}%
        </span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-strong">
        <div
          className={cn('h-full rounded-full', done ? 'bg-emerald-500' : 'bg-blue-500')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Shared states ────────────────────────────────────────────────────────────

function TeachingEmpty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mx-auto mt-16 max-w-xl rounded-2xl border border-dashed border-border-soft bg-surface-canvas px-6 py-10 text-center">
      <Activity className="mx-auto h-8 w-8 text-text-faint" />
      <p className="mt-3 text-lg font-black text-text-default">{title}</p>
      <p className="mt-1.5 text-sm font-semibold text-text-soft">{detail}</p>
    </div>
  );
}
