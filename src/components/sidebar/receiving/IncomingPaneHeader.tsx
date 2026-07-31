/**
 * Incoming sort vocabulary.
 *
 * Display sort lives in {@link IncomingWorkspaceHeader} as a quiet
 * `QueueSortSwitch` (trailing cluster). This module owns the sort-axis union +
 * labels / short labels that switch consumes, plus the page-size re-export
 * kept for existing importers.
 */

import { INCOMING_PAGE_SIZE } from '@/lib/receiving/receiving-modes';

/** Sort axis — header `QueueSortSwitch` + URL `?sort=` contract. */
export type IncomingSort =
  | 'zoho_newest'
  | 'zoho_oldest'
  | 'expected_soonest'
  | 'recently_added';

const INCOMING_SORT_LABELS: Record<IncomingSort, string> = {
  zoho_newest:      'Newest PO',
  zoho_oldest:      'Oldest PO',
  expected_soonest: 'Expected soonest',
  recently_added:   'Recently synced',
};

/** Options for {@link QueueSortSwitch} — `shortLabel` rides the trigger. */
export const INCOMING_SORT_OPTIONS: readonly {
  id: IncomingSort;
  label: string;
  shortLabel: string;
}[] = [
  { id: 'zoho_newest', label: INCOMING_SORT_LABELS.zoho_newest, shortLabel: 'Newest' },
  { id: 'zoho_oldest', label: INCOMING_SORT_LABELS.zoho_oldest, shortLabel: 'Oldest' },
  { id: 'expected_soonest', label: INCOMING_SORT_LABELS.expected_soonest, shortLabel: 'Expected' },
  { id: 'recently_added', label: INCOMING_SORT_LABELS.recently_added, shortLabel: 'Synced' },
];

/**
 * Server-side page size for Incoming. Single source of truth lives in the mode
 * registry; re-exported here for existing importers.
 */
export { INCOMING_PAGE_SIZE };
