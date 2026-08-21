'use client';

/**
 * GlobalHeaderSearch — icon-rail chrome for the global header. Resting state
 * matches sibling header IconButtons (search glyph only); click / focus
 * expands {@link GlobalFindCombobox}.
 *
 * Sole find surface app-wide — including on `/search`. Pending pulse while
 * browse resolve/retrieve runs comes from {@link subscribeGlobalSearchPending}.
 *
 * It does NOT own ⌘K. That chord belongs to {@link CommandBar}.
 *
 * Guard: `./cmdk-owner.guard.test.ts`.
 */

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { GlobalFindCombobox } from '@/components/search/GlobalFindCombobox';
import { useSearchRecents } from '@/hooks/useSearchRecents';
import { subscribeGlobalSearchPending } from '@/lib/global-search-pending';
import { isUnifiedHeaderSearchEnabled } from '@/lib/search/unified-header-search';

export function GlobalHeaderSearch() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [browsePending, setBrowsePending] = useState(false);

  useEffect(() => subscribeGlobalSearchPending(setBrowsePending), []);

  const onSearchPage = pathname === '/search' || Boolean(pathname?.startsWith('/search/'));

  const unifiedOn = isUnifiedHeaderSearchEnabled();
  const {
    recents,
    push: pushRecent,
    remove: removeRecent,
    clear: clearRecents,
  } = useSearchRecents({ migrateLegacy: unifiedOn, limit: 6 });

  // Two-way sync: `/search?q=` and legacy dashboard search mode seed the field.
  const syncedQuery = useMemo(() => {
    if (onSearchPage) return searchParams.get('q') ?? '';
    if (pathname === '/dashboard' && searchParams.get('mode') === 'search') {
      return searchParams.get('q') ?? '';
    }
    return '';
  }, [onSearchPage, pathname, searchParams]);

  return (
    <GlobalFindCombobox
      initialQuery={syncedQuery}
      pending={browsePending}
      recents={recents}
      enableRecents={unifiedOn}
      onRemoveRecent={removeRecent}
      onClearRecents={() => clearRecents()}
      onPushRecent={
        unifiedOn
          ? (entry) =>
              pushRecent({
                query: entry.query,
                scope: entry.scope,
                scopeHref: entry.scopeHref,
                topHit: entry.topHit,
              })
          : undefined
      }
      syncAssistantDraft
    />
  );
}
