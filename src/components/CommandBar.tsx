'use client';

/**
 * CommandBar — centered ⌘K find palette. Records search only (orders, serials,
 * tracking, titles) via `/api/global-search`. The header icon dispatches
 * {@link COMMAND_BAR_OPEN_EVENT}; this component owns chord + dialog state.
 *
 * `shouldFilter={false}` — server already filtered the hits.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import {
  Clock,
  LayoutDashboard,
  Loader2,
  Package,
  PackageCheck,
  ClipboardList,
  Box,
  Search,
  Tool,
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
import { groupHitsForPreview } from '@/components/search/search-tabs';
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
import { decodedHandle, type ScanRoute } from '@/lib/barcode-routing';
import {
  directOpenForTypedHandle,
  searchPageHrefForScanRoute,
} from '@/lib/search/internal-id';
import { looksLikeIdentifier } from '@/lib/search/search-hit';
import {
  commitIdentifierFind,
  hrefForPreviewHit,
} from '@/lib/search/commit-identifier-find';
import { headerFindEmptyMessage } from '@/lib/search/search-by';
import type { AiSearchHit } from '@/lib/search/ai-search-client';

interface RecentItem {
  id: string;
  label: string;
  subtitle?: string;
  href?: string;
  entityType?: string;
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

type IconComponent = (props: { className?: string }) => JSX.Element;

const RECENT_KEY = 'command-bar-recent';
const MAX_RECENT = 6;

const ENTITY_ICONS: Record<string, IconComponent> = {
  order: LayoutDashboard,
  repair: Tool,
  fba: Package,
  receiving: ClipboardList,
  sku: Box,
  unit: PackageCheck,
};

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
  const [resolvePending, setResolvePending] = useState(false);
  const [recents, setRecents] = useState<RecentItem[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const inputRef = useRef<HTMLInputElement>(null);

  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();

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

  useEffect(() => {
    const onOpen = () => setDialogOpen(true);
    window.addEventListener(COMMAND_BAR_OPEN_EVENT, onOpen);
    window.addEventListener(GLOBAL_SEARCH_FOCUS_EVENT, onOpen);
    return () => {
      window.removeEventListener(COMMAND_BAR_OPEN_EVENT, onOpen);
      window.removeEventListener(GLOBAL_SEARCH_FOCUS_EVENT, onOpen);
    };
  }, [setDialogOpen]);

  // Close on an *actual* route change. The guard has to be the pathname, not
  // `open`: this effect also re-runs when the palette opens, and it used to
  // schedule the close on that run too — so ⌘K painted for one frame and shut
  // itself. That was the flash.
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
        const res = await fetch(
          `/api/global-search?q=${encodeURIComponent(trimmedQuery)}&limit=12`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error('Search failed');
        const data = await res.json();
        if (!controller.signal.aborted) {
          setSearchResults(data.rows || []);
          setSearching(false);
        }
      } catch (err) {
        if ((err as { name?: string }).name !== 'AbortError') setSearching(false);
      }
    }, waitMs);
    return () => clearTimeout(debounceRef.current);
  }, [trimmedQuery, findMode]);

  const previewHits = useMemo(
    () => searchResults.map(toAiSearchHit),
    [searchResults],
  );

  const previewGroups = useMemo(() => {
    if (!trimmedQuery || previewHits.length === 0) return [];
    return groupHitsForPreview(previewHits, { perGroup: 4, total: 12 });
  }, [trimmedQuery, previewHits]);

  const navigate = useCallback(
    (item: RecentItem) => {
      setRecents(saveRecent(item));
      setDialogOpen(false);
      if (!item.href) return;
      // Close the portal first, then route — concurrent unmount + push races
      // React 19's removeChild on the dialog overlay.
      window.requestAnimationFrame(() => {
        router.push(item.href!);
      });
    },
    [router, setDialogOpen],
  );

  const navigateHit = useCallback(
    (hit: AiSearchHit) => {
      navigate({
        id: `result:${hit.entityType}:${hit.id}`,
        label: hit.title,
        subtitle: hit.subtitle,
        href: hrefForPreviewHit(hit),
        entityType: hit.entityType,
      });
    },
    [navigate],
  );

  const commitFindIdentifier = useCallback(async () => {
    if (!trimmedQuery || resolvePending) return;
    setResolvePending(true);
    try {
      const result = await commitIdentifierFind(queryClient, trimmedQuery);
      if (result.kind === 'navigate') {
        navigate({
          id: `resolve:${result.orderId}`,
          label: result.order.product_title || result.order.order_id || trimmedQuery,
          href: result.href,
          entityType: 'order',
        });
      }
    } finally {
      setResolvePending(false);
    }
  }, [trimmedQuery, resolvePending, queryClient, navigate]);

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
    : searching || resolvePending
      ? 'Searching…'
      : typedHandle
        ? `No record found for “${trimmedQuery}”`
        : headerFindEmptyMessage(trimmedQuery, findMode ? 'order' : undefined);

  const showRecents = open && !trimmedQuery && recents.length > 0;
  const showIdentifierMiss =
    findMode && trimmedQuery && !searching && previewHits.length === 0;

  return (
    <CommandDialog open={open} onOpenChange={setDialogOpen}>
      <Command shouldFilter={false} loop label="Find records" className="max-h-[70vh]">
        <CommandInput
          ref={inputRef}
          value={query}
          onValueChange={setQuery}
          placeholder="Order #, serial, tracking…"
          data-testid="global-find-input"
        />
        <CommandList className="max-h-[min(60vh,24rem)]">
          <CommandEmpty>{emptyCopy}</CommandEmpty>
          {showRecents ? (
            <CommandGroup heading="Recent">
              {recents.map((r) => {
                const Icon = r.entityType ? ENTITY_ICONS[r.entityType] || Clock : Clock;
                return (
                  <CommandItem
                    key={`recent:${r.id}`}
                    value={`recent ${r.label} ${r.href ?? ''}`}
                    onSelect={() => navigate(r)}
                  >
                    <Icon className="size-4 text-text-faint" />
                    <span className="min-w-0 flex-1 truncate">{r.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ) : null}
          {(findMode || directOpen) && trimmedQuery ? (
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
              {findMode ? (
                <CommandItem
                  value={`find resolve ${trimmedQuery}`}
                  onSelect={() => {
                    void commitFindIdentifier();
                  }}
                >
                  {resolvePending ? (
                    <Loader2 className="size-4 animate-spin text-text-faint" />
                  ) : (
                    <Search className="size-4 text-text-faint" />
                  )}
                  <span className="min-w-0 flex-1">
                    See all results for &quot;{trimmedQuery}&quot;
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
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
