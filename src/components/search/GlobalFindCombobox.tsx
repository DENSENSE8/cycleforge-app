'use client';

/**
 * GlobalFindCombobox — shared find field + WAI-ARIA combobox for the global
 * header (`presentation="chrome"`) and the `/search` centered stage
 * (`presentation="stage"`). One machine: preview / recents / keyboard /
 * identifier resolve. Hosts own recents storage and commit destinations.
 *
 * Does NOT own ⌘K — that chord belongs to CommandBar.
 * Guard: `src/components/layout/cmdk-owner.guard.test.ts`.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { IconButton, SearchField } from '@/design-system/primitives';
import { Maximize2, Search } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  GlobalSearchDropdown,
  type GlobalSearchDropdownState,
} from '@/components/search/GlobalSearchDropdown';
import {
  groupHitsForPreview,
  flattenPreviewGroups,
} from '@/components/search/search-tabs';
import { useAiQuickJump } from '@/hooks/useAiQuickJump';
import { GLOBAL_SEARCH_FOCUS_EVENT } from '@/lib/global-search-focus';
import {
  clearGlobalHeaderSearchDraft,
  setGlobalHeaderSearchDraft,
} from '@/lib/global-header-search-query';
import { recentRerunHref, type SearchRecentEntry } from '@/lib/search/search-recents';
import { searchRerunHref } from '@/lib/search/search-page-recents';
import {
  globalSearchHandoffHref,
  journeyHandoffHref,
  looksLikeIdentifier,
  orderRecordHref,
} from '@/lib/search/search-hit';
import { resolveSearchOrder } from '@/lib/search/resolve-search-order';
import type { AiSearchHit } from '@/lib/search/ai-search-client';
import { elevationClass } from '@/design-system/tokens/shadows';
import { cn } from '@/utils/_cn';
import {
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_WRAP,
  TOP_CHROME_ICON_GLYPH,
} from '@/components/layout/header-shell';

type GlobalFindPresentation = 'chrome' | 'stage';

/** Expanded search field width — shrink-0 so header siblings cannot crush it. */
const GLOBAL_FIND_FIELD_WIDTH = 'w-[24rem] shrink-0';

type GlobalFindPushRecent = (entry: {
  query: string;
  scope: string;
  scopeHref: string;
  topHit?: SearchRecentEntry['topHit'];
}) => void;

interface GlobalFindComboboxProps {
  presentation: GlobalFindPresentation;
  /**
   * When true, listens for {@link GLOBAL_SEARCH_FOCUS_EVENT}. Stage owns it on
   * `/search` without sel; chrome owns it everywhere else.
   */
  ownsFocusEvent?: boolean;
  /**
   * Chrome only: instead of expanding the header field, call this (typically
   * `dispatchGlobalSearchFocus` so the centered stage receives focus).
   */
  deferExpand?: boolean;
  onDeferExpand?: () => void;
  /** Controlled query. When omitted, the combobox keeps internal state. */
  query?: string;
  onQueryChange?: (query: string) => void;
  /** Seed when uncontrolled (chrome landing sync). */
  initialQuery?: string;
  recents: SearchRecentEntry[];
  /** Gate empty-query recents / first-use panels. */
  enableRecents: boolean;
  onRemoveRecent: (id: string) => void;
  onClearRecents: () => void;
  onPushRecent?: GlobalFindPushRecent;
  /**
   * Stage: selecting a preview hit / recent stays on `/search` via this
   * callback. When absent (chrome), hits navigate via href.
   */
  onSelectHit?: (hit: AiSearchHit) => void;
  /**
   * Stage: NL “See all” / Enter opens the in-page browse list instead of
   * navigating. When absent, chrome navigates to `/search?q=`.
   */
  onBrowseQuery?: (query: string) => void;
  /**
   * Stage: identifier resolved to one order → set `?sel=` (not `/o/[id]`).
   * When absent, chrome navigates to the durable record.
   */
  onSelectOrderId?: (orderId: number, query: string) => void;
  /** Hide preview dropdown (e.g. stage browse panel is already open). */
  suppressPreview?: boolean;
  trailingSuffix?: ReactNode;
  showOpenWorkbench?: boolean;
  listboxId?: string;
  autoFocus?: boolean;
  /** Sync draft to the far-right assistant (chrome only). */
  syncAssistantDraft?: boolean;
  className?: string;
}

function hrefForPreviewHit(hit: AiSearchHit): string {
  if (hit.entityType === 'order') return orderRecordHref(hit.id);
  return hit.href;
}

function navigateSearchHref(
  router: { push: (href: string) => void; replace: (href: string) => void },
  href: string,
  pathname: string | null,
) {
  if (pathname === '/dashboard' && href.startsWith('/dashboard')) {
    router.replace(href);
    return;
  }
  router.push(href);
}

const optionIdFor = (listboxId: string, index: number) => `${listboxId}-opt-${index}`;

export function GlobalFindCombobox({
  presentation,
  ownsFocusEvent = false,
  deferExpand = false,
  onDeferExpand,
  query: controlledQuery,
  onQueryChange,
  initialQuery = '',
  recents,
  enableRecents,
  onRemoveRecent,
  onClearRecents,
  onPushRecent,
  onSelectHit,
  onBrowseQuery,
  onSelectOrderId,
  suppressPreview = false,
  trailingSuffix,
  showOpenWorkbench,
  listboxId = 'global-search-listbox',
  autoFocus = false,
  syncAssistantDraft = false,
  className,
}: GlobalFindComboboxProps) {
  const router = useRouter();
  const pathname = usePathname();
  const isStage = presentation === 'stage';
  const openWorkbench = showOpenWorkbench ?? !isStage;

  const [uncontrolledQuery, setUncontrolledQuery] = useState(initialQuery);
  const query = controlledQuery ?? uncontrolledQuery;
  const setQuery = useCallback(
    (next: string) => {
      if (controlledQuery === undefined) setUncontrolledQuery(next);
      onQueryChange?.(next);
    },
    [controlledQuery, onQueryChange],
  );

  const [expanded, setExpanded] = useState(isStage || Boolean(initialQuery.trim()));
  const [focused, setFocused] = useState(false);
  const [hoverHeld, setHoverHeld] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [classicHits, setClassicHits] = useState<AiSearchHit[]>([]);
  const [classicSearching, setClassicSearching] = useState(false);

  const anchorRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimerRef = useRef<number>();
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const classicAbortRef = useRef<AbortController | null>(null);
  const classicDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const queryRef = useRef(query);
  queryRef.current = query;

  const trimmedQuery = query.trim();
  const hasValue = trimmedQuery.length > 0;
  const showPreview =
    !suppressPreview &&
    (isStage || expanded) &&
    focused &&
    trimmedQuery.length >= 2 &&
    !looksLikeIdentifier(trimmedQuery);

  const aiQuickJump = useAiQuickJump(trimmedQuery, {
    pageContext: pathname,
    limit: 6,
    enabled: showPreview,
  });

  useEffect(() => {
    if (!showPreview || aiQuickJump.aiEnabled) {
      classicAbortRef.current?.abort();
      setClassicHits([]);
      setClassicSearching(false);
      return;
    }
    classicAbortRef.current?.abort();
    setClassicHits([]);
    setClassicSearching(true);
    clearTimeout(classicDebounceRef.current);
    classicDebounceRef.current = setTimeout(async () => {
      classicAbortRef.current?.abort();
      const controller = new AbortController();
      classicAbortRef.current = controller;
      try {
        const res = await fetch(
          `/api/global-search?q=${encodeURIComponent(trimmedQuery)}&limit=6`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error('Search failed');
        const data = await res.json();
        if (!controller.signal.aborted) {
          setClassicHits((data.rows ?? []) as AiSearchHit[]);
          setClassicSearching(false);
        }
      } catch {
        if (!controller.signal.aborted) {
          setClassicHits([]);
          setClassicSearching(false);
        }
      }
    }, 250);
    return () => clearTimeout(classicDebounceRef.current);
  }, [trimmedQuery, showPreview, aiQuickJump.aiEnabled]);

  useEffect(() => {
    if (!syncAssistantDraft) return;
    setGlobalHeaderSearchDraft(query);
  }, [query, syncAssistantDraft]);

  useEffect(() => {
    if (!syncAssistantDraft) return;
    return () => {
      clearGlobalHeaderSearchDraft();
    };
  }, [syncAssistantDraft]);

  useEffect(() => {
    if (hasValue && !isStage) setExpanded(true);
  }, [hasValue, isStage]);

  useEffect(() => {
    return () => {
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
      if (hoverLeaveTimerRef.current) clearTimeout(hoverLeaveTimerRef.current);
    };
  }, []);

  // Seed uncontrolled chrome when parent passes a new initialQuery (URL sync).
  useEffect(() => {
    if (controlledQuery !== undefined) return;
    if (initialQuery === uncontrolledQuery) return;
    setUncontrolledQuery(initialQuery);
    if (initialQuery.trim() && !isStage) setExpanded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync seed only
  }, [initialQuery]);

  const clearCollapseTimer = useCallback(() => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
  }, []);

  const clearHoverLeaveTimer = useCallback(() => {
    if (hoverLeaveTimerRef.current) {
      clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = null;
    }
  }, []);

  const holdHover = useCallback(() => {
    clearHoverLeaveTimer();
    clearCollapseTimer();
    setHoverHeld(true);
  }, [clearCollapseTimer, clearHoverLeaveTimer]);

  const releaseHoverSoon = useCallback(() => {
    clearHoverLeaveTimer();
    hoverLeaveTimerRef.current = setTimeout(() => {
      hoverLeaveTimerRef.current = null;
      setHoverHeld(false);
    }, 160);
  }, [clearHoverLeaveTimer]);

  const tryCollapse = useCallback(() => {
    if (isStage) return;
    const root = rootRef.current;
    if (root?.contains(document.activeElement)) return;
    if (queryRef.current.trim()) return;
    setHoverHeld(false);
    setExpanded(false);
    setFocused(false);
  }, [isStage]);

  const scheduleCollapse = useCallback(() => {
    if (isStage) return;
    clearCollapseTimer();
    collapseTimerRef.current = setTimeout(tryCollapse, 160);
  }, [clearCollapseTimer, tryCollapse, isStage]);

  const expandAndFocus = useCallback(() => {
    if (deferExpand) {
      onDeferExpand?.();
      return;
    }
    holdHover();
    setExpanded(true);
    setFocused(true);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      if (document.activeElement === el) el.select();
    });
  }, [deferExpand, onDeferExpand, holdHover]);

  useEffect(() => {
    if (!ownsFocusEvent) return;
    const handleFocusRequest = () => expandAndFocus();
    window.addEventListener(GLOBAL_SEARCH_FOCUS_EVENT, handleFocusRequest);
    return () => window.removeEventListener(GLOBAL_SEARCH_FOCUS_EVENT, handleFocusRequest);
  }, [ownsFocusEvent, expandAndFocus]);

  // Stage always mounts expanded — autofocus on land.
  useEffect(() => {
    if (!isStage || !autoFocus) return;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [isStage, autoFocus]);

  const handleChange = useCallback(
    (next: string) => {
      setQuery(next);
    },
    [setQuery],
  );

  const handleClear = useCallback(() => {
    setQuery('');
    window.clearTimeout(blurTimerRef.current);
    setFocused(true);
    if (!isStage) setExpanded(true);
    inputRef.current?.focus();
  }, [setQuery, isStage]);

  const previewHits = aiQuickJump.aiEnabled ? aiQuickJump.hits : classicHits;
  const previewSearching = aiQuickJump.aiEnabled ? aiQuickJump.searching : classicSearching;
  const previewGroups = useMemo(() => groupHitsForPreview(previewHits), [previewHits]);
  const flatPreviewHits = useMemo(() => flattenPreviewGroups(previewGroups), [previewGroups]);

  const openSearchPage = useCallback(() => {
    if (!trimmedQuery) return;
    setFocused(false);

    if (onBrowseQuery) {
      onBrowseQuery(trimmedQuery);
      return;
    }

    if (!looksLikeIdentifier(trimmedQuery)) {
      const handoff = globalSearchHandoffHref(trimmedQuery, previewHits);
      navigateSearchHref(router, handoff, pathname);
      return;
    }

    void (async () => {
      const resolved = await resolveSearchOrder(trimmedQuery);
      if (resolved.status === 'ok') {
        if (onSelectOrderId) {
          onSelectOrderId(resolved.order.id, trimmedQuery);
          return;
        }
        navigateSearchHref(router, orderRecordHref(resolved.order.id), pathname);
        return;
      }
      navigateSearchHref(router, searchRerunHref(trimmedQuery), pathname);
    })();
  }, [router, trimmedQuery, previewHits, pathname, onBrowseQuery, onSelectOrderId]);

  const openSearchWorkbench = useCallback(() => {
    setFocused(false);
    navigateSearchHref(
      router,
      trimmedQuery ? searchRerunHref(trimmedQuery) : '/search',
      pathname,
    );
  }, [router, trimmedQuery, pathname]);

  const emptyQuery = trimmedQuery.length === 0;
  const fieldOpen = isStage || expanded;
  const showRecents =
    enableRecents && fieldOpen && emptyQuery && recents.length > 0 && (focused || hoverHeld);
  const showFirstUse =
    enableRecents && fieldOpen && emptyQuery && recents.length === 0 && (focused || hoverHeld);
  const dropdownOpen = showPreview || showRecents || showFirstUse;

  const dropdownState: GlobalSearchDropdownState = showPreview
    ? previewSearching && previewHits.length === 0
      ? 'loading'
      : previewHits.length === 0
        ? 'empty'
        : 'preview'
    : showRecents
      ? 'recents'
      : 'first-use';

  const optionCount =
    dropdownState === 'recents'
      ? recents.length
      : dropdownState === 'preview'
        ? flatPreviewHits.length + 1
        : 0;

  const navRef = useRef({ dropdownOpen, dropdownState, optionCount, recents, flatPreviewHits });
  navRef.current = { dropdownOpen, dropdownState, optionCount, recents, flatPreviewHits };

  useEffect(() => {
    setActiveIndex(-1);
  }, [trimmedQuery, dropdownOpen]);

  const commitHit = useCallback(
    (hit: AiSearchHit) => {
      setFocused(false);
      if (onSelectHit) {
        onSelectHit(hit);
        return;
      }
      navigateSearchHref(router, hrefForPreviewHit(hit), pathname);
    },
    [onSelectHit, router, pathname],
  );

  const navigateActive = useCallback((): boolean => {
    const { dropdownState: st, recents: rec, flatPreviewHits: hits } = navRef.current;
    setFocused(false);
    if (st === 'recents') {
      const entry = rec[activeIndex];
      if (!entry) return false;
      if (onBrowseQuery) {
        setQuery(entry.query);
        onBrowseQuery(entry.query);
        return true;
      }
      navigateSearchHref(router, recentRerunHref(entry), pathname);
      return true;
    }
    if (st === 'preview') {
      if (activeIndex === 0) {
        openSearchPage();
        return true;
      }
      const hit = hits[activeIndex - 1];
      if (!hit) return false;
      commitHit(hit);
      return true;
    }
    return false;
  }, [activeIndex, router, openSearchPage, pathname, onBrowseQuery, setQuery, commitHit]);

  useEffect(() => {
    if (!fieldOpen) return;
    const el = inputRef.current;
    if (!el) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (query.trim()) handleClear();
        else if (!isStage) {
          el.blur();
          setFocused(false);
          setExpanded(false);
        } else {
          el.blur();
          setFocused(false);
        }
        return;
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        const { dropdownOpen: open, dropdownState: st, flatPreviewHits: hits } = navRef.current;
        if (!open || st !== 'preview' || activeIndex < 1) return;
        const hit = hits[activeIndex - 1];
        const journey = hit ? journeyHandoffHref(hit) : null;
        if (!journey) return;
        e.preventDefault();
        setFocused(false);
        router.push(journey);
        return;
      }
      const { dropdownOpen: open, optionCount: count } = navRef.current;
      if (!open || count === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => (prev < 0 ? 0 : (prev + 1) % count));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => (prev < 0 ? count - 1 : (prev - 1 + count) % count));
      }
    };
    el.addEventListener('keydown', onKeyDown);
    return () => el.removeEventListener('keydown', onKeyDown);
  }, [fieldOpen, query, handleClear, activeIndex, router, isStage]);

  const handleSearchSubmit = useCallback(
    (raw: string) => {
      if (navRef.current.dropdownOpen && activeIndex >= 0 && navigateActive()) return;
      const trimmed = raw.trim();
      if (!trimmed) return;

      setFocused(false);

      if (looksLikeIdentifier(trimmed)) {
        void (async () => {
          const resolved = await resolveSearchOrder(trimmed);
          if (resolved.status === 'ok') {
            const href = orderRecordHref(resolved.order.id);
            onPushRecent?.({
              query: trimmed,
              scope: isStage ? 'dashboard' : 'global',
              scopeHref: searchRerunHref(trimmed),
              topHit: {
                title: resolved.order.product_title || resolved.order.order_id || trimmed,
                href,
                entityType: 'order',
              },
            });
            if (onSelectOrderId) {
              onSelectOrderId(resolved.order.id, trimmed);
              return;
            }
            navigateSearchHref(router, href, pathname);
            return;
          }
          onPushRecent?.({
            query: trimmed,
            scope: isStage ? 'dashboard' : 'global',
            scopeHref: searchRerunHref(trimmed),
          });
          if (onBrowseQuery) {
            onBrowseQuery(trimmed);
            return;
          }
          navigateSearchHref(router, searchRerunHref(trimmed), pathname);
        })();
        return;
      }

      const preview = navRef.current.flatPreviewHits;
      const href = globalSearchHandoffHref(trimmed, preview);
      const top = preview.find((h) => h.entityType === 'order');
      onPushRecent?.({
        query: trimmed,
        scope: isStage ? 'dashboard' : 'global',
        scopeHref: href.startsWith('/search') ? href : searchRerunHref(trimmed),
        topHit: top
          ? { title: top.title, href: orderRecordHref(top.id), entityType: 'order' }
          : undefined,
      });

      if (onBrowseQuery) {
        // Sole preview order → open in-page; else browse list under the bar.
        if (top && preview.filter((h) => h.entityType === 'order').length === 1 && preview.length === 1 && onSelectHit) {
          onSelectHit(top);
          return;
        }
        onBrowseQuery(trimmed);
        return;
      }
      navigateSearchHref(router, href, pathname);
    },
    [
      router,
      onPushRecent,
      activeIndex,
      navigateActive,
      pathname,
      isStage,
      onSelectOrderId,
      onBrowseQuery,
      onSelectHit,
    ],
  );

  const handleFocusIn = () => {
    window.clearTimeout(blurTimerRef.current);
    holdHover();
    if (!isStage) setExpanded(true);
    setFocused(true);
  };

  const handleFocusOut = () => {
    blurTimerRef.current = window.setTimeout(() => {
      setFocused(false);
      tryCollapse();
    }, 160);
  };

  useEffect(() => {
    if (!fieldOpen) return;
    const el = inputRef.current;
    if (!el) return;
    el.setAttribute('role', 'combobox');
    el.setAttribute('aria-autocomplete', 'list');
    el.setAttribute('aria-expanded', String(dropdownOpen));
    el.setAttribute('aria-controls', listboxId);
    if (dropdownOpen && activeIndex >= 0) {
      el.setAttribute('aria-activedescendant', optionIdFor(listboxId, activeIndex));
    } else {
      el.removeAttribute('aria-activedescendant');
    }
  }, [fieldOpen, dropdownOpen, activeIndex, listboxId]);

  const field = (
    <div
      ref={anchorRef}
      className={cn(
        // Kinetic Ledger find cell — square, zero radius. Never a pill.
        'group/search relative flex items-center overflow-visible rounded-none',
        isStage
          ? cn(
              // `/search` stage: raised square block (not a floating bubble).
              //
              // WIDTH IS THE HOST'S, not the header's 24rem. On the stage this
              // field is the head of the browse column beneath it — at a fixed
              // 24rem it floated as a narrower slab above a 35rem results
              // panel, which is what made two halves of one act read as two
              // unrelated islands. Header chrome keeps its fixed cell because
              // there it is one item in a beam, not the top of a column.
              'h-8 w-full border border-border-soft bg-surface-card',
              elevationClass('raised'),
            )
          : cn(
              // Header chrome: fill the beam top→bottom; vertical hairlines lock
              // the cell into the header geometry. Active focus = bottom rule
              // (always border-b-2 so focus doesn't grow the beam height).
              'h-full self-stretch border-x border-b-2 border-border-hairline bg-transparent',
              focused ? 'border-b-border-strong' : 'border-b-transparent',
              GLOBAL_FIND_FIELD_WIDTH,
            ),
        className,
      )}
      onMouseEnter={holdHover}
      onMouseLeave={() => {
        releaseHoverSoon();
        scheduleCollapse();
      }}
      onFocusCapture={handleFocusIn}
      onBlurCapture={handleFocusOut}
    >
      <SearchField
        inputRef={inputRef}
        value={query}
        onChange={handleChange}
        onSearch={handleSearchSubmit}
        onClear={handleClear}
        placeholder="Order, serial, tracking…"
        debounceMs={320}
        isSearching={previewSearching}
        tone="neutral"
        size="compact"
        hideUnderline
        autoFocus={autoFocus || (!isStage && expanded)}
        className="min-w-0 flex-1 border-0 bg-transparent px-3"
        trailingPrefix={
          openWorkbench ? (
            <HoverTooltip label="Open search" focusable={false}>
              <IconButton
                icon={<Maximize2 className="h-3 w-3" />}
                ariaLabel="Open search page"
                onMouseDown={(e) => e.preventDefault()}
                onClick={openSearchWorkbench}
                className="inline-flex h-3.5 w-3.5 items-center justify-center text-text-faint transition-colors duration-100 ease-out hover:text-blue-600 active:scale-95"
              />
            </HoverTooltip>
          ) : undefined
        }
        trailingSuffix={trailingSuffix}
      />

      <GlobalSearchDropdown
        open={dropdownOpen}
        anchorRef={anchorRef}
        listboxId={listboxId}
        optionId={(index) => optionIdFor(listboxId, index)}
        activeIndex={activeIndex}
        state={dropdownState}
        query={trimmedQuery}
        recents={recents}
        previewGroups={previewGroups}
        onClose={() => setFocused(false)}
        onHoverStart={holdHover}
        onHoverEnd={() => {
          releaseHoverSoon();
          scheduleCollapse();
        }}
        onSeeAll={openSearchPage}
        onSelectRecent={(entry) => {
          handleChange(entry.query);
          setFocused(false);
          if (onBrowseQuery) {
            onBrowseQuery(entry.query);
            return;
          }
          navigateSearchHref(router, recentRerunHref(entry), pathname);
        }}
        onRemoveRecent={onRemoveRecent}
        onClearRecents={() => onClearRecents()}
        onNavigateHit={(hit, event: ReactMouseEvent) => {
          event.preventDefault();
          commitHit(hit);
        }}
      />
    </div>
  );

  if (isStage) {
    return (
      <div ref={rootRef} className="contents">
        {field}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="contents">
      {!expanded ? (
        <div className={HEADER_ICON_WRAP} onFocusCapture={expandAndFocus}>
          <HoverTooltip label="Search" asChild>
            <IconButton
              type="button"
              size="md"
              ariaLabel="Search"
              aria-expanded={false}
              onClick={expandAndFocus}
              className={HEADER_ICON_BTN_CLASS}
              icon={<Search className={TOP_CHROME_ICON_GLYPH} />}
            />
          </HoverTooltip>
        </div>
      ) : (
        field
      )}
    </div>
  );
}
