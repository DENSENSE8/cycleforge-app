'use client';

/**
 * `/search/list` — the search bar's held list, FULL SCREEN (owner 2026-10-04:
 * "a full screen list display that the user can easily go into and view all
 * the information — not just a tiny top-left display").
 *
 * The list is the URL: `?refs=` (the bar's strings, same parse and cap),
 * `?locator=` (whose buckets), `?status=` (one bucket), `?sort=`, `?back=`
 * (where Esc returns). The answer is the SAME locate query the bar ran
 * (`useBulkList` → `useLocatedList`, one React Query key), so opening the
 * page asks nothing new; every fact rides it as `entry.facts`. The page's
 * Find (desk store keyed by this path) and Sort are its contextual sidebar
 * (`NAV_PAGE_DECLS.search`); the sheet is `PastedListSheet` — the same one
 * Receiving › Purchasing paints over its query.
 */

import { SEARCH_PATHS } from '@/lib/nav/route-tree';
import { useListFocusMode } from '@/lib/shell/list-focus-mode';
import { useDeskSearch } from '@/lib/outbound/desk-search-store';
import { useUrlBulkList, useUrlBulkListSort } from '@/components/sidebar/contextual/use-url-bulk-list';
import { PASTED_LIST_LAYOUT_KEY } from './pasted-list-table';
import { usePastedListBack } from './PastedListBack';
import { PastedListSheet } from './PastedListSheet';

const NOUN = { one: 'number', many: 'numbers' } as const;
const KEYS_GROUP = { id: 'pasted-list-page', title: 'Pasted list' } as const;
const EMPTY = {
  found: (query: string) => `No pasted number matches “${query}”.`,
  none: 'Nothing pasted. Paste a list into the search bar, then open it full screen.',
} as const;

export function PastedListPage() {
  const goBack = usePastedListBack();
  // Esc: the sheet's cell range first, then full screen (the shell's own Esc and `?` row), then the page.
  const focus = useListFocusMode();
  const list = useUrlBulkList();
  const [sort, setSort] = useUrlBulkListSort();
  // The page's ONE find is the sidebar field (`NAV_PAGE_DECLS.search`, desk store keyed by this path).
  const [query] = useDeskSearch(SEARCH_PATHS.pastedList);
  return (
    <PastedListSheet
      list={list}
      query={query}
      sorting={{ sort, onSort: setSort }}
      noun={NOUN}
      layoutKey={PASTED_LIST_LAYOUT_KEY}
      exportName="pasted-list"
      ariaLabel="Pasted numbers"
      empty={EMPTY}
      keysGroup={KEYS_GROUP}
      onEscape={focus.on ? undefined : goBack}
    />
  );
}
