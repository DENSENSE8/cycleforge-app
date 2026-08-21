'use client';

/**
 * GlobalFindCombobox — the find field + WAI-ARIA combobox for the global
 * header. One presentation, one mount ({@link GlobalHeaderSearch}).
 *
 * Enter / paste contract (number / identifier find):
 *   • Pulse {@link SearchPendingBar} while {@link commitIdentifierFind} runs.
 *   • Hit → seed resolve cache → navigate to `/search?sel=…` only.
 *   • Miss → “No matches” dropdown on the current page (URL unchanged).
 *   • Never open `/search?q=` or auto-commit a preview “best hit” on Enter.
 * Explicit arrow+Enter / click still opens a highlighted preview row.
 *
 * **The `stage` presentation is gone (2026-08-21).** `/search` stopped mounting
 * a page-local field when the header became the sole find surface, and the
 * component kept ~30 `isStage` branches plus nine props for callers that no
 * longer existed — `onSelectHit`, `onBrowseQuery`, `onSelectOrderId`,
 * `suppressPreview`, `autoFocus`, the controlled `query`/`onQueryChange` pair,
 * `trailingSuffix`, and the `deferExpand`/`onDeferExpand` handshake with the
 * stage that owned focus. Every one of them was a live branch a reader had to
 * hold, guarding behaviour nothing could reach. Do not re-add a presentation
 * enum for a second mount: a second find surface needs the ruling first.
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
import { cn } from '@/utils/_cn';
import {
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_WRAP,
  TOP_CHROME_ICON_FACE,
} from '@/components/layout/header-shell';

/** Expanded search field width — shrink-0 so header siblings cannot crush it. */
const GLOBAL_FIND_FIELD_WIDTH = 'w-[24rem] shrink-0';

/** Free-text typeahead wait — identifiers fire immediately (0ms). */
const NL_DEBOUNCE_MS = 80;

/**
 * The listbox id. A module constant rather than a prop: there is exactly one
 * mount of this component in the app, so a per-instance id was configuring a
 * collision that cannot happen.
 */
const LISTBOX_ID = 'global-search-listbox';

type GlobalFindPushRecent = (entry: {
  query: string;
  scope: string;
  scopeHref: string;
  topHit?: SearchRecentEntry['topHit'];
}) => void;

interface GlobalFindComboboxProps {
  /** Seed from the URL (`/search?q=`) — the header field's two-way sync. */
  initialQuery?: string;
  recents: SearchRecentEntry[];
  /** Gate empty-query recents / first-use panels. */
  enableRecents: boolean;
  onRemoveRecent: (id: string) => void;
  onClearRecents: () => void;
  onPushRecent?: GlobalFindPushRecent;
  /** Sync draft to the far-right assistant. */
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
  initialQuery = '',
  recents,
  enableRecents,
  onRemoveRecent,
  onClearRecents,
  onPushRecent,
  syncAssistantDraft = false,
  pending = false,
  className,
}: GlobalFindComboboxProps) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  const [query, setQuery] = useState(initialQuery);
  const [expanded, setExpanded] = useState(Boolean(initialQuery.trim()));
  const [focused, setFocused] = useState(false);
  const [hoverHeld, setHoverHeld] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [previewHits, setPreviewHits] = useState<AiSearchHit[]>([]);
  const [previewSearching, setPreviewSearching] = useState(false);
  const [resolvePending, setResolvePending] = useState(false);
  const showPendingBar = pending || resolvePending;

  const anchorRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimerRef = useRef<number>();
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const queryRef = useRef(query);
  queryRef.current = query;

  const trimmedQuery = query.trim();
  const hasValue = trimmedQuery.length > 0;
  // Identifiers (serials, tracking, order #) get the same preview dropdown as
  // free text — hits or “No matches…”. Enter still prefers resolveSearchOrder
  // for order/tracking fast-open; miss re-focuses so this dropdown stays open.
  const hasPreviewQuery = expanded && focused && trimmedQuery.length >= 2;

  // Classic cross-entity find only — GET /api/global-search. Keep last hits
  // while the next request is in flight; clear only when the query drops
  // below 2 chars. Identifiers fire immediately; NL waits a short trail.
  useEffect(() => {
    if (!hasPreviewQuery) {
      searchAbortRef.current?.abort();
      clearTimeout(searchDebounceRef.current);
      setPreviewHits([]);
      setPreviewSearching(false);
      return;
    }
    searchAbortRef.current?.abort();
    setPreviewSearching(true);
    clearTimeout(searchDebounceRef.current);
    const waitMs = looksLikeIdentifier(trimmedQuery) ? 0 : NL_DEBOUNCE_MS;
    searchDebounceRef.current = setTimeout(async () => {
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;
      try {
        const res = await fetch(
          `/api/global-search?q=${encodeURIComponent(trimmedQuery)}&limit=6`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error('Search failed');
        const data = await res.json();
        if (!controller.signal.aborted) {
          setPreviewHits((data.rows ?? []) as AiSearchHit[]);
          setPreviewSearching(false);
        }
      } catch {
        if (!controller.signal.aborted) {
          setPreviewHits([]);
          setPreviewSearching(false);
        }
      }
    }, waitMs);
    return () => clearTimeout(searchDebounceRef.current);
  }, [trimmedQuery, hasPreviewQuery]);

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

  // Expand while the field has a value.
  useEffect(() => {
    if (hasValue) setExpanded(true);
  }, [hasValue]);

  // Pending pulse is painted on the expanded field — never leave it icon-only
  // while resolve/retrieve is in flight.
  useEffect(() => {
    if (pending || resolvePending) setExpanded(true);
  }, [pending, resolvePending]);

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
    setQuery(initialQuery);
    if (initialQuery.trim()) {
      setExpanded(true);
    } else {
      setExpanded(false);
      setFocused(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync seed / route rest
  }, [initialQuery, pathname]);

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
    if (pending || resolvePending) return;
    const root = rootRef.current;
    if (root?.contains(document.activeElement)) return;
    if (queryRef.current.trim()) return;
    setHoverHeld(false);
    setExpanded(false);
    setFocused(false);
  }, [pending, resolvePending]);

  const scheduleCollapse = useCallback(() => {
    clearCollapseTimer();
    collapseTimerRef.current = setTimeout(tryCollapse, 160);
  }, [clearCollapseTimer, tryCollapse]);

  const expandAndFocus = useCallback(() => {
    holdHover();
    setExpanded(true);
    setFocused(true);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      if (document.activeElement === el) el.select();
    });
  }, [holdHover]);

  // Sole find surface, so this listener is unconditional — `ownsFocusEvent`
  // existed to arbitrate with the `/search` stage field, which is gone.
  useEffect(() => {
    const handleFocusRequest = () => expandAndFocus();
    window.addEventListener(GLOBAL_SEARCH_FOCUS_EVENT, handleFocusRequest);
    return () => window.removeEventListener(GLOBAL_SEARCH_FOCUS_EVENT, handleFocusRequest);
  }, [expandAndFocus]);

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
    setExpanded(true);
    inputRef.current?.focus();
  }, [setQuery]);

  const previewGroups = useMemo(() => groupHitsForPreview(previewHits), [previewHits]);
  const flatPreviewHits = useMemo(() => flattenPreviewGroups(previewGroups), [previewGroups]);

  const keepPreviewOpen = useCallback(() => {
    window.clearTimeout(blurTimerRef.current);
    setExpanded(true);
    setFocused(true);
    inputRef.current?.focus();
  }, []);

  /** Re-run a recent in the header field — never navigate to `/search?q=`. */
  const rerunRecentInField = useCallback(
    (entry: SearchRecentEntry) => {
      setQuery(entry.query);
      keepPreviewOpen();
    },
    [setQuery, keepPreviewOpen],
  );

  const emptyQuery = trimmedQuery.length === 0;
  const fieldOpen = expanded;
  const showRecents =
    enableRecents && fieldOpen && emptyQuery && recents.length > 0 && (focused || hoverHeld);
  const showFirstUse =
    enableRecents && fieldOpen && emptyQuery && recents.length === 0 && (focused || hoverHeld);
  // Open preview when there are hits, or when search settled empty. Never open
  // a loading diary with zero hits — the field spinner is enough.
  const showPreviewPanel =
    hasPreviewQuery && (previewHits.length > 0 || !previewSearching);
  const dropdownOpen = showPreviewPanel || showRecents || showFirstUse;

  const dropdownState: GlobalSearchDropdownState = showPreviewPanel
    ? previewHits.length === 0
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
      navigateSearchHref(router, hrefForPreviewHit(hit), pathname);
    },
    [router, pathname],
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
        else {
          el.blur();
          setFocused(false);
          setExpanded(false);
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
  }, [fieldOpen, query, handleClear, activeIndex, router]);

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
                scope: 'global',
                scopeHref: result.href,
                topHit: {
                  title: result.order.product_title || result.order.order_id || trimmed,
                  href: result.href,
                  entityType: 'order',
                },
              });
              navigateSearchHref(router, result.href, pathname);
              return;
            }
            onPushRecent?.({
              query: trimmed,
              scope: 'global',
              scopeHref: searchRerunHref(trimmed),
            });
            // Miss = dropdown only; the URL never changes.
            keepPreviewOpen();
          } finally {
            setResolvePending(false);
          }
        })();
        return;
      }

      // ── Single settled hit = the answer ──
      // One result is not a list worth reading; open the record (and its data)
      // rather than making the operator click the only row. Only once retrieval
      // has SETTLED — mid-flight the preview may legitimately hold one hit on
      // its way to several.
      {
        const preview = navRef.current.flatPreviewHits;
        if (!previewSearching && preview.length === 1) {
          onPushRecent?.({
            query: trimmed,
            scope: 'global',
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
      // Stay put — the dropdown shows hits or “No matches”; never navigate.
      onPushRecent?.({
        query: trimmed,
        scope: 'global',
        scopeHref: searchRerunHref(trimmed),
      });
      keepPreviewOpen();
    },
    [
      router,
      pathname,
      onPushRecent,
      activeIndex,
      navigateActive,
      queryClient,
      keepPreviewOpen,
      previewSearching,
      commitHit,
    ],
  );

  const handleFocusIn = () => {
    window.clearTimeout(blurTimerRef.current);
    holdHover();
    setExpanded(true);
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
    el.setAttribute('aria-controls', LISTBOX_ID);
    if (dropdownOpen && activeIndex >= 0) {
      el.setAttribute('aria-activedescendant', optionIdFor(LISTBOX_ID, activeIndex));
    } else {
      el.removeAttribute('aria-activedescendant');
    }
  }, [fieldOpen, dropdownOpen, activeIndex]);

  const field = (
    <div
      ref={anchorRef}
      className={cn(
        // Kinetic Ledger find cell — square, zero radius. Never a pill.
        // overflow-hidden so the absolute pending sweep stays inside the cell
        // (dropdown is portaled).
        'group/search relative flex items-center overflow-hidden rounded-none',
        // Fill the header beam top→bottom; vertical hairlines lock the cell
        // into the header geometry. Active focus = bottom rule (always
        // border-b-2 so focus doesn't grow the beam height). The pending sweep
        // replaces that rule — drop border-b while SearchPendingBar owns the
        // bottom edge.
        'h-full self-stretch border-x border-b-2 border-border-hairline bg-transparent',
        showPendingBar
          ? 'border-b-0'
          : focused
            ? 'border-b-border-strong'
            : 'border-b-transparent',
        GLOBAL_FIND_FIELD_WIDTH,
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
        // 0 = track keystrokes straight into `query`. The typeahead debounce
        // (0ms identifier / 80ms NL) lives in the fetch effect above.
        debounceMs={0}
        isSearching={previewSearching}
        tone="neutral"
        size="compact"
        hideUnderline
        autoFocus={expanded}
        className="min-w-0 flex-1 border-0 bg-transparent px-3"
      />

      {showPendingBar ? <SearchPendingBar /> : null}

      <GlobalSearchDropdown
        open={dropdownOpen}
        anchorRef={anchorRef}
        listboxId={LISTBOX_ID}
        optionId={(index) => optionIdFor(LISTBOX_ID, index)}
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
