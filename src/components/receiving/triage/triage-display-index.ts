/**
 * Arrival Displays Root Index — Pairing + Locations + Timeline (no React).
 */

import type { DisplayIndexRow } from '@/components/station/displays';
import type { TriageDisplayTab } from './build-triage-displays';

const LABELS: Record<TriageDisplayTab, string> = {
  linkage: 'Pairing',
  location: 'Locations',
  timeline: 'Timeline',
};

function enrich(
  id: TriageDisplayTab,
  signals: {
    linkagePaired: boolean;
    isUnfound: boolean;
  },
): Omit<DisplayIndexRow, 'id' | 'label'> {
  switch (id) {
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
    case 'timeline':
      // A read, never a step: what already happened to this carton and who did
      // it. Same `neutral` reasoning as Locations — history does not nag.
      return { subtitle: 'Scans · stamps · audit', tone: 'neutral', group: 'context' };
  }
}

/**
 * Build Root Index rows for the Arrival Displays strip order
 * ({@link buildTriageDisplayTabs}).
 */
export function buildTriageDisplayIndexRows(
  tabIds: TriageDisplayTab[],
  signals: {
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
