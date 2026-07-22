'use client';

/**
 * Support · Tickets focus pane router — Orders/Unbox recipe.
 *
 * - No `?ticket=` → SupportTicketsBoard (full queue workbench)
 * - With `?ticket=` → SupportTicketFocus (Station Workbench)
 *
 * Sidebar owns the recently-selected dock (`SupportTicketsRecentRail`).
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import { SupportTicketFocus } from '@/components/support/station/SupportTicketFocus';
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

  if (!ticketId) {
    return <SupportTicketsBoard />;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <SupportTicketFocus
        key={`ticket-${ticketId}`}
        ticketId={ticketId}
        onClose={clearTicket}
      />
    </AnimatePresence>
  );
}
