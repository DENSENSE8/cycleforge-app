/**
 * Dashboard · Receiving — the two table tabs and their ordering axis.
 *
 * The Receiving mode (`/dashboard?mode=inbound`) shows the receiving-lines
 * activity trail (history view) under two tabs:
 *   • Triage — rows in the order they were **scanned** (`scanned_newest`).
 *   • Unbox  — rows in the order they were **unboxed** (`unboxed_newest`, the
 *     history default).
 *
 * The tab id maps 1:1 onto the History `?sort=` value (SoT `HISTORY_SORT_OPTIONS`
 * in `receiving-modes.ts`), so the tab strip, the table's day-band axis, and the
 * server ORDER BY can never disagree — the tab literally *is* the sort. Reading
 * the tab from `?sort=` keeps it coherent with the table on every deep-link.
 *
 * Pure data + functions (no React) so the header, the KPI strip, and any warm-up
 * read one contract.
 */

import { HISTORY_DEFAULT_SORT } from '@/lib/receiving/receiving-modes';

export type DashboardReceivingTab = 'triage' | 'unbox';

/** The `?sort=` value each tab pins on the history feed. */
const DASHBOARD_RECEIVING_TAB_SORT: Record<DashboardReceivingTab, string> = {
  triage: 'scanned_newest',
  unbox: 'unboxed_newest',
};

/** Tab order (left → right): Triage first (the pre-unbox scan/identify step). */
export const DASHBOARD_RECEIVING_TABS: ReadonlyArray<{ id: DashboardReceivingTab; label: string }> = [
  { id: 'triage', label: 'Triage' },
  { id: 'unbox', label: 'Unbox' },
];

/**
 * Which tab a `?sort=` value selects. Only `scanned_newest` is Triage; anything
 * else (incl. the history default `unboxed_newest` and absent) is Unbox — the
 * table's own default sort, so a bare `?mode=inbound` deep-link and the tab agree.
 */
export function dashboardReceivingTabFromSort(rawSort: string | null | undefined): DashboardReceivingTab {
  return String(rawSort || '').trim() === DASHBOARD_RECEIVING_TAB_SORT.triage ? 'triage' : 'unbox';
}

/**
 * The `?sort=` delta for a tab. The Unbox tab clears `?sort=` (it's the history
 * default, kept out of the URL for a clean link); Triage sets `scanned_newest`.
 */
export function dashboardReceivingSortDelta(tab: DashboardReceivingTab): string | null {
  const sort = DASHBOARD_RECEIVING_TAB_SORT[tab];
  return sort === HISTORY_DEFAULT_SORT ? null : sort;
}
