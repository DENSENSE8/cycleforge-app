'use client';

/**
 * GlobalHeaderSearch — icon-rail chrome for the global header. Resting state
 * matches sibling header IconButtons (search glyph only); click / focus
 * expands {@link GlobalFindCombobox} (`presentation="chrome"`).
 *
 * It does NOT own ⌘K. That chord belongs to {@link CommandBar}. This component
 * listens for `GLOBAL_SEARCH_FOCUS_EVENT` except on `/search` without `?sel=`,
 * where the centered stage owns focus (header click defers via
 * {@link dispatchGlobalSearchFocus}).
 *
 * Guard: `./cmdk-owner.guard.test.ts`.
 */

import { useMemo } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { GlobalFindCombobox } from '@/components/search/GlobalFindCombobox';
import { useSearchRecents } from '@/hooks/useSearchRecents';
import { dispatchGlobalSearchFocus } from '@/lib/global-search-focus';
import { isUnifiedHeaderSearchEnabled } from '@/lib/search/unified-header-search';
import { SEARCH_SEL_PARAM, parseSearchSel } from '@/lib/search/search-selection';

export function GlobalHeaderSearch() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const onSearchStage = pathname === '/search' || Boolean(pathname?.startsWith('/search/'));
  const sel = useMemo(
    () => parseSearchSel(searchParams.get(SEARCH_SEL_PARAM)),
    [searchParams],
  );
  // Stage owns find when `/search` has no selection — chrome stays icon-only
  // and defers expand/focus to the centered field.
  const deferToStage = Boolean(onSearchStage && !sel);

  const unifiedOn = isUnifiedHeaderSearchEnabled();
  const {
    recents,
    push: pushRecent,
    remove: removeRecent,
    clear: clearRecents,
  } = useSearchRecents({ migrateLegacy: unifiedOn, limit: 6 });

  // Two-way sync: `/search?q=` and legacy dashboard search mode seed the field.
  const syncedQuery = useMemo(() => {
    if (onSearchStage) return searchParams.get('q') ?? '';
    if (pathname === '/dashboard' && searchParams.get('mode') === 'search') {
      return searchParams.get('q') ?? '';
    }
    return '';
  }, [onSearchStage, pathname, searchParams]);

  return (
    <GlobalFindCombobox
      presentation="chrome"
      ownsFocusEvent={!deferToStage}
      deferExpand={deferToStage}
      onDeferExpand={dispatchGlobalSearchFocus}
      initialQuery={syncedQuery}
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
      showOpenWorkbench
    />
  );
}
