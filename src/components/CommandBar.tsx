'use client';

/** CommandBar — centered ⌘K find palette. */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Clock,
  Box,
  ChevronRight,
  Plus,
  Search,
} from '@/components/Icons';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { SearchResultRow } from '@/components/search/SearchResultRow';
import { groupHitsForPreview, previewEntityLabel } from '@/components/search/search-tabs';
import { runNavIntent } from '@/lib/nav/intents';
import { CommandBarPageMap } from '@/components/CommandBarPageMap';
import {
  COMMAND_BAR_OPEN_CHANGE_EVENT,
  COMMAND_BAR_OPEN_EVENT,
} from '@/lib/app-events';
import { GLOBAL_SEARCH_FOCUS_EVENT } from '@/lib/global-search-focus';
import {
  setGlobalHeaderSearchDraft,
  clearGlobalHeaderSearchDraft,
} from '@/lib/global-header-search-query';
import { useFindFieldScan } from '@/hooks/useFindFieldScan';
import { cn } from '@/utils/_cn';
import { usePlatformMeta } from '@/hooks/useCatalog';
import { useAuth } from '@/contexts/AuthContext';
import { buildCommandBarNavGroups, filterCommandBarNavGroups } from '@/lib/nav/command-bar-nav-groups';
import { platformMetaBrandDot } from '@/lib/source-platform';
import {
  CHIP_TONE_CLASSES,
  ENTITY_TONE,
  entityGlyph,
  searchMethodTone,
} from '@/components/search/search-result-chips';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { IdentifierToggle } from '@/components/ui/IdentifierToggle';
import { decodedHandle, type ScanRoute } from '@/lib/barcode-routing';
import {
  directOpenForTypedHandle,
  searchPageHrefForScanRoute,
} from '@/lib/search/internal-id';
import { looksLikeIdentifier } from '@/lib/search/search-hit';
import {
  hrefForPreviewHit,
} from '@/lib/search/commit-identifier-find';
import {
  headerFindEmptyMessage,
  searchByPlaceholder,
  searchByShortcut,
  SEARCH_BY_METHOD_LABEL,
  SEARCH_BY_SCOPES,
  type SearchByScope,
} from '@/lib/search/search-by';
import type { AiSearchHit } from '@/lib/search/ai-search-client';

interface RecentItem {
  id: string;
  label: string;
  subtitle?: string;
  href?: string;
  entityType?: string;
  /** Stored `source_platform` for the record this recent points at. */
  platform?: string | null;
}

interface SearchResultChip {
  label: string;
  tone?: string;
}

interface SearchResult {
  id: number;
  entityType: string;
  title: string;
  subtitle: string;
  href: string;
  score?: number;
  chips?: SearchResultChip[];
  facets?: Record<string, string | null>;
}


const RECENT_KEY = 'command-bar-recent';
/** How many hits the palette fetches AND shows. */
const PALETTE_LIMIT = 12;
const MAX_RECENT = 6;

function getRecent(): RecentItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecent(item: RecentItem): RecentItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const existing = getRecent().filter((r) => r.id !== item.id);
    const updated = [item, ...existing].slice(0, MAX_RECENT);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

function toAiSearchHit(r: SearchResult): AiSearchHit {
  return {
    id: r.id,
    entityType: r.entityType as AiSearchHit['entityType'],
    title: r.title,
    subtitle: r.subtitle,
    href: r.href,
    matchField: 'title',
    score: r.score ?? 0,
    chips: r.chips,
    facets: r.facets,
  };
}

/** Row copy for a typed printed handle that opens outside `/search`. */
function directOpenLabel(route: ScanRoute): string {
  switch (route.type) {
    case 'receiving-line':
      return `Open line ${route.value}`;
    case 'support-ticket':
      return `Open ${route.value} in Support`;
    case 'bin':
      return `Open location ${route.value}`;
    case 'serial-unit':
      return `Open serial ${route.value}`;
    default:
      return `Open ${route.value}`;
  }
}

/**
 * The unscoped fan-out, as a toggle value. `IdentifierToggle` is generic over a
 * string enum and has no concept of "nothing selected", so All is a real option
 * here and `null` on the wire.
 */
const ALL_SCOPE = 'all';

/** Method options, labels straight from the search-by registry. */
const SCOPE_OPTIONS = [
  { value: ALL_SCOPE, label: 'All' },
  ...SEARCH_BY_SCOPES.map((scope) => ({
    value: scope as string,
    label: SEARCH_BY_METHOD_LABEL[scope],
    tone: searchMethodTone(scope),
  })),
];

/** A facet pill's count — lighter than its label, fixed-width digits. */
function FacetCount({ count }: { count: number }) {
  return <span className="tabular-nums text-text-faint">{count}</span>;
}

function dispatchOpenChange(open: boolean) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(COMMAND_BAR_OPEN_CHANGE_EVENT, { detail: { open } }),
  );
}

export function CommandBar() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [recents, setRecents] = useState<RecentItem[]>([]);
  /** Explicit search axis. `null` = unscoped fan-out, which stays the default:
   *  picking a scope is an affordance, never a thing the operator must do. */
  const [axis, setAxis] = useState<SearchByScope | null>(null);
  /** Client-side entity-type facet. Filters rows already on screen, so
   *  narrowing costs one click and zero round trips. */
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  /** Client-side channel facet — eBay vs Amazon vs Ecwid on the rows already
   *  fetched. The commonest narrowing an ecommerce operator wants, and it costs
   *  one click rather than a trip to `/search`. */
  const [platformFilter, setPlatformFilter] = useState<string | null>(null);
  /** Set when the server had to broaden the query to find anything. */
  const [relaxedTo, setRelaxedTo] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const inputRef = useRef<HTMLInputElement>(null);

  const router = useRouter();
  const pathname = usePathname();
  // The catalog-aware resolver — the SAME one the rails and grids use, so an
  // org that recolours a channel in its platform catalog recolours it here.
  const platformMeta = usePlatformMeta();
  const { user, has } = useAuth();
  /** New task writes through `POST /api/tasks`, which needs the same permission. */
  const canCreateTask = has('work_orders.claim');
  const navGroups = useMemo(
    () => buildCommandBarNavGroups(new Set(user?.permissions ?? [])),
    [user?.permissions],
  );
  const setDialogOpen = useCallback((next: boolean) => {
    setOpen(next);
    dispatchOpenChange(next);
  }, []);

  const toggleDialogOpen = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      dispatchOpenChange(next);
      return next;
    });
  }, []);

  useEffect(() => {
    setRecents(getRecent());
  }, []);

  useEffect(() => {
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleDialogOpen();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleDialogOpen]);

  // Alt + the scope's own letter (I/O/T/S/#) switches axis without leaving the field.
  useEffect(() => {
    if (!open) return;
    function onScopeKey(e: globalThis.KeyboardEvent) {
      if (e.metaKey || e.ctrlKey) return;

      // ← / → step through the method pills, but ONLY while the field is empty.
      if (!e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        if (query.trim()) return;
        e.preventDefault();
        // `null` (All) is the first stop in the ring, so ← from the first pill
        // lands back on All rather than wrapping past it.
        const ring: Array<SearchByScope | null> = [null, ...SEARCH_BY_SCOPES];
        setAxis((prev) => {
          const at = ring.indexOf(prev);
          const next = e.key === 'ArrowRight' ? at + 1 : at - 1;
          return ring[(next + ring.length) % ring.length];
        });
        return;
      }

      if (!e.altKey) return;
      const pressed = e.key.toUpperCase();
      const match = SEARCH_BY_SCOPES.find((scope) => searchByShortcut(scope) === pressed);
      if (!match) return;
      e.preventDefault();
      setAxis((prev) => (prev === match ? null : match));
    }
    window.addEventListener('keydown', onScopeKey);
    return () => window.removeEventListener('keydown', onScopeKey);
  }, [open, query]);

  useEffect(() => {
    // `detail.query` (the ⌘K face's paste key) opens the palette already searching.
    const onOpen = (event: Event) => {
      const query = (event as CustomEvent<{ query?: unknown } | undefined>).detail?.query;
      if (typeof query === 'string' && query.trim()) setQuery(query.trim().slice(0, 500));
      setDialogOpen(true);
    };
    window.addEventListener(COMMAND_BAR_OPEN_EVENT, onOpen);
    window.addEventListener(GLOBAL_SEARCH_FOCUS_EVENT, onOpen);
    return () => {
      window.removeEventListener(COMMAND_BAR_OPEN_EVENT, onOpen);
      window.removeEventListener(GLOBAL_SEARCH_FOCUS_EVENT, onOpen);
    };
  }, [setDialogOpen]);

  // Close on an *actual* route change.
  const lastPathRef = useRef(pathname);
  useEffect(() => {
    if (lastPathRef.current === pathname) return;
    lastPathRef.current = pathname;
    if (!open) return;
    // Defer one frame so the portal unmount does not race the route swap that
    // triggered it (hit → /search?sel=…).
    const id = window.requestAnimationFrame(() => setDialogOpen(false));
    return () => window.cancelAnimationFrame(id);
  }, [pathname, open, setDialogOpen]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setSearchResults([]);
      setAxis(null);
      setTypeFilter(null);
      setPlatformFilter(null);
      setRelaxedTo(null);
      clearGlobalHeaderSearchDraft();
      return;
    }
    setRecents(getRecent());
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    setGlobalHeaderSearchDraft(query);
  }, [query]);

  const trimmedQuery = query.trim();
  const findMode = looksLikeIdentifier(trimmedQuery);
  // Typed printed handle (R-/L-/T-/location/…) — decoded once per keystroke.
  const typedHandle = useMemo(() => decodedHandle(trimmedQuery), [trimmedQuery]);
  const directOpen = useMemo(
    () => directOpenForTypedHandle(trimmedQuery),
    [trimmedQuery],
  );

  useEffect(() => {
    if (!trimmedQuery) {
      setSearchResults([]);
      setRelaxedTo(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    clearTimeout(debounceRef.current);
    const waitMs = findMode ? 0 : 80;
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const params = new URLSearchParams({
          q: trimmedQuery,
          limit: String(PALETTE_LIMIT),
          surface: 'palette',
        });
        if (axis) params.set('axis', axis);
        const res = await fetch(`/api/global-search?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('Search failed');
        const data = await res.json();
        if (!controller.signal.aborted) {
          setSearchResults(data.rows || []);
          // Only surface the broadened query when it actually differs — the
          // banner exists to stop a relaxed set reading as an exact one.
          setRelaxedTo(
            data.relaxed && data.effectiveQuery !== trimmedQuery
              ? String(data.effectiveQuery)
              : null,
          );
          setSearching(false);
        }
      } catch (err) {
        if ((err as { name?: string }).name !== 'AbortError') setSearching(false);
      }
    }, waitMs);
    return () => clearTimeout(debounceRef.current);
  }, [trimmedQuery, findMode, axis]);

  /** Entity-type counts over the WHOLE result set, so a facet chip keeps its
   *  count after another facet is applied — a count that changes as you filter
   *  cannot be used to decide what to filter to. */
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of searchResults) {
      counts.set(r.entityType, (counts.get(r.entityType) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [searchResults]);

  /** Channel counts, same shape and same reasoning as the type counts. */
  const platformCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of searchResults) {
      const channel = r.facets?.source_platform?.trim();
      if (!channel) continue;
      counts.set(channel, (counts.get(channel) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [searchResults]);

  const previewHits = useMemo(
    () =>
      searchResults
        .filter((r) => !typeFilter || r.entityType === typeFilter)
        .filter(
          (r) => !platformFilter || r.facets?.source_platform?.trim() === platformFilter,
        )
        .map(toAiSearchHit),
    [searchResults, typeFilter, platformFilter],
  );

  const previewGroups = useMemo(() => {
    if (!trimmedQuery || previewHits.length === 0) return [];
    // Every hit the fetch returned, grouped but never truncated.
    return groupHitsForPreview(previewHits, {
      perGroup: PALETTE_LIMIT,
      total: PALETTE_LIMIT,
    });
  }, [trimmedQuery, previewHits]);

  // A facet that no longer matches anything would silently show an empty
  // palette with results sitting behind it. Drop it instead.
  useEffect(() => {
    if (typeFilter && !typeCounts.some(([t]) => t === typeFilter)) setTypeFilter(null);
    if (platformFilter && !platformCounts.some(([c]) => c === platformFilter)) {
      setPlatformFilter(null);
    }
  }, [typeCounts, typeFilter, platformCounts, platformFilter]);

  const navigate = useCallback(
    (item: RecentItem) => {
      setRecents(saveRecent(item));
      // Close the telemetry loop:
      const entityId = Number(/(\d+)$/.exec(item.id)?.[1]);
      if (trimmedQuery && item.entityType && Number.isFinite(entityId) && entityId > 0) {
        void fetch('/api/search/opened', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: trimmedQuery,
            entityType: item.entityType,
            entityId,
          }),
          keepalive: true,
        }).catch(() => {});
      }
      setDialogOpen(false);
      if (!item.href) return;
      // Close the portal first, then route — concurrent unmount + push races
      // React 19's removeChild on the dialog overlay.
      window.requestAnimationFrame(() => {
        router.push(item.href!);
      });
    },
    [router, setDialogOpen, trimmedQuery],
  );

  const navigateHit = useCallback(
    (hit: AiSearchHit) => {
      navigate({
        id: `result:${hit.entityType}:${hit.id}`,
        label: hit.title,
        subtitle: hit.subtitle,
        href: hrefForPreviewHit(hit),
        entityType: hit.entityType,
        platform: hit.facets?.source_platform ?? null,
      });
    },
    [navigate],
  );

  /** Hand the typed query to the full find surface. */
  const seeAllResults = useCallback(() => {
    const href = `/search?q=${encodeURIComponent(trimmedQuery)}`;
    setDialogOpen(false);
    // Same ordering as every other exit from this palette: unmount the portal
    // first, then push, or React 19 races removeChild on the overlay.
    window.requestAnimationFrame(() => {
      router.push(href);
    });
  }, [router, setDialogOpen, trimmedQuery]);


  useFindFieldScan(inputRef, {
    enabled: open,
    onHandle: (_route, raw) => {
      const printed = decodedHandle(raw);
      const dest = printed
        ? searchPageHrefForScanRoute(printed)
        : searchPageHrefForScanRoute(_route);
      if (!dest) return false;
      setDialogOpen(false);
      window.requestAnimationFrame(() => {
        router.push(dest);
      });
      return true;
    },
  });

  const emptyCopy = !trimmedQuery
    ? 'Search orders, serials, tracking…'
    : searching
      ? 'Searching…'
      : typedHandle
        ? `No record found for “${trimmedQuery}”`
        : headerFindEmptyMessage(trimmedQuery, findMode ? 'order' : undefined);

  const showRecents = open && !trimmedQuery && recents.length > 0;
  // Page destinations. ⌘K is the page-to-page navigator. Empty query: the
  // contextual sidebar's own contract (`CommandBarPageMap` — this page's
  // verbs + views, then the page map). A query narrows the shared nav matcher,
  // which also finds the pages a lane door hides.
  const pageRows = trimmedQuery
    ? filterCommandBarNavGroups(navGroups, trimmedQuery)
        .flatMap((group) => group.rows)
        .filter((row) => row.type === 'page')
        .slice(0, 6)
    : [];
  const goHref = useCallback(
    (href: string) => {
      setDialogOpen(false);
      window.requestAnimationFrame(() => router.push(href));
    },
    [router, setDialogOpen],
  );
  const goIntent = useCallback(
    (intent: string) => {
      setDialogOpen(false);
      window.requestAnimationFrame(() => runNavIntent(intent));
    },
    [setDialogOpen],
  );
  const showIdentifierMiss =
    findMode && trimmedQuery && !searching && previewHits.length === 0;
  /** The fetch came back FULL, so the server had at least one more it was not asked for. */
  const showAllResultsRow =
    Boolean(trimmedQuery) && !searching && searchResults.length >= PALETTE_LIMIT;
  /**
   * Create-on-miss: typed words that found no record (none, or only the
   * server's broadened set) can become a task. Not for an identifier — a
   * missed order number is a miss, not a task headline.
   */
  const showNewTask =
    canCreateTask &&
    Boolean(trimmedQuery) &&
    !searching &&
    !findMode &&
    !directOpen &&
    (searchResults.length === 0 || relaxedTo !== null);
  const newTaskFromQuery = useCallback(() => {
    const note = trimmedQuery;
    setDialogOpen(false);
    // On `/` the board owns the verb; anywhere else it lands there with the note.
    window.requestAnimationFrame(() => {
      if (runNavIntent('daily:compose', { note })) return;
      router.push(`/?compose=1&note=${encodeURIComponent(note)}`);
    });
  }, [router, setDialogOpen, trimmedQuery]);

  return (
    <CommandDialog open={open} onOpenChange={setDialogOpen}>
      <Command shouldFilter={false} loop label="Find records" className="max-h-[70vh]">
        <CommandInput
          ref={inputRef}
          value={query}
          onValueChange={setQuery}
          placeholder={axis ? searchByPlaceholder(axis) : 'Order #, serial, tracking…'}
          data-testid="global-find-input"
        />
        {/* One control zone, ONE rule under it. */}
        <div className="border-b border-border-hairline">
        {/* Method pills — the search axis as a segmented toggle, not a row of typed labels. */}
        {/* `flex`, not a bare block. */}
        <div className="flex px-3 py-2">
          <IdentifierToggle
            ariaLabel="Search method"
            variant="bare"
            value={axis ?? ALL_SCOPE}
            onChange={(next) => setAxis(next === ALL_SCOPE ? null : (next as SearchByScope))}
            options={SCOPE_OPTIONS}
          />
        </div>

        {/* Entity-type facets over the current result set. */}
        {typeCounts.length > 1 ? (
          <div className="flex flex-wrap items-center gap-1 px-3 pb-2">
            <button
              type="button"
              onClick={() => setTypeFilter(null)}
              aria-pressed={typeFilter === null}
              className={cn(
                'inline-flex items-center gap-1 rounded-mode-pill px-2.5 py-1 text-role-caption font-medium mode-label-case transition-colors',
                typeFilter === null
                  ? 'bg-accent-bg text-text-accent'
                  : 'text-text-muted hover:bg-surface-sunken hover:text-text-default',
              )}
            >
              All <FacetCount count={searchResults.length} />
            </button>
            {typeCounts.map(([entityType, count]) => {
              const on = typeFilter === entityType;
              return (
                <button
                  key={`facet:${entityType}`}
                  type="button"
                  onClick={() => setTypeFilter(on ? null : entityType)}
                  aria-pressed={on}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-mode-pill px-2.5 py-1 text-role-caption font-medium mode-label-case ring-1 ring-inset transition-colors',
                    on
                      ? CHIP_TONE_CLASSES[ENTITY_TONE[entityType] ?? 'gray']
                      : 'text-text-muted ring-transparent hover:bg-surface-sunken hover:text-text-default',
                  )}
                >
                  {previewEntityLabel(entityType)} <FacetCount count={count} />
                </button>
              );
            })}
          </div>
        ) : null}

        {/* Channel facets. The dot is the platform's real brand colour, from
            the same source as every other channel face in the product — a
            search that invented its own would teach the wrong colour. */}
        {platformCounts.length > 1 ? (
          <div className="flex flex-wrap items-center gap-1 px-3 pb-2">
            {platformCounts.map(([channel, count]) => {
              const meta = platformMeta(channel);
              const dot = platformMetaBrandDot(meta);
              const on = platformFilter === channel;
              return (
                <button
                  key={`channel:${channel}`}
                  type="button"
                  onClick={() => setPlatformFilter(on ? null : channel)}
                  aria-pressed={on}
                  title={meta.label}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-mode-pill px-2.5 py-1 text-role-caption font-medium mode-label-case transition-colors',
                    on
                      ? 'bg-surface-sunken text-text-default'
                      : 'text-text-muted hover:bg-surface-sunken hover:text-text-default',
                  )}
                >
                  <span
                    className={cn('h-2 w-2 shrink-0 rounded-full', dot.className)}
                    style={dot.style}
                    aria-hidden
                  />
                  {meta.label} <FacetCount count={count} />
                </button>
              );
            })}
          </div>
        ) : null}

        {/* Broadened-result notice. A relaxed set must never read as an exact
            one — say what was searched instead, and offer the way back. */}
        {relaxedTo ? (
          <p className="px-3 pb-2 text-role-caption text-text-muted">
            No exact match for{' '}
            <span className="text-text-default">&ldquo;{trimmedQuery}&rdquo;</span> — showing
            results for <span className="text-text-default">&ldquo;{relaxedTo}&rdquo;</span>.
          </p>
        ) : null}
        </div>

        <CommandList className="max-h-[min(60vh,24rem)] p-1">
          <CommandEmpty>{emptyCopy}</CommandEmpty>
          {showRecents ? (
            <CommandGroup heading="Recent">
              {recents.map((r) => {
                // Same glyph AND same ink as the /search feed. The palette used
                // to keep its own icon table and paint every row flat grey, so
                // an order was a dashboard glyph here and a package there.
                const glyph = r.entityType ? entityGlyph(r.entityType) : null;
                const Icon = glyph?.Icon ?? Clock;
                const channel = r.platform?.trim() || null;
                return (
                  <CommandItem
                    key={`recent:${r.id}`}
                    value={`recent ${r.label} ${r.href ?? ''}`}
                    onSelect={() => navigate(r)}
                  >
                    <Icon className={cn('size-4', glyph?.className ?? 'text-text-faint')} />
                    <span className="min-w-0 flex-1 truncate">{r.label}</span>
                    {channel ? <PlatformMark meta={platformMeta(channel)} /> : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ) : null}
          {pageRows.length > 0 ? (
            <CommandGroup heading="Go to">
              {pageRows.map((row) => {
                const Icon = row.icon;
                return (
                  <CommandItem
                    key={`page:${row.id}`}
                    value={`page ${row.label} ${row.href}`}
                    onSelect={() => {
                      // Same exit order as the palette's other exits: unmount
                      // the portal first, then push (React 19 removeChild race).
                      setDialogOpen(false);
                      window.requestAnimationFrame(() => router.push(row.href));
                    }}
                  >
                    <Icon className="size-4 text-text-faint" />
                    <span className="min-w-0 flex-1 truncate">{row.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ) : null}
          {open && !trimmedQuery ? (
            // The contract hooks read the live URL (`useSearchParams`).
            <Suspense fallback={null}>
              <CommandBarPageMap onHref={goHref} onIntent={goIntent} />
            </Suspense>
          ) : null}
          {directOpen && trimmedQuery ? (
            <CommandGroup heading="Find">
              {directOpen ? (
                <CommandItem
                  value={`open handle ${trimmedQuery}`}
                  onSelect={() =>
                    navigate({
                      id: `open:${directOpen.href}`,
                      label: directOpenLabel(directOpen.route),
                      href: directOpen.href,
                    })
                  }
                >
                  <Box className="size-4 text-text-faint" />
                  <span className="min-w-0 flex-1">
                    {directOpenLabel(directOpen.route)}
                  </span>
                </CommandItem>
              ) : null}
            </CommandGroup>
          ) : null}
          {showIdentifierMiss ? (
            <p className="px-3 py-3 text-center text-sm text-text-muted">{emptyCopy}</p>
          ) : null}
          {previewGroups.map((group) => (
            <CommandGroup key={`group:${group.label}`} heading={group.label}>
              {group.hits.map((hit) => (
                <CommandItem
                  key={`hit:${hit.entityType}:${hit.id}`}
                  value={`result ${hit.entityType} ${hit.id} ${hit.title}`}
                  onSelect={() => navigateHit(hit)}
                  className="p-0 data-[selected=true]:bg-surface-sunken"
                >
                  <div className="pointer-events-none w-full">
                    <SearchResultRow hit={hit} density="dropdown" showJourneyAction={false} />
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
          {showNewTask ? (
            <CommandGroup heading="Actions">
              <CommandItem
                value={`new task ${trimmedQuery}`}
                onSelect={newTaskFromQuery}
                data-testid="palette-new-task"
              >
                <Plus className="size-4 text-text-faint" />
                <span className="min-w-0 flex-1 truncate">
                  New task &ldquo;{trimmedQuery}&rdquo;
                </span>
              </CommandItem>
            </CommandGroup>
          ) : null}
          {/* Overflow exit. */}
          {showAllResultsRow ? (
            <CommandGroup>
              <CommandItem
                value={`see-all ${trimmedQuery}`}
                onSelect={seeAllResults}
                data-testid="palette-see-all-results"
              >
                <Search className="size-4 text-text-faint" />
                <span className="min-w-0 flex-1 truncate text-text-muted">
                  See all results for{' '}
                  <span className="text-text-default">
                    &ldquo;{trimmedQuery}&rdquo;
                  </span>
                </span>
                <ChevronRight className="size-4 text-text-faint" />
              </CommandItem>
            </CommandGroup>
          ) : null}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
