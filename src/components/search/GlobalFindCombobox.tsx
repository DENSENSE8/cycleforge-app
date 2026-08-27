'use client';

/**
 * GlobalFindCombobox — the find field + WAI-ARIA combobox for the global
 * header. One presentation, one mount ({@link GlobalHeaderSearch}).
 *
 * Presentation:
 *   • Off `/search` — magnifying-glass icon at rest. The 24rem field paints
 *     only while find is open (focus, a typed query, or the search-by picker).
 *   • On `/search` (and `/search/…`) — the field stays expanded so the page
 *     that *is* find does not hide its own surface behind an icon.
 *
 * Enter / paste contract (number / identifier find):
 *   • Pulse {@link SearchPendingBar} while {@link commitIdentifierFind} runs.
 *   • Hit → seed resolve cache → navigate to `/search?sel=…` only.
 *   • Miss → “No matches” dropdown on the current page (URL unchanged).
 *   • Never open `/search?q=` or auto-commit a preview “best hit” on Enter.
 * Explicit arrow+Enter / click still opens a highlighted preview row.
 *
 * The leading search glyph is always a button that opens the search-by
 * picker (Internal ID · order · tracking · serial · ticket), including when
 * the field already has a query or a method chip would previously have
 * replaced it.
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
import { FIELD_ACTION_GLYPH_CLASS } from '@/design-system/primitives/field-action';
import { Hash, MapPin, ScanBarcode, Search, Ticket } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_WRAP,
  TOP_CHROME_ICON_FACE,
} from '@/components/layout/header-shell';
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
import { useFindFieldScan } from '@/hooks/useFindFieldScan';
import { decodedHandle } from '@/lib/barcode-routing';
import { desktopSearchHref, searchPageHrefForScanRoute } from '@/lib/search/internal-id';
import {
  SEARCH_BY_METHOD_LABEL,
  filterHitsBySearchBy,
  headerFindEmptyMessage,
  headerFindSearchAxis,
  searchByPickerCount,
  searchByPickerScope,
  searchByPlaceholder,
  type SearchByScope,
} from '@/lib/search/search-by';
/** Leading find-field glyph — search by default, method icon once scoped. */
const SEARCH_BY_LEADING_ICON: Record<SearchByScope, typeof Hash> = {
  internal: Search,
  order: Hash,
  tracking: MapPin,
  serial: ScanBarcode,
  ticket: Ticket,
};

/** Open find-cell width — shrink-0 so header siblings cannot crush it. */
const GLOBAL_FIND_FIELD_WIDTH = 'w-[24rem] shrink-0';

/** Preview typeahead wait — 0 so hits paint with the keystroke (identifiers and NL). */
const NL_DEBOUNCE_MS = 0;

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
  const dest = desktopSearchHref(href);
  if (pathname === '/dashboard' && dest.startsWith('/dashboard')) {
    router.replace(dest);
    return;
  }
  router.push(dest);
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
  const [focused, setFocused] = useState(false);
  const [hoverHeld, setHoverHeld] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [previewHits, setPreviewHits] = useState<AiSearchHit[]>([]);
  const [previewSearching, setPreviewSearching] = useState(false);
  const [resolvePending, setResolvePending] = useState(false);
  const [axisScope, setAxisScope] = useState<SearchByScope>('internal');
  const [methodChosen, setMethodChosen] = useState(false);
  const [methodsPickerOpen, setMethodsPickerOpen] = useState(false);
  const showPendingBar = pending || resolvePending;

  const anchorRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimerRef = useRef<number>();
  const hoverLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  const trimmedQuery = query.trim();
  const previewAxis = headerFindSearchAxis(methodChosen, axisScope, trimmedQuery);
  // Identifiers (serials, tracking, order #) get the same preview dropdown as
  // free text — hits or “No matches…”. Enter still prefers resolveSearchOrder
  // for order/tracking fast-open; miss re-focuses so this dropdown stays open.
  const hasPreviewQuery = focused && trimmedQuery.length >= 2;

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
    const isIdentifier = looksLikeIdentifier(trimmedQuery);
    const waitMs = isIdentifier ? 0 : NL_DEBOUNCE_MS;
    searchDebounceRef.current = setTimeout(async () => {
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;
      try {
        const axisQs = previewAxis ? `&axis=${encodeURIComponent(previewAxis)}` : '';
        const res = await fetch(
          `/api/global-search?q=${encodeURIComponent(trimmedQuery)}&limit=6${axisQs}`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error('Search failed');
        const data = await res.json();
        if (!controller.signal.aborted) {
          const rows = (data.rows ?? []) as AiSearchHit[];
          const filtered = previewAxis ? filterHitsBySearchBy(rows, previewAxis) : rows;
          setPreviewHits(filtered);
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
  }, [trimmedQuery, hasPreviewQuery, axisScope, methodChosen]);

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

  // Adopt URL seed on route change. A non-empty `?q=` keeps the bar open;
  // an empty seed returns to the icon without stealing focus.
  useEffect(() => {
    setQuery(initialQuery);
    setAxisScope('internal');
    setMethodChosen(false);
    setMethodsPickerOpen(false);
    if (!initialQuery.trim()) setFocused(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync seed / route rest
  }, [initialQuery, pathname]);

  useEffect(() => {
    return () => {
      if (hoverLeaveTimerRef.current) clearTimeout(hoverLeaveTimerRef.current);
    };
  }, []);

  const clearHoverLeaveTimer = useCallback(() => {
    if (hoverLeaveTimerRef.current) {
      clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = null;
    }
  }, []);

  const holdHover = useCallback(() => {
    clearHoverLeaveTimer();
    setHoverHeld(true);
  }, [clearHoverLeaveTimer]);

  const releaseHoverSoon = useCallback(() => {
    clearHoverLeaveTimer();
    hoverLeaveTimerRef.current = setTimeout(() => {
      hoverLeaveTimerRef.current = null;
      setHoverHeld(false);
    }, 160);
  }, [clearHoverLeaveTimer]);

  const focusField = useCallback(() => {
    setFocused(true);
    const aim = () => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      if (document.activeElement === el) el.select();
    };
    requestAnimationFrame(() => {
      if (inputRef.current) aim();
      else requestAnimationFrame(aim);
    });
  }, []);

  // Sole find surface, so this listener is unconditional — `ownsFocusEvent`
  // existed to arbitrate with the `/search` stage field, which is gone.
  useEffect(() => {
    const handleFocusRequest = () => focusField();
    window.addEventListener(GLOBAL_SEARCH_FOCUS_EVENT, handleFocusRequest);
    return () => window.removeEventListener(GLOBAL_SEARCH_FOCUS_EVENT, handleFocusRequest);
  }, [focusField]);

  const handleChange = useCallback(
    (next: string) => {
      setQuery(next);
      setMethodsPickerOpen(false);
    },
    [setQuery],
  );

  const handleClear = useCallback(() => {
    setQuery('');
    window.clearTimeout(blurTimerRef.current);
    setFocused(true);
    inputRef.current?.focus();
  }, [setQuery]);

  const previewGroups = useMemo(() => groupHitsForPreview(previewHits), [previewHits]);
  const flatPreviewHits = useMemo(() => flattenPreviewGroups(previewGroups), [previewGroups]);

  const keepPreviewOpen = useCallback(() => {
    window.clearTimeout(blurTimerRef.current);
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
  const onSearchPage =
    pathname === '/search' || Boolean(pathname?.startsWith('/search/'));
  // Search page owns find — keep the field painted even with an empty query
  // and no focus. Everywhere else the beam stays an icon until the operator
  // opens it.
  const fieldOpen =
    onSearchPage || focused || methodsPickerOpen || !emptyQuery;
  const showMethods =
    methodsPickerOpen || (emptyQuery && !methodChosen && (focused || hoverHeld));
  const showRecents =
    enableRecents && emptyQuery && methodChosen && recents.length > 0 && (focused || hoverHeld);
  const showFirstUse =
    enableRecents && emptyQuery && methodChosen && recents.length === 0 && (focused || hoverHeld);
  // Open preview when there are hits, or when search settled empty. Never open
  // a loading diary with zero hits — the field spinner is enough.
  const showPreviewPanel =
    hasPreviewQuery && (previewHits.length > 0 || !previewSearching);
  const dropdownOpen = showPreviewPanel || showRecents || showFirstUse || showMethods;

  const dropdownState: GlobalSearchDropdownState = showMethods
    ? 'methods'
    : showPreviewPanel
    ? previewHits.length === 0
      ? 'empty'
      : 'preview'
    : showRecents
      ? 'recents'
      : 'first-use';

  const optionCount =
    dropdownState === 'methods'
      ? searchByPickerCount()
      : dropdownState === 'recents'
        ? recents.length
        : dropdownState === 'preview'
          ? flatPreviewHits.length
          : 0;

  const navRef = useRef({ dropdownOpen, dropdownState, optionCount, recents, flatPreviewHits });
  navRef.current = { dropdownOpen, dropdownState, optionCount, recents, flatPreviewHits };

  const pickSearchBy = useCallback((scope: SearchByScope) => {
    setAxisScope(scope);
    setMethodChosen(true);
    setMethodsPickerOpen(false);
    window.clearTimeout(blurTimerRef.current);
    setFocused(true);
    inputRef.current?.focus();
  }, []);

  const openSearchByPicker = useCallback(() => {
    window.clearTimeout(blurTimerRef.current);
    holdHover();
    setMethodsPickerOpen(true);
    setFocused(true);
    inputRef.current?.focus();
  }, [holdHover]);

  const clearSearchBy = useCallback(() => {
    setAxisScope('internal');
    setMethodChosen(false);
    setMethodsPickerOpen(false);
    window.clearTimeout(blurTimerRef.current);
    setFocused(true);
    inputRef.current?.focus();
  }, []);

  const openPrintedHandle = useCallback(
    (redirect: string) => {
      setFocused(false);
      navigateSearchHref(router, redirect, pathname);
    },
    [router, pathname],
  );

  // Same decode as the station scan bar, but the destination is `/search?sel=`
  // (header find contract) — never the Digital Link `/m/` page.
  useFindFieldScan(inputRef, {
    enabled: true,
    onHandle: (route) => {
      const dest = searchPageHrefForScanRoute(route);
      if (!dest) return false;
      openPrintedHandle(dest);
      return true;
    },
  });

  useEffect(() => {
    setActiveIndex(dropdownState === 'methods' ? 0 : -1);
  }, [trimmedQuery, dropdownOpen, dropdownState]);

  const commitHit = useCallback(
    (hit: AiSearchHit) => {
      setFocused(false);
      navigateSearchHref(router, hrefForPreviewHit(hit), pathname);
    },
    [router, pathname],
  );

  // Sole settled hit → open the record. One answer is not a list worth reading.
  // Keyed so a return trip to the same query does not re-fire in a loop.
  // Identifier / order-number finds stay in the dropdown (Ecwid 4989 must
  // paint as a row; a miss must paint “No order number found”) — never a
  // silent page switch to a different marketplace id.
  const soleCommittedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focused || previewSearching) return;
    if (looksLikeIdentifier(trimmedQuery) || previewAxis === 'order') {
      soleCommittedKeyRef.current = null;
      return;
    }
    if (flatPreviewHits.length !== 1) {
      soleCommittedKeyRef.current = null;
      return;
    }
    const hit = flatPreviewHits[0];
    const key = `${trimmedQuery}\0${hit.entityType}:${hit.id}`;
    if (soleCommittedKeyRef.current === key) return;
    soleCommittedKeyRef.current = key;
    onPushRecent?.({
      query: trimmedQuery,
      scope: 'global',
      scopeHref: hrefForPreviewHit(hit),
      topHit: {
        title: hit.title,
        href: hrefForPreviewHit(hit),
        entityType: hit.entityType,
      },
    });
    commitHit(hit);
  }, [
    focused,
    previewSearching,
    flatPreviewHits,
    trimmedQuery,
    commitHit,
    onPushRecent,
    previewAxis,
  ]);

  const navigateActive = useCallback((): boolean => {
    const { dropdownState: st, recents: rec, flatPreviewHits: hits } = navRef.current;
    if (st === 'methods') {
      const scope = searchByPickerScope(activeIndex);
      if (!scope) return false;
      pickSearchBy(scope);
      return true;
    }
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
  }, [activeIndex, pickSearchBy, rerunRecentInField, commitHit]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // Empty field + a chosen method: Backspace pops the chip and returns
      // the search-by picker (worktree: backspace at the scope chip's edge).
      if (e.key === 'Backspace' && methodChosen) {
        const input = inputRef.current;
        const empty = !(input?.value.trim());
        const atStart = Boolean(
          input && input.selectionStart === 0 && input.selectionEnd === 0,
        );
        if (empty && atStart) {
          e.preventDefault();
          clearSearchBy();
          return;
        }
      }
      if (e.key === 'Escape') {
        if (query.trim()) handleClear();
        else {
          el.blur();
          setFocused(false);
          setMethodsPickerOpen(false);
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
        navigateSearchHref(router, journey, pathname);
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
  }, [query, handleClear, activeIndex, router, pathname, methodChosen, clearSearchBy]);

  const handleSearchSubmit = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();

      // Printed QR / R-id — same decode as the station scan bar, but open the
      // search record (`/search?sel=…`), never `/m/`. Must run BEFORE the
      // methods-highlight commit: a paste into the empty field still has the
      // picker open in this render.
      const printed = trimmed ? decodedHandle(trimmed) : null;
      const handleHref = printed ? searchPageHrefForScanRoute(printed) : null;
      if (handleHref) {
        openPrintedHandle(handleHref);
        return;
      }

      // Explicit keyboard highlight → commit that row (recent re-run or preview hit).
      if (navRef.current.dropdownOpen && activeIndex >= 0 && navigateActive()) return;
      if (!trimmed) return;

      // ── Identifier (order # / tracking / serial): pulse → hit or miss dropdown ──
      // Internal ID (explicit chip) never uses the order resolver — a bare
      // number is a shipment / R-id / unit PK. Unscoped typing is order #.
      // Miss and hit both stay on this page until the operator picks a row
      // (arrow+Enter / click). Auto-opening the lookup result was a page
      // switch — Ecwid 4989 never painted in the dropdown.
      if (previewAxis !== 'internal' && looksLikeIdentifier(trimmed)) {
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
              keepPreviewOpen();
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
      openPrintedHandle,
      previewAxis,
    ],
  );

  const handleFocusIn = () => {
    window.clearTimeout(blurTimerRef.current);
    holdHover();
    setFocused(true);
  };

  const handleFocusOut = () => {
    blurTimerRef.current = window.setTimeout(() => {
      setFocused(false);
      setHoverHeld(false);
      setMethodsPickerOpen(false);
    }, 160);
  };

  useEffect(() => {
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
  }, [dropdownOpen, activeIndex]);

  const LeadingTypeIcon = SEARCH_BY_LEADING_ICON[axisScope];

  if (!fieldOpen) {
    return (
      <div
        ref={rootRef}
        className={cn(HEADER_ICON_WRAP, className)}
        data-testid="global-find-field"
        data-find-collapsed=""
      >
        <HoverTooltip label="Search" asChild>
          <IconButton
            size="md"
            ariaLabel="Search"
            className={HEADER_ICON_BTN_CLASS}
            icon={<Search className={TOP_CHROME_ICON_FACE} aria-hidden />}
            onClick={focusField}
          />
        </HoverTooltip>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="contents">
      <div
        ref={anchorRef}
        data-testid="global-find-field"
        data-find-expanded=""
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
          placeholder={searchByPlaceholder(axisScope)}
          // 0 = track keystrokes straight into `query`. The typeahead debounce
          // (0ms identifier / 80ms NL) lives in the fetch effect above.
          debounceMs={0}
          isSearching={previewSearching}
          tone="neutral"
          size="compact"
          hideUnderline
          leadingIcon={<LeadingTypeIcon className={FIELD_ACTION_GLYPH_CLASS} aria-hidden />}
          onLeadingAction={openSearchByPicker}
          leadingActionLabel={`Search by ${SEARCH_BY_METHOD_LABEL[axisScope]} — click to change`}
          leadingActionExpanded={showMethods}
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
          emptyMessage={headerFindEmptyMessage(trimmedQuery, previewAxis)}
          recents={recents}
          previewGroups={previewGroups}
          onClose={() => {
            // Outside-click / Escape must drop BOTH gates — `showMethods` /
            // recents stay open while either `focused` or `hoverHeld` is true, so
            // clearing only focus left the panel up for the hover-leave delay
            // (and forever if mouseleave never fired).
            setFocused(false);
            setHoverHeld(false);
            setMethodsPickerOpen(false);
          }}
          onHoverStart={holdHover}
          onHoverEnd={() => {
            releaseHoverSoon();
          }}
          searchByScope={axisScope}
          onSelectSearchBy={pickSearchBy}
          onSelectRecent={rerunRecentInField}
          onRemoveRecent={onRemoveRecent}
          onClearRecents={() => onClearRecents()}
          onNavigateHit={(hit, event: ReactMouseEvent) => {
            event.preventDefault();
            commitHit(hit);
          }}
        />
      </div>
    </div>
  );
}
