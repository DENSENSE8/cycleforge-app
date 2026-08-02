'use client';

/**
 * Support · Tickets — the `service-workspace` branch mount.
 *
 *   list     = SupportTicketsBoard (the queue map, ALWAYS mounted)
 *   thread   = SupportTicketFocus  (`?ticket=`, crossfades on ticket id)
 *   displays = SupportContextDetailPanel, a `RightRailHost` occupant that PUSHES
 *
 * Law: `.claude/rules/display/workbench-service.md`.
 *
 * The context pane is mounted here rather than passed into the shell: it is a
 * rail occupant, so it registers itself and renders nothing in place. The shell
 * carried a private `<aside>` for it until 2026-08-01 — a second permanent owner
 * of the right edge, duplicating a panel that was already correct.
 *
 * Until 2026-08-01 this component returned the board **or** the focus pane, so
 * opening a ticket unmounted the queue — losing its scroll position, page, and
 * in-flight search every time an operator opened a row. The sidebar did not
 * cover for it either: for Tickets it mounts the *recently selected* dock, not
 * the queue. `ServiceWorkspaceShell` keeps the map mounted; the crossfade and
 * the `AnimatePresence` now belong to the shell.
 */

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SupportTicketFocus } from '@/components/support/service-workspace/SupportTicketFocus';
import {
  ServiceWorkspaceShell,
  useSupportTicketDisplays,
} from '@/components/support/service-workspace';
import { SupportContextDetailPanel } from '@/components/support/context';
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

  // Connections · Conversations · Timeline. Built here, unconditionally, because
  // the rail is mounted here — the hook is inert (and its query disabled) while
  // no ticket is open.
  const displays = useSupportTicketDisplays(anchor);

  // Open by default (the old private aside was unconditional), but dismissible —
  // a non-modal push column has no scrim, so its close button must lead
  // somewhere, and it survives a ticket→ticket step because it is a workspace
  // preference, not a property of the record.
  const [contextOpen, setContextOpen] = useState(true);

  return (
    <>
      <ServiceWorkspaceShell
        list={<SupportTicketsBoard />}
        listHidden={ticketId != null}
        threadKey={ticketId}
        thread={
          ticketId != null ? (
            <SupportTicketFocus
              ticketId={ticketId}
              onClose={clearTicket}
              contextOpen={contextOpen}
              onToggleContext={() => setContextOpen((o) => !o)}
            />
          ) : null
        }
      />
      {ticketId != null && anchor ? (
        <SupportContextDetailPanel
          ticketId={ticketId}
          anchor={anchor}
          open={contextOpen}
          // Closing the extras must not close the ticket: the thread is the work,
          // the rail is the context beside it. Re-opens from the thread header's
          // Connections toggle.
          onClose={() => setContextOpen(false)}
          push
          displays={displays}
        />
      ) : null}
    </>
  );
}
