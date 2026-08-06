'use client';

/**
 * Dashboard · Recents — the inbound domain's context-panel recents list.
 *
 * Harvested from the `Recent` half of the retired `DashboardSearchSidebar` when
 * Search stopped being a dashboard mode (`docs/todo/dashboard-ia-rework-PLAN.md`
 * Phase 1.1). Inbound's context panel used to render `null` — 360px of empty
 * chrome; this list fills it. Retrieval lives on `/search`; re-open navigation
 * lives here beside the inbound picker.
 *
 * Rows re-open through `detailStackHref`, the same SoT the ⌘K palette and the
 * order workspace rail use — so an order always lands on `/o/[id]`, never on a
 * second order shell.
 *
 * Also publishes top-N mid-strip MRU pins while the context rail is parked
 * (not a `SidebarRecentRailBase` — thin `usePublishCollapsePins` here).
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Clock, X } from '@/components/Icons';
import { SidebarShell } from '@/components/layout/SidebarShell';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { CONTEXT_PANEL_COLLAPSE } from '@/components/sidebar/context-panel-column';
import {
  usePublishCollapsePins,
  type CollapseStripPeekCtx,
} from '@/components/sidebar/context-panel-collapse-context';
import { RailPeekCard } from '@/components/sidebar/rail-shell/RailPeekCard';
import { useRecentDetailStacks } from '@/hooks/useRecentDetailStacks';
import {
  removeDetailStack,
  type DetailStackEntry,
} from '@/lib/detail-stacks/history-store';
import {
  DETAIL_STACK_DEFS,
  detailStackHref,
  type DetailStackKind,
} from '@/lib/detail-stacks/registry';
import { formatRelativeTime } from '@/lib/search/search-recents';
import { cn } from '@/utils/_cn';

/** Kind → collapse-strip status dot (not a second lifecycle model). */
const DASHBOARD_RECENT_PIN_DOT: Record<DetailStackKind, string> = {
  order: 'bg-blue-500',
  receiving: 'bg-indigo-500',
  shipment: 'bg-emerald-500',
  claim: 'bg-amber-500',
  photo: 'bg-violet-500',
  plan: 'bg-sky-500',
  po: 'bg-teal-500',
};

function relativeOpenedLabel(at: number): string {
  try {
    return formatRelativeTime(new Date(at).toISOString(), Date.now());
  } catch {
    return '';
  }
}

function isSelectedEntry(entry: DetailStackEntry, openOrderId: string | null): boolean {
  if (!openOrderId || entry.kind !== 'order') return false;
  return entry.id === openOrderId || entry.label.includes(openOrderId);
}

function RecentsEmpty() {
  return (
    <div className="rounded-xl border border-dashed border-border-soft bg-surface-canvas inset-empty text-center">
      <Clock className="mx-auto mb-2 h-5 w-5 text-text-faint" />
      <p className="text-role-caption font-semibold text-text-muted">Nothing opened yet</p>
      <p className="mt-1 text-role-micro font-medium text-text-faint">
        Orders and cartons you open will appear here.
      </p>
    </div>
  );
}

/**
 * The bare list. Rows follow house one-row anatomy (title → meta → trailing) and
 * the selection rule (background + ring only, never a size shift).
 */
function DashboardRecentsList({ entries }: { entries: DetailStackEntry[] }) {
  const searchParams = useSearchParams();
  const openOrderId = (searchParams.get('openOrderId') ?? '').trim() || null;

  if (entries.length === 0) return <RecentsEmpty />;

  return (
    <ul className="divide-y divide-border-hairline" aria-label="Recently opened">
      {entries.map((entry) => {
        const selected = isSelectedEntry(entry, openOrderId);
        const when = relativeOpenedLabel(entry.at);
        const noun = DETAIL_STACK_DEFS[entry.kind]?.noun ?? 'Record';
        return (
          <li key={`${entry.kind}:${entry.id}`}>
            <div
              className={cn(
                'group flex items-center gap-1 rounded-md transition-colors',
                selected ? 'bg-blue-50 ring-1 ring-inset ring-blue-400' : 'hover:bg-surface-hover',
              )}
            >
              <Link
                href={detailStackHref(entry)}
                className="min-w-0 flex-1 px-2 py-1.5 text-left"
                aria-current={selected ? 'true' : undefined}
              >
                <p className="truncate text-role-eyebrow font-semibold text-text-default">
                  {entry.label}
                </p>
                <p className="truncate text-role-micro font-semibold uppercase tracking-widest text-text-faint">
                  {when ? `${noun} · opened ${when}` : `${noun} · ${entry.id}`}
                </p>
              </Link>
              <HoverTooltip label="Remove" focusable={false}>
                {/* ds-raw-button: quiet remove affordance inside a list row */}
                <button
                  type="button"
                  onClick={() => removeDetailStack(entry.kind, entry.id)}
                  aria-label={`Remove ${entry.label}`}
                  className={cn(
                    'mr-1 shrink-0 rounded p-1 text-text-faint hover:text-text-default',
                    selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                  )}
                >
                  <X className="h-3 w-3" />
                </button>
              </HoverTooltip>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Full-panel form — the inbound domain's context panel, which previously
 * rendered `null`. Composes `SidebarShell` (never hand-positions the band).
 */
export function DashboardRecentsPanel() {
  const entries = useRecentDetailStacks();
  const router = useRouter();
  const searchParams = useSearchParams();
  const openOrderId = (searchParams.get('openOrderId') ?? '').trim() || null;

  const collapseMru = useMemo(() => {
    const top = entries.slice(0, CONTEXT_PANEL_COLLAPSE.mruPinCount);
    if (top.length === 0) return null;
    return {
      totalCount: entries.length,
      pins: top.map((entry) => {
        const noun = DETAIL_STACK_DEFS[entry.kind]?.noun ?? 'Record';
        const when = relativeOpenedLabel(entry.at);
        return {
          id: `${entry.kind}:${entry.id}`,
          label: entry.label,
          statusDotClass: DASHBOARD_RECENT_PIN_DOT[entry.kind] ?? 'bg-slate-400',
          statusLabel: noun,
          meta: entry.id,
          age: when || undefined,
          selected: isSelectedEntry(entry, openOrderId),
          onSelect: () => {
            router.push(detailStackHref(entry));
          },
          // Same peek card the rail-shell feeds publish — copyable id, Open →.
          renderPeek: ({ openWorkspace }: CollapseStripPeekCtx) => (
            <RailPeekCard
              title={entry.label}
              statusLabel={noun}
              statusDotClass={DASHBOARD_RECENT_PIN_DOT[entry.kind] ?? 'bg-slate-400'}
              facts={[{ tone: entry.kind === 'po' ? 'po' : 'order', value: entry.id }]}
              age={when || undefined}
              onOpen={openWorkspace}
            />
          ),
        };
      }),
    };
  }, [entries, openOrderId, router]);
  usePublishCollapsePins(collapseMru);

  return (
    <SidebarShell
      headerAbove={
        <div className="shrink-0 border-b border-border-hairline px-3 py-2">
          <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Recents</p>
        </div>
      }
      scrollMoreBelow
      bodyClassName="pt-2 pb-6"
    >
      <DashboardRecentsList entries={entries} />
    </SidebarShell>
  );
}
