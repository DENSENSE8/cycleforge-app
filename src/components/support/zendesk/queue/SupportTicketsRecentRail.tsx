'use client';

/**
 * Support · Tickets sidebar map — recently selected dock only.
 *
 * Full queue + status tabs live in the right-pane workbench (`SupportTicketsBoard`).
 * Mirrors Unbox's short Unboxed recent dock / Dashboard Search recents.
 */

import type { ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { History, TicketHelp } from '@/components/Icons';
import { Button, EmptyState } from '@/design-system/primitives';
import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import { SidebarRailScrollport } from '@/components/sidebar/rail-shell/SidebarRailScrollport';
import { useRecentTickets } from '@/hooks/useRecentTickets';
import { cn } from '@/utils/_cn';
import { timeAgo } from '@/utils/_date';
import { priorityBadge, statusBadge, statusDot } from '../badges';

export function SupportTicketsRecentRail({ modeToggle = null }: { modeToggle?: ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = Number(searchParams.get('ticket')) || null;
  const { recents, clear } = useRecentTickets();

  const openTicket = (id: number) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete('mode');
    sp.set('ticket', String(id));
    const qs = sp.toString();
    router.push(qs ? `/support?${qs}` : `/support?ticket=${id}`);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-card">
      {modeToggle}

      <div className={cn(SIDEBAR_GUTTER, 'flex shrink-0 items-center justify-between gap-2 py-2')}>
        <p className="flex items-center gap-1 text-role-micro uppercase tracking-widest text-text-faint">
          <History className="h-3 w-3" />
          Recent · {recents.length}
        </p>
        {recents.length > 0 ? (
          <Button variant="ghost" size="sm" onClick={clear} className="h-6 px-1.5 text-role-micro">
            Clear
          </Button>
        ) : null}
      </div>

      <SidebarRailScrollport>
        {recents.length === 0 ? (
          <div className="px-3 py-6">
            <EmptyState
              icon={<TicketHelp className="h-5 w-5 text-text-faint" />}
              title="No recent tickets"
              description="Open a ticket from the queue — it will show up here."
            />
          </div>
        ) : (
          <div className="divide-y divide-border-hairline">
            {recents.map((r) => {
              const sb = statusBadge(r.status);
              const pb = priorityBadge(r.priority);
              const dot = statusDot(r.status);
              const selected = r.id === selectedId;
              return (
                // ds-raw-button: text-left recent-dock row (status dot + subject + #id), not a standard action Button
                <button
                  key={r.id}
                  type="button"
                  onClick={() => openTicket(r.id)}
                  className={cn(
                    'ds-raw-button block w-full px-3 py-2 text-left transition',
                    selected
                      ? 'bg-blue-50 ring-1 ring-inset ring-blue-400'
                      : 'hover:bg-surface-hover',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', dot)} />
                    <span className="min-w-0 flex-1 truncate text-role-data font-semibold text-text-default">
                      {r.subject || `(no subject)`}
                    </span>
                    {pb ? (
                      <span
                        className={cn(
                          'shrink-0 rounded px-1 py-0.5 text-[8.5px] font-semibold uppercase tracking-widest',
                          pb.className,
                        )}
                      >
                        {pb.label}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 pl-4 text-role-caption text-text-faint">
                    <span className="font-semibold uppercase tracking-wide">{sb.label}</span>
                    <span>·</span>
                    <span>#{r.id}</span>
                    <span className="ml-auto">{timeAgo(new Date(r.at).toISOString())}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </SidebarRailScrollport>
    </div>
  );
}
