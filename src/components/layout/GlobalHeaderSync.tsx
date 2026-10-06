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
 * The runs and the job list live in `@/lib/sync/global-sync-client`; the spin
 * and each row read the background-work record, so a cron the ledger says is
 * running spins here too. Sync is the header's "what the system is doing" key:
 * it spins for prints as well, and its panel lists print jobs (dismissed
 * cards included) above the syncs.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, Loader2, RefreshCw } from '@/components/Icons';
import { KeyHintPopover, type KeyHintAt, type KeyHintRow } from '@/components/sidebar/contextual/NavGoKeys';
import { QuickAccessPanelShell } from '@/components/quick-access/QuickAccessPanelShell';
import { AnimatePresence, motion } from '@/design-system/motion';
import { motionPresence, motionTransition } from '@/design-system/foundations/motion-presets';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
import { AnchoredLayer, Button, ChordKeys, KeyboardKey, Layer } from '@/design-system/primitives';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { DROPDOWN_SHELL_CORNER } from '@/design-system/tokens/radius';
import { elevationClass } from '@/design-system/tokens/shadows';
import { isLiveWork, useBackgroundWork, type WorkItem } from '@/lib/background-work/store';
import { GO_SCAN_BURST_MS } from '@/lib/keyboard/go-keys';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { registerShortcutOverviewGroup } from '@/lib/keyboard/shortcut-overview';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { formatRelativeTime } from '@/lib/search/search-recents';
import type { GlobalSyncDirection, GlobalSyncJob } from '@/lib/sync/global-sync';
import { fetchGlobalSyncJobs, runGlobalSync, syncWorkId, useGlobalSyncJobs } from '@/lib/sync/global-sync-client';
import { cn } from '@/utils/_cn';
import { PrintJobRow } from './PrintJobBanner';
import { HEADER_MENU_CAPTION_CLASS, HEADER_PILL_CLASS, TOP_CHROME_ICON_FACE } from './header-shell';

const LEADER = 'Y';
const ARM_SETTLE_MS = GO_SCAN_BURST_MS + 20;
const ARMED_TIMEOUT_MS = 4000;

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

export function GlobalHeaderSync() {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  // The import record (`/operations/imports`) is gated on `orders.view`, so every staffer who reads orders gets the door.
  const canSeeHistory = useAuth().has('orders.view');
  const [armed, setArmed] = useState(false);
  const [hintAt, setHintAt] = useState<KeyHintAt | null>(null);
  const armedRef = useRef(false);
  const timer = useRef<number | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);

  const { query: jobsQuery, jobs } = useGlobalSyncJobs();
  // Every sync — pressed here, anywhere in this tab, or a cron the ledger says is running — is a work item.
  const work = useBackgroundWork();
  const syncWork = useMemo(
    () => new Map(work.items.filter((item) => item.kind === 'sync').map((item) => [item.id, item])),
    [work],
  );
  const running = [...syncWork.values()].some((item) => item.status === 'running');
  const printJobs = useMemo(() => work.items.filter((item) => item.kind === 'print'), [work]);
  const printing = printJobs.some((item) => isLiveWork(item.status));
  const busy = running || printing;
  const jobRunning = (job: GlobalSyncJob) => syncWork.get(syncWorkId(job.id))?.status === 'running';
  useEffect(() => setOpen(false), [pathname]);

  const run = useCallback(
    (targets: readonly GlobalSyncJob[], label: string) => runGlobalSync(queryClient, targets, label),
    [queryClient],
  );

  const runScope = useCallback(
    async (scope: Scope) => {
      // A hotkey can fire before the panel ever loaded the list.
      const list: GlobalSyncJob[] =
        jobsQuery.data ?? (await fetchGlobalSyncJobs(queryClient));
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
  return (
    <div ref={anchorRef} className="flex h-full shrink-0 items-center px-1">
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
        aria-label="Sync"
        aria-expanded={open}
        aria-keyshortcuts={LEADER}
        data-state={open ? 'open' : 'closed'}
        data-testid="global-sync-button"
        data-syncing={running || undefined}
        data-printing={printing || undefined}
        // Add/Inbox's outline, fill and hover — as a fixed 32px square (no text).
        className={cn(HEADER_PILL_CLASS, 'w-8 justify-center p-0')}
      >
        <RefreshCw className={cn(TOP_CHROME_ICON_FACE, busy && 'animate-spin motion-reduce:animate-none')} aria-hidden />
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
              disabled={jobs.length === 0 || jobs.every(jobRunning)}
              onClick={() => void runScope('all')}
              data-testid="global-sync-all"
            >
              Sync all
            </Button>
          }
          footer={
            // Every run — scheduled or pressed here — order by order: the
            // import record (owner 2026-09-28: its own page).
            canSeeHistory ? (
            <Link
              href="/operations/imports"
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
          {printJobs.length > 0 ? (
            // Print jobs whose cards were dismissed still live here — the system's work, one place.
            <section className="border-b border-border-hairline py-1" data-testid="global-sync-group-print">
              <p className={cn(HEADER_MENU_CAPTION_CLASS, 'px-4 py-1')}>Printing</p>
              <ul>
                {printJobs.map((item) => (
                  <li key={item.id} className="px-4 py-2">
                    <PrintJobRow item={item} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
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
                    disabled={group.every(jobRunning)}
                    onClick={() => void runScope(direction)}
                    data-testid={`global-sync-${direction}`}
                  >
                    Sync {title.toLowerCase()}
                  </Button>
                </div>
                <ul>
                  {group.map((job) => (
                    <SyncRow key={job.id} job={job} state={syncWork.get(syncWorkId(job.id))} onRun={() => void run([job], job.label)} />
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

/** One job: this tab's work item while it runs and for a minute after, else the ledger's last run. */
function SyncRow({ job, state, onRun }: { job: GlobalSyncJob; state?: WorkItem; onRun: () => void }) {
  return (
    <li className="flex items-center gap-2 px-4 py-1.5 text-role-body" data-testid={`global-sync-row-${job.id}`} data-state={state?.status ?? 'idle'}>
      <span className="flex size-4 shrink-0 items-center justify-center">
        {state?.status === 'running' ? <Loader2 className="size-3.5 animate-spin text-text-muted motion-reduce:animate-none" aria-hidden /> : null}
        {state?.status === 'done' ? <Check className="size-3.5 text-text-success" aria-hidden /> : null}
        {state?.status === 'failed' ? <AlertCircle className="size-3.5 text-text-danger" aria-hidden /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-text-default">{job.label}</span>
        {state && state.status !== 'running' ? (
          <span className={cn('block truncate text-role-micro', state.status === 'failed' ? 'text-text-danger' : 'text-text-muted')} title={state.message}>
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
        disabled={state?.status === 'running' || !job.canRun}
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
