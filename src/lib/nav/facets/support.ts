/**
 * Support workspace facet counts (`/support`). One context per sidebar view —
 * `support.queue` (no `?view=`, every Support item) and `support.<view>` for
 * each SUPPORT_LIST_VIEWS id. Everything is answered by the list's OWN
 * predicates over the list's own rows (`listSupportRows` → `cutSupportList` /
 * `supportListFacetCounts`, `src/lib/support/list/support-list.ts`), so a
 * count is always the number of records the list shows when that value is
 * picked:
 *
 * - `total` = the view's list under the current params (status chips and
 *   facets applied) — what the view switcher paints for the view's own href;
 * - Platform · Account · Assignee option counts = that facet's own param
 *   removed, everything else applied.
 *
 * The context names the view; a stray `?view=` on the request never widens it.
 */

import type { NavFacetsResponse } from '@/lib/nav/context/schema';
import type { NavFacetContext } from '@/lib/nav/facets/contexts';
import {
  cutSupportList,
  parseSupportListFilter,
  parseSupportListView,
  supportListFacetCounts,
  type SupportListFacet,
  type SupportListRow,
} from '@/lib/support/list/support-list';

export type SupportFacetContext = Extract<NavFacetContext, `support.${string}`>;

/** The rows the list starts from: every Support item of the org matching the find text. */
export type SupportRowsReader = (q: string | null, nowMs: number) => Promise<SupportListRow[]>;

export function isSupportFacetContext(context: NavFacetContext): context is SupportFacetContext {
  return context.startsWith('support.');
}

const FACET_GROUPS: ReadonlyArray<{ facet: SupportListFacet; label: string }> = [
  { facet: 'platform', label: 'Platform' },
  { facet: 'account', label: 'Account' },
  { facet: 'assignee', label: 'Assignee' },
];

/** The words a facet value paints: the platform / account label, the staffer's name, Unassigned. */
function valueLabels(rows: readonly SupportListRow[], facet: SupportListFacet): Map<string, string> {
  const labels = new Map<string, string>();
  for (const row of rows) {
    if (facet === 'platform' && row.platform) labels.set(String(row.platform.id), row.platform.label);
    if (facet === 'account' && row.account) labels.set(row.account.label, row.account.label);
    if (facet === 'assignee') {
      if (row.assignees.length === 0) labels.set('none', 'Unassigned');
      for (const assignee of row.assignees) labels.set(String(assignee.id), assignee.name);
    }
  }
  return labels;
}

/** The list params the facet request carries (comma lists, as the sidebar writes them). */
const LIST_PARAMS = ['status', 'platform', 'account', 'assignee', 'sort', 'group'] as const;

export async function supportFacets(
  context: SupportFacetContext,
  params: Pick<URLSearchParams, 'get'>,
  readRows: SupportRowsReader,
): Promise<NavFacetsResponse> {
  const nowMs = Date.now();
  const q = String(params.get('q') ?? '').trim() || null;
  const rows = await readRows(q, nowMs);
  const listParams = Object.fromEntries(LIST_PARAMS.map((key) => [key, params.get(key) ?? undefined]));
  const filter = { ...parseSupportListFilter(listParams), view: parseSupportListView(context.slice('support.'.length)) };
  const counts = supportListFacetCounts(rows, filter, nowMs);
  return {
    context,
    total: cutSupportList(rows, filter, nowMs).rows.length,
    groups: FACET_GROUPS.map(({ facet, label }) => {
      // Every value any row offers (a picked value stays listed at 0), labelled from the rows.
      const options = [...valueLabels(rows, facet)].map(([value, optionLabel]) => ({ value, label: optionLabel, count: counts[facet][value] ?? 0 }));
      options.sort((a, b) => Number(a.value === 'none') - Number(b.value === 'none') || b.count - a.count || a.label.localeCompare(b.label));
      return { id: facet, label, param: facet, options };
    }),
  };
}
