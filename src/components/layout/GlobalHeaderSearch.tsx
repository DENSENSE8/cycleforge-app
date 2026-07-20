'use client';

/**
 * GlobalHeaderSearch — icon-rail search + separate AI entry for the global
 * header. Resting state matches sibling header IconButtons (search glyph only);
 * hover / focus / click / ⌘K expands a compact SearchField and focuses the
 * cursor. The Sparkles assistant control is a sibling IconButton — never nested
 * inside the search field.
 *
 * Combobox model (when expanded): the input carries role=combobox +
 * aria-activedescendant; the dropdown is the listbox. ↓/↑ move a virtual
 * activeIndex across the flattened visible options (recents, or [see-all,
 * ...preview hits]); Enter navigates the active option or falls through via
 * {@link globalSearchHandoffHref}; Esc clears then blurs; Preview row clicks
 * navigate via order-aware hrefs.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { IconButton, SearchField } from '@/design-system/primitives';
import { Search, Sparkles } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  GlobalSearchDropdown,
  type GlobalSearchDropdownState,
} from '@/components/search/GlobalSearchDropdown';
import {
  groupHitsForPreview,
  flattenPreviewGroups,
} from '@/components/search/search-tabs';
import { useAssistantDockControls } from '@/components/assistant/AssistantProvider';
import { useAiQuickJump } from '@/hooks/useAiQuickJump';
import { useSearchRecents } from '@/hooks/useSearchRecents';
import { GLOBAL_SEARCH_FOCUS_EVENT } from '@/lib/global-search-focus';
import { isUnifiedHeaderSearchEnabled } from '@/lib/search/unified-header-search';
import { recentRerunHref } from '@/lib/search/search-recents';
import { dashboardSearchRerunHref } from '@/components/dashboard/search/dashboard-search-recents';
import {
  globalSearchHandoffHref,
  journeyHandoffHref,
  orderSearchHref,
} from '@/lib/search/search-hit';
import type { AiSearchHit } from '@/lib/search/ai-search-client';
import { cn } from '@/utils/_cn';
import {
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_BTN_OPEN_CLASS,
  HEADER_ICON_GLYPH,
  HEADER_ICON_WRAP,
} from './header-shell';

/**
 * Preview / keyboard hit → domain deep-link (orders keep Search-mode map).
 * Journey Trace is secondary (row affordance / ⌘Enter), never the primary href.
 */
function hrefForPreviewHit(hit: AiSearchHit, query: string): string {
  if (hit.entityType === 'order') return orderSearchHref(hit.id, query);
  return hit.href;
}

/** Sync the field from surfaces that carry `?q=` in the URL. */
function readSyncedQuery(pathname: string | null): string | null {
  if (typeof window === 'undefined') return null;
  const sp = new URLSearchParams(window.location.search);
  if (pathname === '/dashboard' && sp.get('mode') === 'search') {
    return sp.get('q') ?? '';
  }
  if (pathname?.startsWith('/o')) {
    return sp.get('q');
  }
  return null;
}

/** Expanded search field width within the 420px header rail. */
const SEARCH_FIELD_WIDTH = 'w-[17.5rem]';
const LISTBOX_ID = 'global-search-listbox';
const optionId = (index: number) => `global-search-opt-${index}`;

export function GlobalHeaderSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const assistant = useAssistantDockControls();

  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [classicHits, setClassicHits] = useState<AiSearchHit[]>([]);
  const [classicSearching, setClassicSearching] = useState(false);

  // Unified header recents (docs/unified-global-search-consolidation-plan.md
  // Phase 0). Flag-gated: when off, nothing is recorded/migrated/shown, so the
  // header is byte-identical to today.
  const unifiedOn = isUnifiedHeaderSearchEnabled();
  const {
    recents,
    push: pushRecent,
    remove: removeRecent,
    clear: clearRecents,
  } = useSearchRecents({ migrateLegacy: unifiedOn, limit: 6 });

  const anchorRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimerRef = useRef<number>();
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const classicAbortRef = useRef<AbortController | null>(null);
  const classicDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const queryRef = useRef(query);
  queryRef.current = query;

  const trimmedQuery = query.trim();
  const hasValue = trimmedQuery.length > 0;
  const showPreview = expanded && focused && trimmedQuery.length >= 2;

  const aiQuickJump = useAiQuickJump(trimmedQuery, {
    pageContext: pathname,
    limit: 6,
    enabled: showPreview,
  });

  // Classic global-search fallback when AI retrieval is off.
  useEffect(() => {
    if (!showPreview || aiQuickJump.aiEnabled) {
      classicAbortRef.current?.abort();
      setClassicHits([]);
      setClassicSearching(false);
      return;
    }
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

  // Keep the field in sync when landing on Dashboard Search or /o Search mode.
  useEffect(() => {
    const synced = readSyncedQuery(pathname);
    if (synced != null) {
      setQuery(synced);
      if (synced.trim()) setExpanded(true);
    }
  }, [pathname]);

  useEffect(() => {
    if (hasValue) setExpanded(true);
  }, [hasValue]);

  useEffect(() => {
    return () => {
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    };
  }, []);

  const clearCollapseTimer = useCallback(() => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
  }, []);

  const tryCollapse = useCallback(() => {
    const root = rootRef.current;
    if (root?.contains(document.activeElement)) return;
    if (queryRef.current.trim()) return;
    setExpanded(false);
    setFocused(false);
  }, []);

  const scheduleCollapse = useCallback(() => {
    clearCollapseTimer();
    collapseTimerRef.current = setTimeout(tryCollapse, 160);
  }, [clearCollapseTimer, tryCollapse]);

  const expandAndFocus = useCallback(() => {
    clearCollapseTimer();
    setExpanded(true);
    setFocused(true);
    // Focus after mount when expanding from the collapsed icon.
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      if (document.activeElement === el) el.select();
    });
  }, [clearCollapseTimer]);

  const handleFocusRequest = useCallback(() => {
    expandAndFocus();
  }, [expandAndFocus]);

  const handleChange = useCallback((next: string) => {
    setQuery(next);
  }, []);

  const handleClear = useCallback(() => {
    setQuery('');
    window.clearTimeout(blurTimerRef.current);
    setFocused(true);
    setExpanded(true);
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    window.addEventListener(GLOBAL_SEARCH_FOCUS_EVENT, handleFocusRequest);
    return () => window.removeEventListener(GLOBAL_SEARCH_FOCUS_EVENT, handleFocusRequest);
  }, [handleFocusRequest]);

  // ── Preview grouping + flattened option model (for keyboard nav) ──────────
  const previewHits = aiQuickJump.aiEnabled ? aiQuickJump.hits : classicHits;
  const previewSearching = aiQuickJump.aiEnabled ? aiQuickJump.searching : classicSearching;
  const previewGroups = useMemo(() => groupHitsForPreview(previewHits), [previewHits]);
  const flatPreviewHits = useMemo(() => flattenPreviewGroups(previewGroups), [previewGroups]);

  // Enter / See all → order workbench or Dashboard Search mode.
  const openSearchPage = useCallback(() => {
    if (!trimmedQuery) return;
    router.push(globalSearchHandoffHref(trimmedQuery, previewHits));
    setFocused(false);
  }, [router, trimmedQuery, previewHits]);

  const emptyQuery = trimmedQuery.length === 0;
  const showRecents = unifiedOn && expanded && focused && emptyQuery && recents.length > 0;
  const showFirstUse = unifiedOn && expanded && focused && emptyQuery && recents.length === 0;
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

  // Options that ↓/↑ walk (see-all is option 0 in preview).
  const optionCount =
    dropdownState === 'recents'
      ? recents.length
      : dropdownState === 'preview'
        ? flatPreviewHits.length + 1
        : 0;

  // Fresh nav snapshot for the (stable) keydown handler.
  const navRef = useRef({ dropdownOpen, dropdownState, optionCount, recents, flatPreviewHits });
  navRef.current = { dropdownOpen, dropdownState, optionCount, recents, flatPreviewHits };

  // Reset the highlight whenever the query or the open state changes.
  useEffect(() => {
    setActiveIndex(-1);
  }, [trimmedQuery, dropdownOpen]);

  const navigateActive = useCallback((): boolean => {
    const { dropdownState: st, recents: rec, flatPreviewHits: hits } = navRef.current;
    setFocused(false);
    if (st === 'recents') {
      const entry = rec[activeIndex];
      if (!entry) return false;
      router.push(recentRerunHref(entry));
      return true;
    }
    if (st === 'preview') {
      if (activeIndex === 0) {
        openSearchPage();
        return true;
      }
      const hit = hits[activeIndex - 1];
      if (!hit) return false;
      router.push(hrefForPreviewHit(hit, trimmedQuery));
      return true;
    }
    return false;
  }, [activeIndex, router, openSearchPage, trimmedQuery]);

  // Arrow/Escape keyboard nav on the input (SearchField owns Enter → onSearch).
  useEffect(() => {
    if (!expanded) return;
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
      // ⌘/Ctrl+Enter on a highlighted preview hit → Open journey (secondary).
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
  }, [expanded, query, handleClear, activeIndex, router]);

  const handleSearchSubmit = useCallback(
    (raw: string) => {
      // A highlighted option wins over the handoff fallback.
      if (navRef.current.dropdownOpen && activeIndex >= 0 && navigateActive()) return;
      const trimmed = raw.trim();
      if (!trimmed) return;
      const href = globalSearchHandoffHref(trimmed, navRef.current.flatPreviewHits);
      if (unifiedOn) {
        const top = navRef.current.flatPreviewHits.find((h) => h.entityType === 'order');
        pushRecent({
          query: trimmed,
          scope: 'global',
          scopeHref: href.startsWith('/o/') ? href : dashboardSearchRerunHref(trimmed),
          topHit: top
            ? { title: top.title, href: orderSearchHref(top.id, trimmed), entityType: 'order' }
            : undefined,
        });
      }
      router.push(href);
      setFocused(false);
    },
    [router, unifiedOn, pushRecent, activeIndex, navigateActive],
  );

  const handleFocusIn = () => {
    window.clearTimeout(blurTimerRef.current);
    clearCollapseTimer();
    setExpanded(true);
    setFocused(true);
  };

  const handleFocusOut = () => {
    blurTimerRef.current = window.setTimeout(() => {
      setFocused(false);
      tryCollapse();
    }, 160);
  };

  // Combobox ARIA on the input (SearchField doesn't forward these props).
  useEffect(() => {
    if (!expanded) return;
    const el = inputRef.current;
    if (!el) return;
    el.setAttribute('role', 'combobox');
    el.setAttribute('aria-autocomplete', 'list');
    el.setAttribute('aria-expanded', String(dropdownOpen));
    el.setAttribute('aria-controls', LISTBOX_ID);
    if (dropdownOpen && activeIndex >= 0) el.setAttribute('aria-activedescendant', optionId(activeIndex));
    else el.removeAttribute('aria-activedescendant');
  }, [expanded, dropdownOpen, activeIndex]);

  const openAssistant = () => {
    const next = !assistant.open;
    assistant.setOpen(next);
    if (!next) return;
    if (trimmedQuery) {
      // Pre-fill only — operator reviews before send (exact-data handoff).
      assistant.seedComposer(trimmedQuery, { autoSend: false });
    } else {
      assistant.focusComposer();
    }
  };

  return (
    <div ref={rootRef} className="contents">
      {!expanded ? (
        <div
          className={HEADER_ICON_WRAP}
          onMouseEnter={expandAndFocus}
          onFocusCapture={expandAndFocus}
        >
          <HoverTooltip label="Search (⌘K)" asChild>
            <IconButton
              type="button"
              size="md"
              ariaLabel="Search"
              aria-expanded={false}
              onClick={expandAndFocus}
              className={HEADER_ICON_BTN_CLASS}
              icon={<Search className={HEADER_ICON_GLYPH} />}
            />
          </HoverTooltip>
        </div>
      ) : (
        <div
          ref={anchorRef}
          className={cn(
            'group/search relative flex h-8 items-center overflow-visible rounded-full border border-border-default bg-surface-canvas',
            SEARCH_FIELD_WIDTH,
          )}
          onMouseEnter={clearCollapseTimer}
          onMouseLeave={scheduleCollapse}
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
            autoFocus
            className="min-w-0 flex-1 border-0 px-2.5"
          />

          <GlobalSearchDropdown
            open={dropdownOpen}
            anchorRef={anchorRef}
            listboxId={LISTBOX_ID}
            optionId={optionId}
            activeIndex={activeIndex}
            state={dropdownState}
            query={trimmedQuery}
            recents={recents}
            previewGroups={previewGroups}
            onClose={() => setFocused(false)}
            onSeeAll={openSearchPage}
            onSelectRecent={(entry) => {
              handleChange(entry.query);
              setFocused(false);
              router.push(recentRerunHref(entry));
            }}
            onRemoveRecent={removeRecent}
            onClearRecents={() => clearRecents()}
            onNavigateHit={(hit, event) => {
              event.preventDefault();
              setFocused(false);
              router.push(hrefForPreviewHit(hit, trimmedQuery));
            }}
          />
        </div>
      )}

      {assistant.enabled ? (
        <div className={HEADER_ICON_WRAP}>
          <HoverTooltip
            label={assistant.open ? 'Close assistant (⌘J)' : 'Open assistant (⌘J)'}
            asChild
          >
            <IconButton
              type="button"
              size="md"
              ariaLabel={assistant.open ? 'Close assistant' : 'Open assistant'}
              aria-expanded={assistant.open}
              onClick={openAssistant}
              className={cn(
                HEADER_ICON_BTN_CLASS,
                assistant.open && cn(HEADER_ICON_BTN_OPEN_CLASS, 'text-blue-600'),
              )}
              icon={<Sparkles className={HEADER_ICON_GLYPH} />}
            />
          </HoverTooltip>
        </div>
      ) : null}
    </div>
  );
}
