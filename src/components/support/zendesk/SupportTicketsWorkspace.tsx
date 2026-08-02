'use client';

/**
 * Support · Tickets — the `service-workspace` branch mount.
 *
 *   list    = SupportTicketsBoard (the queue map, ALWAYS mounted)
 *   thread  = SupportTicketFocus  (`?ticket=`, crossfades on ticket id)
 *   context = ticket linkage / customer context, pushed at the right edge
 *
 * Law: `.claude/rules/display/workbench-service.md`.
 *
 * Until 2026-08-01 this component returned the board **or** the focus pane, so
 * opening a ticket unmounted the queue — losing its scroll position, page, and
 * in-flight search every time an operator opened a row. The sidebar did not
 * cover for it either: for Tickets it mounts the *recently selected* dock, not
 * the queue. `ServiceWorkspaceShell` keeps the map mounted; the crossfade and
 * the `AnimatePresence` now belong to the shell.
 */

import { useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SupportTicketFocus } from '@/components/support/service-workspace/SupportTicketFocus';
import { ServiceWorkspaceShell } from '@/components/support/service-workspace';
import { buildSupportContextColumn } from '@/components/support/service-workspace/support-ticket-tabs';
import { SupportTicketsBoard } from './SupportTicketsBoard';

export function SupportTicketsWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ticketId = Number(searchParams.get('ticket')) || null;

  const clearTicket = () => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete('ticket');
    // Tickets is the default mode — drop stale mode= if present.
    sp.delete('mode');
    const qs = sp.toString();
    router.replace(qs ? `/support?${qs}` : '/support', { scroll: false });
  };

  const anchor = useMemo(
    () => (ticketId ? { ticket: String(ticketId) } : null),
    [ticketId],
  );

  return (
    <ServiceWorkspaceShell
      list={<SupportTicketsBoard />}
      listHidden={ticketId != null}
      threadKey={ticketId}
      thread={
        ticketId != null ? (
          <SupportTicketFocus ticketId={ticketId} onClose={clearTicket} />
        ) : null
      }
      context={anchor ? buildSupportContextColumn({ anchor }) : null}
    />
  );
}
