/**
 * Incoming sort vocabulary.
 *
 * The right-pane header itself moved to the golden workbench recipe
 * (`incoming/IncomingWorkspaceHeader` — All / Zoho / eBay purchasing-source
 * tabs + pagination). What remains here is the sort-axis union + labels the
 * sidebar's Sort control imports, plus the page-size re-export kept for existing
 * importers.
 */

import { INCOMING_PAGE_SIZE } from '@/lib/receiving/receiving-modes';

/** Sort axis — the sidebar (which owns the Sort control) imports this union. */
export type IncomingSort =
  | 'zoho_newest'
  | 'zoho_oldest'
  | 'expected_soonest'
  | 'recently_added';

export const INCOMING_SORT_LABELS: Record<IncomingSort, string> = {
  zoho_newest:      'Newest PO',
  zoho_oldest:      'Oldest PO',
  expected_soonest: 'Expected soonest',
  recently_added:   'Recently synced',
};

/**
 * Server-side page size for Incoming. Single source of truth lives in the mode
 * registry; re-exported here for existing importers.
 */
export { INCOMING_PAGE_SIZE };
