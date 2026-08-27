/**
 * Support orders Displays Root Index — enriched rows (no React).
 */

import type { DisplayIndexRow } from '@/components/station/displays';

export function buildSupportOrdersDisplayIndexRows(signals: {
  hasTicketHint: boolean;
}): DisplayIndexRow[] {
  return [
    {
      id: 'ticket',
      label: 'Ticket',
      subtitle: signals.hasTicketHint ? 'Customer thread' : 'No ticket linked',
      tone: signals.hasTicketHint ? 'ok' : 'neutral',
      group: 'context',
    },
    {
      id: 'support',
      label: 'Support',
      subtitle: 'Team · Activity',
      tone: 'neutral',
      group: 'context',
    },
  ];
}
