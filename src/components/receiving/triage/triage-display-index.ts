/**
 * Arrival Displays Root Index — Ticket + Pairing + Locations (no React).
 */

import type { DisplayIndexRow } from '@/components/station/displays';
import type { TriageDisplayTab } from './build-triage-displays';

const LABELS: Record<TriageDisplayTab, string> = {
  ticket: 'Ticket',
  linkage: 'Pairing',
  location: 'Locations',
};

function enrich(
  id: TriageDisplayTab,
  signals: {
    hasTicketId: boolean;
    linkagePaired: boolean;
    isUnfound: boolean;
  },
): Omit<DisplayIndexRow, 'id' | 'label'> {
  switch (id) {
    case 'ticket':
      return {
        subtitle: signals.hasTicketId ? 'Linked ticket' : 'No ticket',
        tone: signals.hasTicketId ? 'ok' : 'action',
        group: 'context',
      };
    case 'linkage':
      if (signals.linkagePaired) {
        return { subtitle: 'Paired', tone: 'ok', group: 'verification' };
      }
      if (signals.isUnfound) {
        return { subtitle: 'Unpaired', tone: 'action', group: 'verification' };
      }
      return { subtitle: 'Store · PO', tone: 'neutral', group: 'verification' };
    case 'location':
      // A tool, not an outstanding step — it never nags with an `action` tone.
      return { subtitle: 'Place · print · new', tone: 'neutral', group: 'assets' };
  }
}

/**
 * Build Root Index rows for the Arrival Displays strip order
 * ({@link buildTriageDisplayTabs}).
 */
export function buildTriageDisplayIndexRows(
  tabIds: TriageDisplayTab[],
  signals: {
    hasTicketId: boolean;
    linkagePaired: boolean;
    isUnfound: boolean;
  },
): DisplayIndexRow[] {
  return tabIds.map((id) => ({
    id,
    label: LABELS[id],
    ...enrich(id, signals),
  }));
}
