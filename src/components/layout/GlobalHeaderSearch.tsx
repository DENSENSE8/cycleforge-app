'use client';

/**
 * GlobalHeaderSearch — the header's always-typable search field + its
 * dropdown (WAI-ARIA combobox). Always global: recents ⇄ rich preview,
 * keyboard-navigable. Page-scoped lookup goes through the AI assistant
 * (Sparkles), not a contextual header takeover.
 *
 * Combobox model: the input carries role=combobox + aria-activedescendant; the
 * dropdown is the listbox. ↓/↑ move a virtual activeIndex across the flattened
 * visible options (recents, or [see-all, ...preview hits]); Enter navigates the
 * active option or falls through via {@link globalSearchHandoffHref} (order
 * lookups → `/o?mode=search` directly; cross-entity → Dashboard Search mode);
 * Esc clears then blurs; ⌘K focuses. Preview row clicks navigate via
 * order-aware hrefs.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { SearchField } from '@/design-system/primitives';
import { Sparkles, Clipboard } from '@/components/Icons';
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

/**
 * Preview / keyboard hit → domain deep-link (orders keep Search-mode map).
 * Journey Trace is secondary (row affordance / ⌘Enter), never the primary href.
 */
function hrefForPreviewHit(hit: AiSearchHit, query: string): string {
  if (hit.entityType === 'order') return orderSearchHref(hit.id, query);
  return hit.href;
}

/** Sync the pill from surfaces that carry `?q=` in the URL. */
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

/** Search pill width within the 420px header rail (icons occupy the rest). */
const SEARCH_FIELD_WIDTH = 'max-w-[17.5rem] min-w-0 flex-1';
const LISTBOX_ID = 'global-search-listbox';
const optionId = (index: number) => `global-search-opt-${index}`;

export function GlobalHeaderSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const assistant = useAssistantDockControls();

  const [query, setQuery] = useState('');
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
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimerRef = useRef<number>();
  const classicAbortRef = useRef<AbortController | null>(null);
  const classicDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  const trimmedQuery = query.trim();
  const showPreview = focused && trimmedQuery.length >= 2;

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

  // Keep the pill in sync when landing on Dashboard Search or /o Search mode.
  useEffect(() => {
    const synced = readSyncedQuery(pathname);
    if (synced != null) setQuery(synced);
  }, [pathname]);

  const handleFocusRequest = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    setFocused(true);
    if (document.activeElement === el) {
      el.select();
    }
  }, []);

  const handleChange = useCallback((next: string) => {
    setQuery(next);
  }, []);

  const handleClear = useCallback(() => {
    setQuery('');
    window.clearTimeout(blurTimerRef.current);
    setFocused(true);
    inputRef.current?.focus();
  }, []);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      const trimmed = text.trim();
      if (!trimmed) return;
      handleChange(trimmed);
      inputRef.current?.focus();
    } catch {
      // clipboard blocked
    }
  }, [handleChange]);

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
  const showRecents = unifiedOn && focused && emptyQuery && recents.length > 0;
  const showFirstUse = unifiedOn && focused && emptyQuery && recents.length === 0;
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
    const el = inputRef.current;
    if (!el) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (query.trim()) handleClear();
        else {
          el.blur();
          setFocused(false);
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
  }, [query, handleClear, activeIndex, router]);

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
    setFocused(true);
  };

  const handleFocusOut = () => {
    blurTimerRef.current = window.setTimeout(() => setFocused(false), 160);
  };

  // Combobox ARIA on the input (SearchField doesn't forward these props).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.setAttribute('role', 'combobox');
    el.setAttribute('aria-autocomplete', 'list');
    el.setAttribute('aria-expanded', String(dropdownOpen));
    el.setAttribute('aria-controls', LISTBOX_ID);
    if (dropdownOpen && activeIndex >= 0) el.setAttribute('aria-activedescendant', optionId(activeIndex));
    else el.removeAttribute('aria-activedescendant');
  }, [dropdownOpen, activeIndex]);

  const showShortcutHint = !focused && !trimmedQuery;

  return (
    <div
      ref={anchorRef}
      className={cn(
        'group/search relative flex h-8 items-center overflow-visible rounded-full border border-border-default bg-surface-canvas',
        SEARCH_FIELD_WIDTH,
      )}
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
        customTrailingSlot={showShortcutHint ? null : undefined}
        className={cn('min-w-0 flex-1 border-0 pl-2.5', assistant.enabled ? 'pr-0' : 'pr-2.5')}
        trailingPrefix={
          showShortcutHint ? (
            <span className="relative hidden h-4 min-w-[1.75rem] shrink-0 sm:inline-flex">
              <kbd className="absolute inset-0 flex items-center justify-center rounded border border-border-hairline bg-surface-card px-1 text-role-micro font-semibold leading-none text-text-faint transition-opacity duration-100 group-hover/search:pointer-events-none group-hover/search:opacity-0">
                ⌘K
              </kbd>
              <HoverTooltip label="Paste from clipboard" asChild>
                <button
                  type="button"
                  onClick={handlePaste}
                  aria-label="Paste from clipboard"
                  className="absolute inset-0 inline-flex items-center justify-center text-text-faint opacity-0 transition-opacity duration-100 hover:text-blue-600 group-hover/search:opacity-100 active:scale-95"
                >
                  <Clipboard className="h-4 w-4" />
                </button>
              </HoverTooltip>
            </span>
          ) : undefined
        }
        trailingSuffix={
          assistant.enabled ? (
            <>
              <span aria-hidden className="h-4 w-px shrink-0 bg-border-hairline" />
              <HoverTooltip
                label={assistant.open ? 'Close assistant (⌘J)' : 'Open assistant (⌘J)'}
                asChild
              >
                {/* ds-raw-button: AI entry on the right edge of the search pill */}
                <button
                  type="button"
                  onClick={() => {
                    const next = !assistant.open;
                    assistant.setOpen(next);
                    if (!next) return;
                    if (trimmedQuery) {
                      // Pre-fill only — operator reviews before send (exact-data handoff).
                      assistant.seedComposer(trimmedQuery, { autoSend: false });
                    } else {
                      assistant.focusComposer();
                    }
                  }}
                  aria-label={assistant.open ? 'Close assistant' : 'Open assistant'}
                  aria-expanded={assistant.open}
                  className={cn(
                    'inline-flex h-8 w-8 shrink-0 items-center justify-center text-text-faint transition-colors duration-100 hover:bg-surface-sunken hover:text-blue-600 active:scale-95',
                    assistant.open && 'bg-blue-50 text-blue-600',
                  )}
                >
                  <Sparkles className="h-4 w-4" />
                </button>
              </HoverTooltip>
            </>
          ) : undefined
        }
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
  );
}
