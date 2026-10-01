/**
 * Testing Displays Root Index — enriched rows (no React).
 */

import type { DisplayIndexRow } from '@/components/station/displays';
import type { TestingDisplayTab } from './build-testing-displays';

interface TestingDisplayIndexSignals {
  hasSkuPairing: boolean;
  hasSkuTabs: boolean;
  hasTimeline: boolean;
  linkagePaired: boolean;
  isUnfound: boolean;
  listingLabel: string | null;
}

const LABELS: Record<Exclude<TestingDisplayTab, never>, string> = {
  units: 'Units',
  listing: 'Listing',
  pairing: 'SKU pairing',
  checklist: 'Checklist',
  manuals: 'Manuals',
  timeline: 'Timeline',
  linkage: 'Linkage',
};

function meta(
  id: TestingDisplayTab,
  signals: TestingDisplayIndexSignals,
): Pick<DisplayIndexRow, 'subtitle' | 'tone' | 'group'> {
  switch (id) {
    case 'units':
      // Per-unit verdict work — the Action Display. Quiet by default; the
      // amber 'action' cue belongs to exceptions (claim / unpaired), not to
      // the routine per-unit pass that the centre Pass · Print already serves.
      return {
        subtitle: 'Serial · condition · verdict',
        tone: 'neutral',
        group: 'verification',
      };
    case 'listing': {
      const label = (signals.listingLabel ?? '').trim();
      return {
        subtitle: label || 'Seller claimed',
        tone: label ? 'ok' : 'neutral',
        group: 'verification',
      };
    }
    case 'pairing':
      return {
        subtitle: 'Catalog SKU',
        tone: 'neutral',
        group: 'verification',
      };
    case 'checklist':
      return {
        subtitle: 'SKU checklist',
        tone: 'neutral',
        group: 'assets',
      };
    case 'manuals':
      return {
        subtitle: 'SKU manuals',
        tone: 'neutral',
        group: 'assets',
      };
    case 'timeline':
      return {
        subtitle: 'Unit · tracking',
        tone: 'neutral',
        group: 'context',
      };
    case 'linkage':
      if (signals.linkagePaired) {
        return { subtitle: 'Paired', tone: 'ok', group: 'verification' };
      }
      if (signals.isUnfound) {
        return { subtitle: 'Unpaired', tone: 'action', group: 'verification' };
      }
      return {
        subtitle: 'Carton · PO · store',
        tone: 'neutral',
        group: 'verification',
      };
  }
}

/**
 * Build visible Testing Root Index rows from the same visibility gates as
 * {@link buildTestingDisplayTabs}.
 */
export function buildTestingDisplayIndexRows(
  visibleIds: readonly TestingDisplayTab[],
  signals: TestingDisplayIndexSignals,
): DisplayIndexRow[] {
  return visibleIds.map((id) => {
    const m = meta(id, signals);
    return {
      id,
      label: LABELS[id],
      subtitle: m.subtitle,
      tone: m.tone,
      group: m.group,
    };
  });
}
