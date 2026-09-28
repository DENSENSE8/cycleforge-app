'use client';

/**
 * Global header **Sync** — right of the inbox. One button over every sync the
 * app runs (`GET/POST /api/sync/global`), grouped by direction:
 *  - **Outbound** — the orders backfill pipeline (ShipStation → Google Sheets
 *    backup → other linked channels → exceptions, in order) and the outbound
 *    schedules (carrier tracking, Zoho fulfillment, order ingest queue).
 *  - **Inbound** — Zoho POs and receives, incoming tracking, eBay purchases.
 * Click opens the panel: per-row status, per-row run, and Sync all / Outbound
 * / Inbound. Keys: `Y` then `A` (all), `O` (outbound), `I` (inbound) — the
 * same leader grammar as `C` (Add) and `G` (Go); a scanner burst never arms.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, Loader2, RefreshCw } from '@/components/Icons';
import { KeyHintPopover, type KeyHintAt, type KeyHintRow } from '@/components/sidebar/contextual/NavGoKeys';
import { QuickAccessPanelShell } from '@/components/quick-access/QuickAccessPanelShell';
import { AnimatePresence, motion } from '@/design-system/motion';
import { motionPresence, motionTransition } from '@/design-system/foundations/motion-presets';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
import { AnchoredLayer, Button, ChordKeys, KeyboardKey, Layer } from '@/design-system/primitives';
import Link from 'next/link';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { useAuth } from '@/contexts/AuthContext';
import { DROPDOWN_SHELL_CORNER } from '@/design-system/tokens/radius';
import { elevationClass } from '@/design-system/tokens/shadows';
import { invalidateDashboardOrderQueries } from '@/lib/dashboard-query-invalidation';
import { GO_SCAN_BURST_MS } from '@/lib/keyboard/go-keys';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { registerShortcutOverviewGroup } from '@/lib/keyboard/shortcut-overview';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { formatRelativeTime } from '@/lib/search/search-recents';
import type { GlobalSyncDirection, GlobalSyncJob } from '@/lib/sync/global-sync';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import {
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_BTN_OPEN_CLASS,
  HEADER_ICON_WRAP,
  HEADER_MENU_CAPTION_CLASS,
  TOP_CHROME_ICON_FACE,
} from './header-shell';

const LEADER = 'Y';
const ARM_SETTLE_MS = GO_SCAN_BURST_MS + 20;
const ARMED_TIMEOUT_MS = 4000;
/** Jobs are independent round trips; a few at a time keeps the lane responsive. */
const CONCURRENCY = 4;
const TOAST_ID = 'global-sync';
const TOAST_MS = 12_000;
const JOBS_KEY = ['global-sync-jobs'] as const;

type Scope = 'all' | GlobalSyncDirection;

/** `Y` then a letter. */
const SCOPE_KEYS: ReadonlyArray<{ key: string; scope: Scope; label: string }> = [
  { key: 'a', scope: 'all', label: 'Sync all' },
  { key: 'o', scope: 'outbound', label: 'Sync outbound' },
  { key: 'i', scope: 'inbound', label: 'Sync inbound' },
];

const GROUPS: ReadonlyArray<{ direction: GlobalSyncDirection; title: string }> = [
  { direction: 'outbound', title: 'Outbound' },
  { direction: 'inbound', title: 'Inbound' },
];

/** The hover hint's rows — hotkey first, the leader said once in the lead line (Add's grammar). */
const HINT_ROWS: KeyHintRow[] = SCOPE_KEYS.map((s) => ({
  id: s.key,
  keys: [s.key.toUpperCase()],
  pressedId: `sync:${s.key}`,
  label: s.label,
  icon: RefreshCw,
}));

const HINT_LEAD = (
  <>
    Press <KeyboardKey size="xs">{LEADER}</KeyboardKey> then
  </>
);

type RowState = { status: 'running' } | { status: 'done'; message: string } | { status: 'error'; message: string };

async function fetchJobs(): Promise<GlobalSyncJob[]> {
  const res = await fetch('/api/sync/global');
  if (!res.ok) throw new Error('Could not load sync jobs');
  const data = (await res.json().catch(() => ({}))) as { jobs?: GlobalSyncJob[] };
  return data.jobs ?? [];
}

async function runJob(id: string): Promise<RowState> {
  try {
    const res = await fetch(`/api/sync/global?job=${encodeURIComponent(id)}`, { method: 'POST' });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; summary?: string; error?: string };
    return res.ok && data.ok
      ? { status: 'done', message: data.summary || 'Done' }
      : { status: 'error', message: data.error || `HTTP ${res.status}` };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Network error' };
  }
}

export function GlobalHeaderSync() {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  // Operations › Sync (and its `/api/cron-runs` data) is admin-only; staff get no dead-end link.
  const canSeeHistory = useAuth().has('admin.view');
  const [armed, setArmed] = useState(false);
  const [hintAt, setHintAt] = useState<KeyHintAt | null>(null);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const runningRef = useRef(false);
  const armedRef = useRef(false);
  const timer = useRef<number | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);

  // Re-read the record every minute: the crons keep syncing while the page sits.
  const jobsQuery = useQuery({ queryKey: JOBS_KEY, queryFn: fetchJobs, staleTime: 30_000, refetchInterval: 60_000, retry: false });
  const jobs = useMemo(() => jobsQuery.data ?? [], [jobsQuery.data]);
  const running = Object.values(rows).some((r) => r.status === 'running');
  /** The most recent thing that synced into the system, across every job. */
  const latest = useMemo(() => {
    let at: string | null = null;
    for (const j of jobs) if (j.lastRun && j.lastRun.status !== 'running' && (!at || j.lastRun.at > at)) at = j.lastRun.at;
    return { at, failed: jobs.some((j) => j.lastRun?.status === 'failed') };
  }, [jobs]);

  useEffect(() => setOpen(false), [pathname]);

  /** Run jobs a few at a time; each row reports its own outcome as it lands. */
  const run = useCallback(
    async (targets: readonly GlobalSyncJob[], label: string) => {
      const runnable = targets.filter((j) => j.canRun);
      if (runningRef.current || runnable.length === 0) return;
      runningRef.current = true;
      setRows((prev) => ({ ...prev, ...Object.fromEntries(runnable.map((j) => [j.id, { status: 'running' } as RowState])) }));
      let failed = 0;
      let next = 0;
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, runnable.length) }, async () => {
          while (next < runnable.length) {
            const job = runnable[next++];
            const state = await runJob(job.id);
            if (state.status === 'error') failed += 1;
            setRows((prev) => ({ ...prev, [job.id]: state }));
          }
        }),
      );
      runningRef.current = false;
      if (runnable.some((j) => j.direction === 'outbound')) await invalidateDashboardOrderQueries(queryClient);
      // The record the pill reads just changed.
      void queryClient.invalidateQueries({ queryKey: JOBS_KEY });
      const ok = runnable.length - failed;
      const message = failed === 0 ? `${label}: ${ok} synced` : `${label}: ${ok} synced, ${failed} failed`;
      if (failed === 0) toast.success(message, { id: TOAST_ID, duration: TOAST_MS, closeButton: true });
      else toast.error(message, { id: TOAST_ID, duration: TOAST_MS });
    },
    [queryClient],
  );

  const runScope = useCallback(
    async (scope: Scope) => {
      // A hotkey can fire before the panel ever loaded the list.
      const list: GlobalSyncJob[] =
        jobsQuery.data ?? (await queryClient.fetchQuery<GlobalSyncJob[]>({ queryKey: JOBS_KEY, queryFn: fetchJobs }));
      const label = SCOPE_KEYS.find((s) => s.scope === scope)!.label;
      await run(scope === 'all' ? list : list.filter((j) => j.direction === scope), label);
    },
    [jobsQuery.data, queryClient, run],
  );

  const disarm = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    armedRef.current = false;
    setArmed(false);
  }, []);

  useEffect(() => {
    let lastKeyAt = 0;
    let pending: number | null = null;
    const onKeyDown = (event: KeyboardEvent) => {
      const previousAt = lastKeyAt;
      lastKeyAt = event.timeStamp;
      if (pending !== null) {
        window.clearTimeout(pending);
        pending = null;
      }
      if (armedRef.current) {
        if (event.key === 'Shift') return;
        const hit = SCOPE_KEYS.find((s) => s.key === event.key.toLowerCase());
        if (hit && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault();
          event.stopPropagation();
          disarm();
          void runScope(hit.scope);
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
        }
        disarm();
        return;
      }
      if (
        event.key.toLowerCase() !== LEADER.toLowerCase()
        || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey
        || event.repeat || event.isComposing || event.defaultPrevented
        || event.timeStamp - previousAt < GO_SCAN_BURST_MS
        || isEditableKeyTarget(event.target)
        || hasOpenOverlay()
        || document.querySelector('[role="dialog"][data-state="open"]')
      ) {
        return;
      }
      // No preventDefault: a wedge scan listener still gets this key if a burst follows.
      pending = window.setTimeout(() => {
        pending = null;
        armedRef.current = true;
        setArmed(true);
        timer.current = window.setTimeout(disarm, ARMED_TIMEOUT_MS);
      }, ARM_SETTLE_MS);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (armedRef.current && !(event.target instanceof Element && event.target.closest('[data-sync-keys]'))) disarm();
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      if (pending !== null) window.clearTimeout(pending);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
      disarm();
    };
  }, [disarm, runScope]);

  useEffect(
    () =>
      registerShortcutOverviewGroup({
        id: 'global-sync',
        title: 'Sync',
        rows: SCOPE_KEYS.map((s) => ({ keys: [LEADER, s.key.toUpperCase()], label: s.label })),
      }),
    [],
  );

  // One fixed-size key (owner 2026-09-28: no text, never changes width): the
  // glyph spins while this session runs jobs; the dot is the record's state.
  const dot = running || jobs.some((j) => j.lastRun?.status === 'running')
    ? { tone: 'bg-blue-500 animate-pulse motion-reduce:animate-none', says: 'syncing' }
    : latest.failed
      ? { tone: 'bg-amber-500', says: 'a sync failed' }
      : latest.at
        ? { tone: 'bg-emerald-500', says: 'up to date' }
        : null;

  return (
    <div ref={anchorRef} className={HEADER_ICON_WRAP}>
      <button
        type="button"
        onClick={() => {
          setHintAt(null);
          setOpen((o) => !o);
        }}
        // Hover TEACHES the keys, exactly like Add: a hint under the key,
        // flush right — "Press [Y] then" over the scope rows. Never while open.
        onPointerEnter={(event) => {
          if (event.pointerType !== 'mouse' || open) return;
          const rect = event.currentTarget.getBoundingClientRect();
          setHintAt({ right: window.innerWidth - rect.right, top: rect.bottom + 4 });
        }}
        onPointerLeave={() => setHintAt(null)}
        onPointerDown={() => setHintAt(null)}
        aria-label={[
          'Sync',
          dot?.says,
          latest.at ? `last synced ${formatRelativeTime(latest.at)}` : null,
        ].filter(Boolean).join(' — ')}
        aria-expanded={open}
        aria-keyshortcuts={LEADER}
        data-testid="global-sync-button"
        data-syncing={running || undefined}
        className={cn(
          'ds-raw-button relative inline-flex items-center justify-center',
          HEADER_ICON_BTN_CLASS,
          open && HEADER_ICON_BTN_OPEN_CLASS,
          focusRing('control'),
        )}
      >
        <RefreshCw className={cn(TOP_CHROME_ICON_FACE, running && 'animate-spin motion-reduce:animate-none')} aria-hidden />
        {dot ? (
          <span
            aria-hidden
            data-testid="global-sync-dot"
            className={cn('pointer-events-none absolute right-1 top-1 size-2 rounded-full ring-2 ring-surface-card', dot.tone)}
          />
        ) : null}
      </button>
      <KeyHintPopover id="sync" at={open ? null : hintAt} rows={HINT_ROWS} lead={HINT_LEAD} />
      <AnchoredLayer open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} placement="bottom-end" gap={0} edgeAlign="viewport">
        <QuickAccessPanelShell
          title="Sync"
          ariaLabel="Sync"
          onClose={() => setOpen(false)}
          widthClass="w-[360px]"
          bodyClassName="px-0 py-0"
          headerActions={
            <Button
              size="sm"
              type="button"
              icon={<RefreshCw aria-hidden className="h-3.5 w-3.5" />}
              disabled={running || jobs.length === 0}
              onClick={() => void runScope('all')}
              data-testid="global-sync-all"
            >
              Sync all
            </Button>
          }
          footer={
            // Every run — scheduled or pressed here — with its summary: the
            // past-imports record (owner 2026-09-28: it lives on the sync page).
            canSeeHistory ? (
            <Link
              href="/operations?mode=sync"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-role-caption font-semibold text-text-soft hover:text-text-default"
              data-testid="global-sync-history"
            >
              Sync history & past imports →
            </Link>
            ) : undefined
          }
        >
          {jobsQuery.isLoading ? <p className="px-4 py-6 text-role-caption text-text-muted">Loading syncs…</p> : null}
          {jobsQuery.isError ? <p className="px-4 py-6 text-role-caption text-text-danger">Could not load syncs.</p> : null}
          {GROUPS.map(({ direction, title }) => {
            const group = jobs.filter((j) => j.direction === direction);
            if (group.length === 0) return null;
            return (
              <section key={direction} className="border-b border-border-hairline py-1 last:border-b-0" data-testid={`global-sync-group-${direction}`}>
                <div className="flex items-center justify-between px-4 py-1">
                  <span className={HEADER_MENU_CAPTION_CLASS}>{title}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    className="h-6 px-2 text-role-caption"
                    disabled={running}
                    onClick={() => void runScope(direction)}
                    data-testid={`global-sync-${direction}`}
                  >
                    Sync {title.toLowerCase()}
                  </Button>
                </div>
                <ul>
                  {group.map((job) => (
                    <SyncRow key={job.id} job={job} state={rows[job.id]} disabled={running} onRun={() => void run([job], job.label)} />
                  ))}
                </ul>
              </section>
            );
          })}
        </QuickAccessPanelShell>
      </AnchoredLayer>
      <SyncKeysCard on={armed} onRun={(scope) => { disarm(); void runScope(scope); }} />
    </div>
  );
}

function SyncRow({ job, state, disabled, onRun }: { job: GlobalSyncJob; state?: RowState; disabled: boolean; onRun: () => void }) {
  return (
    <li className="flex items-center gap-2 px-4 py-1.5 text-role-body" data-testid={`global-sync-row-${job.id}`} data-state={state?.status ?? 'idle'}>
      <span className="flex size-4 shrink-0 items-center justify-center">
        {state?.status === 'running' ? <Loader2 className="size-3.5 animate-spin text-text-muted motion-reduce:animate-none" aria-hidden /> : null}
        {state?.status === 'done' ? <Check className="size-3.5 text-text-success" aria-hidden /> : null}
        {state?.status === 'error' ? <AlertCircle className="size-3.5 text-text-danger" aria-hidden /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-text-default">{job.label}</span>
        {state && state.status !== 'running' ? (
          <span className={cn('block truncate text-role-micro', state.status === 'error' ? 'text-text-danger' : 'text-text-muted')} title={state.message}>
            {state.message}
          </span>
        ) : !state && job.lastRun ? (
          // The ledger's record when this session has not run it: cron or manual.
          <span className={cn('block truncate text-role-micro', job.lastRun.status === 'failed' ? 'text-text-danger' : 'text-text-muted')}>
            {job.lastRun.status === 'running'
              ? 'Running now'
              : `${job.lastRun.status === 'failed' ? 'Failed' : 'Synced'} ${formatRelativeTime(job.lastRun.at)}`}
          </span>
        ) : !state ? (
          <span className="block text-role-micro text-text-faint">Never run</span>
        ) : null}
      </span>
      <Button
        variant="ghost"
        size="sm"
        type="button"
        className="h-6 px-2 text-role-caption"
        disabled={disabled || !job.canRun}
        title={job.canRun ? undefined : 'You do not have permission to run this sync'}
        onClick={onRun}
      >
        Run
      </Button>
    </li>
  );
}

/** The small card in the middle of the screen after `Y`: which key comes next. */
function SyncKeysCard({ on, onRun }: { on: boolean; onRun: (scope: Scope) => void }) {
  const presence = useMotionPresence(motionPresence.dropdownPanel);
  const transition = useMotionTransition(motionTransition.dropdownOpen);
  return (
    <Layer level="command" className="pointer-events-none fixed inset-0 flex items-center justify-center">
      <AnimatePresence>
        {on ? (
          <motion.div
            key="sync-keys"
            initial={presence.initial}
            animate={presence.animate}
            exit={presence.exit}
            transition={transition}
            role="status"
            aria-live="polite"
            data-sync-keys=""
            data-testid="global-sync-keys"
            className={cn('pointer-events-auto flex flex-col gap-0.5 border border-border-soft bg-surface-card p-1.5', DROPDOWN_SHELL_CORNER, elevationClass('raised', 'soft'))}
          >
            <p className="flex items-center gap-1.5 px-2 pb-1 pt-0.5 text-role-micro text-text-muted">
              <KeyboardKey size="xs">{LEADER}</KeyboardKey> Sync — then press
            </p>
            {SCOPE_KEYS.map((s) => (
              <button
                key={s.key}
                type="button"
                tabIndex={-1}
                onClick={() => onRun(s.scope)}
                className="ds-raw-button flex min-w-[15rem] cursor-pointer items-center gap-3 rounded-mode-control px-2 py-1.5 text-left text-role-body text-text-default hover:bg-surface-hover"
                data-testid={`global-sync-key-${s.key}`}
              >
                <ChordKeys keys={[LEADER, s.key.toUpperCase()]} size="sm" />
                {s.label}
              </button>
            ))}
            <p className="px-2 pt-1 text-role-micro text-text-faint">
              <KeyboardKey size="xs">esc</KeyboardKey> cancel
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Layer>
  );
}
