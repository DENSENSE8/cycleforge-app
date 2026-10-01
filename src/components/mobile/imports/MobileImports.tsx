'use client';

/**
 * `/m/imports` — the import record on the phone, read-only (handoff
 * 2026-09-28): the desk's two lists — Runs and Orders — as flat hairline rows
 * over the same APIs and URL params. A tap opens the run's record as its own
 * full screen (`/m/imports/[runId]`, SURFACE_LAW §7: a screen with an X, not
 * a sheet).
 */

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, RefreshCw } from '@/components/Icons';
import { DetailNav, type DetailNavItem } from '@/components/mobile/detail/DetailParts';
import {
  MOBILE_IMPORTS_PATH,
  importRowLocator,
  importSourceLabel,
  importStamp,
  importTriggerLabel,
} from '@/lib/imports/record-faces';
import { IMPORT_ROW_OUTCOME_LIFECYCLE, IMPORT_RUN_LIFECYCLE } from '@/design-system/tokens/import-record-lifecycle';
import { importListQuery, useImportRows, useImportRuns } from '@/lib/imports/record-client';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { Button, Inset } from '@/design-system/primitives';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { recordStateCodeClass } from '@/design-system/tokens/record';
import type { ImportRunListItem, ImportRunRowItem } from '@/lib/imports/types';
import { withJobReturn } from '@/lib/mobile/nav-trail';
import { cn } from '@/utils/_cn';

const TABS = [
  { id: 'runs', label: 'Runs' },
  { id: 'rows', label: 'Orders' },
];

function runDoor(run: ImportRunListItem, back: string): DetailNavItem {
  const state = IMPORT_RUN_LIFECYCLE[run.status];
  const { totals } = run;
  return {
    id: String(run.id),
    title: `${importTriggerLabel(run)} · ${importStamp(run.startedAt)}`,
    icon: <span aria-label={state.label} className={cn('h-2.5 w-2.5 rounded-full', STATE_TONE_CLASSES[state.tone].dot)} />,
    meta: `Run ${run.id} · ${totals.inserted} new · ${totals.backfilled} backfilled · ${totals.trackingFilled} tracking · ${totals.needsReview} to review`,
    href: withJobReturn(`${MOBILE_IMPORTS_PATH}/${run.id}`, back),
  };
}

function rowDoor(row: ImportRunRowItem, back: string): DetailNavItem {
  const state = IMPORT_ROW_OUTCOME_LIFECYCLE[row.outcome];
  const locator = importRowLocator(row);
  return {
    id: String(row.id),
    title: row.externalOrderId,
    icon: (
      <span className={cn('font-mono text-role-micro font-bold', recordStateCodeClass(state))} aria-label={state.label}>
        {state.code}
      </span>
    ),
    meta: [state.label, importSourceLabel(row.source), locator, `Run ${row.runId}`].filter(Boolean).join(' · '),
    href: withJobReturn(`${MOBILE_IMPORTS_PATH}/${row.runId}`, back),
  };
}

export function MobileImports() {
  const router = useRouter();
  const pathname = usePathname() || MOBILE_IMPORTS_PATH;
  const searchParams = useSearchParams();
  const view = searchParams.get('view') === 'rows' ? 'rows' : 'runs';
  const qs = searchParams.toString();
  const back = qs ? `${pathname}?${qs}` : pathname;

  const runs = useImportRuns(importListQuery(searchParams, 'runs'), view === 'runs');
  const rows = useImportRows(importListQuery(searchParams, 'rows'), view === 'rows');
  const list = view === 'runs' ? runs : rows;
  const doors =
    view === 'runs' ? runs.items.map((run) => runDoor(run, back)) : rows.items.map((row) => rowDoor(row, back));

  const setView = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'rows') params.set('view', 'rows');
      else params.delete('view');
      const nextQs = params.toString();
      router.replace(nextQs ? `${pathname}?${nextQs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const noun = view === 'runs' ? 'run' : 'order';
  return (
    <div className="flex h-full min-h-0 flex-col bg-mode-panel" data-testid="mobile-imports">
      <div className="border-b border-mode-rule">
        <Inset space="chip">
          <TabSwitch tabs={TABS} activeTab={view} onTabChange={setView} size="sm" />
        </Inset>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <p className="border-b border-mode-rule px-mode-page py-2 text-role-caption text-mode-muted">
          {list.isPending
            ? `Loading ${noun}s…`
            : `${list.total.toLocaleString()} ${noun}${list.total === 1 ? '' : 's'}${searchParams.get('run') && view === 'rows' ? ` in run ${searchParams.get('run')}` : ''}`}
        </p>
        {list.isError ? (
          <div className="flex flex-col items-start gap-3 border-b border-mode-rule px-mode-page py-5">
            <p className="flex items-center gap-2 text-role-caption font-semibold text-text-danger">
              <AlertTriangle className="h-4 w-4" /> {list.error.message}
            </p>
            <Button variant="secondary" radius="flush" size="sm" icon={<RefreshCw />} onClick={() => void list.refetch()}>
              Retry
            </Button>
          </div>
        ) : !list.isPending && doors.length === 0 ? (
          <p className="border-b border-mode-rule px-mode-page py-8 text-center text-role-data font-semibold text-mode-ink">
            {view === 'runs' ? 'No import runs in this window.' : 'No imported orders in this window.'}
          </p>
        ) : (
          <DetailNav label={view === 'runs' ? 'Import runs' : 'Imported orders'} rows={doors} />
        )}
        {list.hasNextPage ? (
          <div className="px-mode-page py-3">
            <Button
              variant="secondary"
              size="lg"
              radius="flush"
              className="w-full"
              onClick={() => void list.fetchNextPage()}
              disabled={list.isFetchingNextPage}
            >
              {list.isFetchingNextPage ? 'Loading…' : `Load more (${list.items.length} of ${list.total})`}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
