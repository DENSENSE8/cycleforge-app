/** The opener for the global New ticket composer — kept apart from `NewTicketHost` so the header never bundles the composer. */

import { NEW_TICKET_OPEN_EVENT } from '@/lib/app-events';

export const NEW_TICKET_LABEL = 'New ticket';

/** Ask `NewTicketHost` to open New ticket. Safe from any client handler. */
export function openNewTicket(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(NEW_TICKET_OPEN_EVENT));
}
