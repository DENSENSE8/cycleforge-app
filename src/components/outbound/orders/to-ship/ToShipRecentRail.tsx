'use client';

/**
 * To-Ship desk left rail — recently opened orders (detail-stack history).
 *
 * Scaffold for the WMS 3-column shell: Recents beside Process · Details.
 * Scoped to the desk body — not the global ContextPanelLayout rail (Pattern E
 * at the frame level still holds; this is an in-desk column).
 */

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Clock } from '@/components/Icons';
import { SidebarShell } from '@/components/layout/SidebarShell';
import { useRecentDetailStacks } from '@/hooks/useRecentDetailStacks';
import {
  DETAIL_STACK_DEFS,
  detailStackHref,
} from '@/lib/detail-stacks/registry';
import { formatRelativeTime } from '@/lib/search/search-recents';
import { cn } from '@/utils/_cn';
import type { DetailStackEntry } from '@/lib/detail-stacks/history-store';

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

function ToShipRecentEmpty() {
  return (
    <div className="inset-empty rounded-none border border-dashed border-border-soft bg-surface-canvas text-center">
      <Clock className="mx-auto mb-2 h-5 w-5 text-text-faint" />
      <p className="text-role-caption font-semibold text-text-muted">No recent orders</p>
      <p className="mt-1 text-role-micro font-medium text-text-faint">
        Orders you open on this desk appear here.
      </p>
    </div>
  );
}

function ToShipRecentList({ entries }: { entries: DetailStackEntry[] }) {
  const searchParams = useSearchParams();
  const openOrderId = (searchParams.get('openOrderId') ?? '').trim() || null;

  if (entries.length === 0) return <ToShipRecentEmpty />;

  return (
    <ul className="divide-y divide-border-hairline" aria-label="Recent orders">
      {entries.map((entry) => {
        const selected = isSelectedEntry(entry, openOrderId);
        const when = relativeOpenedLabel(entry.at);
        const noun = DETAIL_STACK_DEFS[entry.kind]?.noun ?? 'Order';
        return (
          <li key={`${entry.kind}:${entry.id}`}>
            <Link
              href={detailStackHref(entry)}
              className={cn(
                'block px-2 py-1.5 text-left transition-colors',
                selected ? 'bg-blue-50 ring-1 ring-inset ring-blue-400' : 'hover:bg-surface-hover',
              )}
              aria-current={selected ? 'true' : undefined}
            >
              <p className="truncate text-role-eyebrow font-semibold text-text-default">
                {entry.label}
              </p>
              <p className="truncate text-role-micro font-semibold uppercase tracking-widest text-text-faint">
                {when ? `${noun} · opened ${when}` : `${noun} · ${entry.id}`}
              </p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function ToShipRecentRail() {
  const allEntries = useRecentDetailStacks();
  const orderEntries = allEntries.filter((entry) => entry.kind === 'order');

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
      <ToShipRecentList entries={orderEntries} />
    </SidebarShell>
  );
}
