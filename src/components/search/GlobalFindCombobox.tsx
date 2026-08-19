'use client';

/**
 * GlobalFindCombobox — find field + WAI-ARIA combobox for the global header
 * (`presentation="chrome"`).
 *
 * Chrome Enter/paste contract (number / identifier find):
 *   • Pulse {@link SearchPendingBar} while {@link commitIdentifierFind} runs.
 *   • Hit → seed resolve cache → navigate to `/search?sel=…` only.
 *   • Miss → “No matches” dropdown on the current page (URL unchanged).
 *   • Never open `/search?q=` or auto-commit a preview “best hit” on Enter.
 * Explicit arrow+Enter / click still opens a highlighted preview row.
 *
 * `presentation="stage"` remains for legacy callers but `/search` browse no
 * longer mounts a page-local field — header owns find everywhere.
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
import { useQueryClient } from '@tanstack/react-query';
import { IconButton, SearchField } from '@/design-system/primitives';
import { Search } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  GlobalSearchDropdown,
  type GlobalSearchDropdownState,
} from '@/components/search/GlobalSearchDropdown';
import { SearchPendingBar } from '@/components/search/SearchPendingPulse';
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
import { type SearchRecentEntry } from '@/lib/search/search-recents';
import { searchRerunHref } from '@/lib/search/search-page-recents';
import {
  journeyHandoffHref,
  looksLikeIdentifier,
} from '@/lib/search/search-hit';
import {
  commitIdentifierFind,
  hrefForPreviewHit,
} from '@/lib/search/commit-identifier-find';
import type { AiSearchHit } from '@/lib/search/ai-search-client';
import { elevationClass } from '@/design-system/tokens/shadows';
import { cn } from '@/utils/_cn';
import {
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_WRAP,
  TOP_CHROME_ICON_FACE,
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
   * Stage: NL Enter opens the in-page browse list instead of navigating.
   * When absent, chrome keeps the query in the header field (never `/search?q=`).
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
  listboxId?: string;
  autoFocus?: boolean;
  /** Sync draft to the far-right assistant (chrome only). */
  syncAssistantDraft?: boolean;
  /**
   * External pending (browse resolve/retrieve via
   * {@link subscribeGlobalSearchPending}). Combined with local identifier
   * resolve pending for {@link SearchPendingBar}.
   */
  pending?: boolean;
  className?: string;
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
  listboxId = 'global-search-listbox',
  autoFocus = false,
  syncAssistantDraft = false,
  pending = false,
  className,
}: GlobalFindComboboxProps) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const isStage = presentation === 'stage';

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
  const [resolvePending, setResolvePending] = useState(false);
  const showPendingBar = pending || resolvePending;

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
  // Identifiers (serials, tracking, order #) get the same preview dropdown as
  // NL — hits or “No matches…”. Enter still prefers resolveSearchOrder for
  // order/tracking fast-open; miss re-focuses so this dropdown stays open.
  const showPreview =
    !suppressPreview &&
    (isStage || expanded) &&
    focused &&
    trimmedQuery.length >= 2;

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

  // Expand chrome while it has a value — except when deferring to a host that
  // owns find (legacy; header is now the sole find surface).
  useEffect(() => {
    if (isStage || deferExpand) return;
    if (hasValue) setExpanded(true);
  }, [hasValue, isStage, deferExpand]);

  // Pending pulse is painted on the expanded field — never leave it icon-only
  // while resolve/retrieve is in flight.
  useEffect(() => {
    if (isStage) return;
    if (pending || resolvePending) setExpanded(true);
  }, [pending, resolvePending, isStage]);

  useEffect(() => {
    return () => {
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
      if (hoverLeaveTimerRef.current) clearTimeout(hoverLeaveTimerRef.current);
    };
  }, []);

  // Layout-persistent chrome: adopt URL seed, or return to icon-rail rest.
  // Leaving `/search?q=` used to clear the seed but leave `expanded` true —
  // and `autoFocus={expanded}` then re-focused the field on the next page.
  useEffect(() => {
    if (isStage) return;
    if (deferExpand) {
      // Stage owns find — keep chrome icon-only (do not mirror ?q= into expand).
      if (controlledQuery === undefined) setUncontrolledQuery('');
      setExpanded(false);
      setFocused(false);
      return;
    }
    if (controlledQuery === undefined) {
      setUncontrolledQuery(initialQuery);
    }
    if (initialQuery.trim()) {
      setExpanded(true);
    } else {
      setExpanded(false);
      setFocused(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync seed / route rest
  }, [initialQuery, pathname, isStage, deferExpand, controlledQuery]);

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
    if (pending || resolvePending) return;
    const root = rootRef.current;
    if (root?.contains(document.activeElement)) return;
    if (queryRef.current.trim()) return;
    setHoverHeld(false);
    setExpanded(false);
    setFocused(false);
  }, [isStage, pending, resolvePending]);

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

  const keepPreviewOpen = useCallback(() => {
    window.clearTimeout(blurTimerRef.current);
    if (!isStage) setExpanded(true);
    setFocused(true);
    inputRef.current?.focus();
  }, [isStage]);

  /** Re-run a recent in the header field — never navigate to `/search?q=`. */
  const rerunRecentInField = useCallback(
    (entry: SearchRecentEntry) => {
      setQuery(entry.query);
      if (onBrowseQuery) {
        setFocused(false);
        onBrowseQuery(entry.query);
        return;
      }
      keepPreviewOpen();
    },
    [setQuery, onBrowseQuery, keepPreviewOpen],
  );

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
        ? flatPreviewHits.length
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
    if (st === 'recents') {
      const entry = rec[activeIndex];
      if (!entry) return false;
      rerunRecentInField(entry);
      return true;
    }
    setFocused(false);
    if (st === 'preview') {
      const hit = hits[activeIndex];
      if (!hit) return false;
      commitHit(hit);
      return true;
    }
    return false;
  }, [activeIndex, rerunRecentInField, commitHit]);

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
        if (!open || st !== 'preview' || activeIndex < 0) return;
        const hit = hits[activeIndex];
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
      // Explicit keyboard highlight → commit that row (recent re-run or preview hit).
      if (navRef.current.dropdownOpen && activeIndex >= 0 && navigateActive()) return;
      const trimmed = raw.trim();
      if (!trimmed) return;

      // ── Identifier (order # / tracking / serial): pulse → hit or miss dropdown ──
      if (looksLikeIdentifier(trimmed)) {
        setFocused(false);
        void (async () => {
          setResolvePending(true);
          try {
            const result = await commitIdentifierFind(queryClient, trimmed);
            if (result.kind === 'navigate') {
              onPushRecent?.({
                query: trimmed,
                scope: isStage ? 'dashboard' : 'global',
                scopeHref: result.href,
                topHit: {
                  title: result.order.product_title || result.order.order_id || trimmed,
                  href: result.href,
                  entityType: 'order',
                },
              });
              if (onSelectOrderId) {
                onSelectOrderId(result.orderId, trimmed);
                return;
              }
              navigateSearchHref(router, result.href, pathname);
              return;
            }
            onPushRecent?.({
              query: trimmed,
              scope: isStage ? 'dashboard' : 'global',
              scopeHref: searchRerunHref(trimmed),
            });
            // Stage legacy may still browse; chrome miss = dropdown only.
            if (onBrowseQuery) {
              onBrowseQuery(trimmed);
              return;
            }
            keepPreviewOpen();
          } finally {
            setResolvePending(false);
          }
        })();
        return;
      }

      // ── Single settled hit = the answer ──
      // One result is not a list worth reading; open the record (and its data)
      // rather than making the operator click the only row. Applies to chrome
      // and stage alike, and only once retrieval has SETTLED — mid-flight the
      // preview may legitimately hold one hit on its way to several.
      {
        const preview = navRef.current.flatPreviewHits;
        if (!previewSearching && preview.length === 1) {
          onPushRecent?.({
            query: trimmed,
            scope: isStage ? 'dashboard' : 'global',
            scopeHref: hrefForPreviewHit(preview[0]),
            topHit: {
              title: preview[0].title,
              href: hrefForPreviewHit(preview[0]),
              entityType: preview[0].entityType,
            },
          });
          commitHit(preview[0]);
          return;
        }
      }

      // ── Natural language ──
      // Chrome: stay put — dropdown shows hits or “No matches”; never navigate.
      // Stage: optional in-page browse via onBrowseQuery.
      onPushRecent?.({
        query: trimmed,
        scope: isStage ? 'dashboard' : 'global',
        scopeHref: searchRerunHref(trimmed),
      });
      if (onBrowseQuery) {
        const preview = navRef.current.flatPreviewHits;
        const top = preview.find((h) => h.entityType === 'order') ?? preview[0];
        if (
          top &&
          top.entityType === 'order' &&
          preview.filter((h) => h.entityType === 'order').length === 1 &&
          preview.length === 1 &&
          onSelectHit
        ) {
          setFocused(false);
          onSelectHit(top);
          return;
        }
        setFocused(false);
        onBrowseQuery(trimmed);
        return;
      }
      keepPreviewOpen();
    },
    [
      router,
      pathname,
      onPushRecent,
      activeIndex,
      navigateActive,
      isStage,
      onSelectOrderId,
      onBrowseQuery,
      onSelectHit,
      queryClient,
      keepPreviewOpen,
      previewSearching,
      commitHit,
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
        // overflow-hidden so the absolute pending sweep stays inside the cell
        // (dropdown is portaled).
        'group/search relative flex items-center overflow-hidden rounded-none',
        isStage
          ? cn(
              // Legacy stage presentation: raised square block.
              'h-8 w-full border border-border-soft bg-surface-card',
              elevationClass('raised'),
            )
          : cn(
              // Header chrome: fill the beam top→bottom; vertical hairlines lock
              // the cell into the header geometry. Active focus = bottom rule
              // (always border-b-2 so focus doesn't grow the beam height).
              // Pending sweep replaces the focus rule — drop border-b while
              // SearchPendingBar owns the bottom edge.
              'h-full self-stretch border-x border-b-2 border-border-hairline bg-transparent',
              showPendingBar
                ? 'border-b-0'
                : focused
                  ? 'border-b-border-strong'
                  : 'border-b-transparent',
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
        // 0 = track keystrokes straight into `query`. The RETRIEVE debounce
        // lives in useAiQuickJump (which also owns abort); a second one here
        // just stacked ~320ms of dead time in front of every search.
        debounceMs={0}
        isSearching={previewSearching}
        tone="neutral"
        size="compact"
        hideUnderline
        autoFocus={autoFocus || (!isStage && expanded)}
        className="min-w-0 flex-1 border-0 bg-transparent px-3"
        trailingSuffix={trailingSuffix}
      />

      {showPendingBar ? <SearchPendingBar /> : null}

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
        trace={{
          // The classic arm has no sub-phases, so it reports the open request
          // directly; only the AI arm distinguishes debounce from retrieve.
          phase: aiQuickJump.aiEnabled ? aiQuickJump.phase : 'retrieving',
          arm: aiQuickJump.aiEnabled ? 'ai' : 'classic',
          identifier: looksLikeIdentifier(trimmedQuery),
          pageContext: pathname,
        }}
        onClose={() => setFocused(false)}
        onHoverStart={holdHover}
        onHoverEnd={() => {
          releaseHoverSoon();
          scheduleCollapse();
        }}
        onSelectRecent={rerunRecentInField}
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
              icon={<Search className={TOP_CHROME_ICON_FACE} />}
            />
          </HoverTooltip>
        </div>
      ) : (
        field
      )}
    </div>
  );
}
