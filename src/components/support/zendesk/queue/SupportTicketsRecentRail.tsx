'use client';

/**
 * Support · Tickets sidebar map — recently selected dock only.
 *
 * Full queue + status tabs live in the right-pane workbench (`SupportTicketsBoard`).
 * Mirrors Unbox's short Unboxed recent dock / Dashboard Search recents.
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { History, TicketHelp } from '@/components/Icons';
import { Button, EmptyState } from '@/design-system/primitives';
import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import { SidebarRailScrollport } from '@/components/sidebar/rail-shell/SidebarRailScrollport';
import { useRecentTickets } from '@/hooks/useRecentTickets';
import { cn } from '@/utils/_cn';
import { SupportTicketRow } from './SupportTicketRow';

export function SupportTicketsRecentRail() {
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
            {recents.map((r) => (
              <SupportTicketRow
                key={r.id}
                id={r.id}
                subject={r.subject}
                status={r.status}
                priority={r.priority}
                // The dock's axis is when THIS operator opened the ticket, not when the
                // ticket last changed — `RecentTicket.at` is a ms epoch stamped at open.
                at={new Date(r.at).toISOString()}
                selected={r.id === selectedId}
                onSelect={() => openTicket(r.id)}
              />
            ))}
          </div>
        )}
      </SidebarRailScrollport>
    </div>
  );
}
