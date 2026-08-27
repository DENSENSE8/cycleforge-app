'use client';

/**
 * CommandBar — global ⌘K / Ctrl+K command menu.
 *
 * Built on the `cmdk` primitive (same library used by Linear, Vercel,
 * Raycast-style menus, shadcn/ui's CommandDialog). cmdk handles a11y,
 * roving focus, arrow-key navigation, and group rendering; this component
 * provides the visual shell (framer-motion modal + backdrop blur),
 * server-side search via /api/global-search, and recents in localStorage.
 *
 * Page destinations mirror the MasterNav spine contract (Pin →
 * SPINE_SECTIONS → Footer) via `buildCommandBarNavGroups` — never a twin map.
 *
 * Query shape forks the job: word / empty → nav mode (spine + child pages +
 * optional search). Identifier-shaped (`looksLikeIdentifier`) → find mode —
 * nav titles hide; triage rows reuse `SearchResultRow` + `commitIdentifierFind`
 * (same resolve path as header find). Chord ownership unchanged.
 *
 * `shouldFilter={false}` because we mix two filtering sources:
 *  - static nav items (filtered manually below by query.includes)
 *  - server search results (already filtered server-side)
 * Letting cmdk also filter would double-filter and hide valid server hits.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Command } from 'cmdk';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence, useReducedMotion } from '@/design-system/motion';
import {
  framerPresence,
  framerTransition,
  framerVariants,
} from '@/design-system/foundations/motion-framer';
import { useRouter, usePathname } from 'next/navigation';
import {
  Search,
  Loader2,
  Clock,
  LayoutDashboard,
  Package,
  Tool,
  PackageCheck,
  ClipboardList,
  Box,
  ChevronRight,
} from '@/components/Icons';
import { SearchResultRow } from '@/components/search/SearchResultRow';
import { groupHitsForPreview } from '@/components/search/search-tabs';
import {
  APP_SIDEBAR_NAV,
  applyChildTarget,
  filterPageChildren,
  getSidebarNavItems,
  getSidebarPageNav,
  type SidebarIconComponent,
} from '@/lib/sidebar-navigation';
import {
  buildCommandBarNavGroups,
  filterCommandBarNavGroups,
  type CommandBarNavGroup,
} from '@/lib/nav/command-bar-nav-groups';
import { useSidebarChildNav } from '@/components/sidebar/master-nav/useSidebarChildNav';
import { looksLikeIdentifier } from '@/lib/search/search-hit';
import {
  commitIdentifierFind,
  hrefForPreviewHit,
} from '@/lib/search/commit-identifier-find';
import type { AiSearchHit } from '@/lib/search/ai-search-client';
import { COMMAND_BAR_OPEN_EVENT } from '@/lib/app-events';
import { useAuth } from '@/contexts/AuthContext';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import { cn } from '@/utils/_cn';

// ── Types ─────────────────────────────────────────────────────────────────

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
}

type IconComponent = (props: { className?: string }) => JSX.Element;

// ── Constants ─────────────────────────────────────────────────────────────

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

const GROUP_HEADING_CLASS =
  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-role-micro [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-text-faint';

// ── Helpers ───────────────────────────────────────────────────────────────

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

/** One L2 mode row in the palette (e.g. `Receiving · Arrival`). */
interface ChildPageOption {
  pageId: string;
  childId: string;
  pageLabel: string;
  childLabel: string;
  icon: SidebarIconComponent;
  /** Display-only href (fresh params) for the row sub-label + the recents entry. */
  href: string;
}

/**
 * Flatten every reachable L2 mode into palette rows. Gating mirrors the master
 * nav: page-level `requires` via `getSidebarNavItems`, per-mode `requires` via
 * `filterPageChildren`. Single-mode pages are omitted — the page row already goes
 * there.
 */
function buildChildPageItems(permissions?: ReadonlySet<string>): ChildPageOption[] {
  const items = permissions ? getSidebarNavItems({ permissions }) : APP_SIDEBAR_NAV;
  const out: ChildPageOption[] = [];
  for (const item of items) {
    const page = getSidebarPageNav(item.id);
    if (!page?.children) continue;
    const children = filterPageChildren(page, permissions).children ?? [];
    if (children.length < 2) continue;
    for (const child of children) {
      const { pathname, search } = applyChildTarget(
        { pathname: page.href, params: new URLSearchParams() },
        child.to(),
      );
      out.push({
        pageId: page.id,
        childId: child.id,
        pageLabel: item.label,
        childLabel: child.label,
        icon: child.icon,
        href: search ? `${pathname}?${search}` : pathname,
      });
    }
  }
  return out;
}

/**
 * Map a global-search row into the shared SearchHit wire shape used by
 * SearchResultRow / groupHitsForPreview.
 */
function toAiSearchHit(r: SearchResult): AiSearchHit {
  return {
    id: r.id,
    entityType: r.entityType,
    title: r.title,
    subtitle: r.subtitle,
    href: r.href,
    matchField: 'title',
    score: r.score ?? 0,
    chips: r.chips,
  };
}

// ── Component ─────────────────────────────────────────────────────────────

export function CommandBar() {
  const shouldReduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolvePending, setResolvePending] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [recents, setRecents] = useState<RecentItem[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { user: authUser, isLoaded: authLoaded } = useAuth();

  useEffect(() => {
    setMounted(true);
    setRecents(getRecent());
  }, []);

  // ── Keyboard shortcut: ⌘K / Ctrl+K → toggle palette ──
  //
  // Fires from ANYWHERE, text fields included. There used to be an
  // `if (editable && !open) return` bail that stood the chord down whenever
  // focus sat in an input, textarea, select or contenteditable — which is most
  // of the time an operator is mid-task, and is precisely when jumping
  // somewhere else is most useful. Typing in the sidebar filter and pressing
  // ⌘K did nothing at all.
  //
  // The rule that guard was borrowed from is real but applies to BARE keys: a
  // single-letter hotkey must yield while typing, because the user is trying to
  // produce that character. ⌘K is not a character — nobody types it into a
  // field — so there is nothing to yield to. Every peer palette (VS Code,
  // Linear, Notion, Slack, Raycast) opens from inside a text field for the same
  // reason. The old code half-knew this: `&& !open` already carved out the
  // palette's own input so the chord could close it. The carve-out was just
  // scoped to one input instead of to the chord.
  //
  // A surface that genuinely must keep the chord — a modal with a focus trap —
  // suppresses it at its own level (`usePhotoGallery`), which is the right
  // altitude for that decision. See `layout/cmdk-owner.guard.test.ts`.
  useEffect(() => {
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      // `toLowerCase` so Caps Lock / Shift still resolve to the same chord.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  // External trigger (quick-access / legacy dispatchers).
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(COMMAND_BAR_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(COMMAND_BAR_OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSearchResults([]);
      setRecents(getRecent());
    }
  }, [open]);
  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    clearTimeout(debounceRef.current);
    const q = query.trim();
    const waitMs = looksLikeIdentifier(q) ? 0 : 80;
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(
          `/api/global-search?q=${encodeURIComponent(q)}&limit=12`,
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
  }, [query]);

  const authPermissions = useMemo<ReadonlySet<string> | undefined>(() => {
    if (!authLoaded || !authUser) return undefined;
    return new Set(authUser.permissions);
  }, [authLoaded, authUser]);

  const navGroups = useMemo(
    () => buildCommandBarNavGroups(authPermissions),
    [authPermissions],
  );
  const filteredNavGroups = useMemo(
    () => filterCommandBarNavGroups(navGroups, query),
    [navGroups, query],
  );
  /** Stagger page rows only at empty-query rest — typing must not replay cascade. */
  const staggerNavAppear = open && !query.trim();

  const childPageItems = useMemo(() => buildChildPageItems(authPermissions), [authPermissions]);
  const filteredChildPages = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return childPageItems.filter(
      (m) =>
        m.childLabel.toLowerCase().includes(q) || m.pageLabel.toLowerCase().includes(q),
    );
  }, [childPageItems, query]);

  const trimmedQuery = query.trim();
  const findMode = looksLikeIdentifier(trimmedQuery);

  const findPreviewGroups = useMemo(() => {
    if (!findMode) return [];
    return groupHitsForPreview(searchResults.map(toAiSearchHit), {
      perGroup: 4,
      total: 12,
    });
  }, [findMode, searchResults]);

  const navigate = useCallback(
    (item: RecentItem) => {
      if (item.href) router.push(item.href);
      setRecents(saveRecent(item));
      setOpen(false);
    },
    [router],
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
      // Miss / FBA: stay open — preview/empty already visible.
    } finally {
      setResolvePending(false);
    }
  }, [trimmedQuery, resolvePending, queryClient, navigate]);

  const navigateChild = useSidebarChildNav();
  const selectChildPage = useCallback(
    (m: ChildPageOption) => {
      navigateChild(m.pageId, m.childId);
      setRecents(
        saveRecent({
          id: `child:${m.pageId}:${m.childId}`,
          label: `${m.pageLabel} · ${m.childLabel}`,
          href: m.href,
        }),
      );
      setOpen(false);
    },
    [navigateChild],
  );

  if (!mounted) return null;

  const showSearchGroup = Boolean(trimmedQuery) && !findMode;
  const showRecentGroup = !trimmedQuery && recents.length > 0;
  const showNavGroups = !findMode;
  const showFindTriage = findMode;

  const dialogInitial = shouldReduceMotion
    ? { opacity: 0 }
    : framerPresence.commandBarDialog.initial;
  const dialogAnimate = shouldReduceMotion
    ? { opacity: 1 }
    : framerPresence.commandBarDialog.animate;
  const dialogExit = shouldReduceMotion
    ? { opacity: 0 }
    : framerPresence.commandBarDialog.exit;
  const dialogTransition = shouldReduceMotion
    ? { duration: 0 }
    : framerTransition.commandBarDialog;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="cmdk-scrim"
            initial={framerPresence.workOrderScrim.initial}
            animate={framerPresence.workOrderScrim.animate}
            exit={framerPresence.workOrderScrim.exit}
            transition={shouldReduceMotion ? { duration: 0 } : framerTransition.overlayScrim}
            className="fixed inset-0 z-command bg-scrim/40 backdrop-blur-md"
            onClick={() => setOpen(false)}
            aria-hidden
          />

          <motion.div
            key="cmdk-dialog"
            initial={dialogInitial}
            animate={dialogAnimate}
            exit={dialogExit}
            transition={dialogTransition}
            className="fixed inset-x-0 top-0 z-command flex justify-center px-4 pt-[12vh] md:pt-[16vh]"
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <Command
              label="Command menu"
              shouldFilter={false}
              loop
              className="w-full max-w-[560px] overflow-hidden rounded-2xl border border-border-soft bg-surface-card shadow-2xl shadow-gray-900/30 ring-1 ring-black/[0.04] flex flex-col max-h-[70vh]"
            >
              <div className="flex items-center gap-3 border-b border-border-hairline px-4 py-3">
                {searching ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-text-faint" />
                ) : (
                  <Search className="h-4 w-4 shrink-0 text-text-faint" />
                )}
                <Command.Input
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Search pages, orders, repairs, SKUs…"
                  autoFocus
                  className="flex-1 bg-transparent text-base font-medium text-text-default placeholder:text-text-faint outline-none"
                />
                <kbd className="hidden shrink-0 rounded-md border border-border-soft bg-surface-canvas px-1.5 py-0.5 font-mono text-role-micro font-semibold text-text-soft md:inline-flex">
                  ESC
                </kbd>
              </div>

              <Command.List className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
                <Command.Empty className="px-4 py-10 text-center text-sm text-text-soft">
                  {searching || resolvePending
                    ? 'Searching…'
                    : trimmedQuery
                      ? `No matches for "${trimmedQuery}"`
                      : 'Type to search'}
                </Command.Empty>

                {showRecentGroup && (
                  <Command.Group heading="Recent" className={GROUP_HEADING_CLASS}>
                    {recents.map((r) => {
                      const Icon = r.entityType
                        ? ENTITY_ICONS[r.entityType] || Clock
                        : Clock;
                      return (
                        <CmdRow
                          key={`recent:${r.id}`}
                          value={`recent ${r.label} ${r.href ?? ''}`}
                          icon={<Icon className={navIconStrokeClass('h-4 w-4 text-text-faint')} />}
                          label={r.label}
                          subLabel={r.subtitle ?? r.href ?? undefined}
                          onSelect={() => navigate(r)}
                        />
                      );
                    })}
                  </Command.Group>
                )}

                {showNavGroups &&
                  filteredNavGroups.map((group) => (
                    <SpineNavGroup
                      key={group.id}
                      group={group}
                      stagger={staggerNavAppear}
                      openKey={open}
                      onSelectPage={(page) =>
                        navigate({
                          id: `nav:${page.id}`,
                          label: page.label,
                          href: page.href,
                        })
                      }
                    />
                  ))}

                {showNavGroups && filteredChildPages.length > 0 && (
                  <Command.Group heading="Child pages" className={GROUP_HEADING_CLASS}>
                    {filteredChildPages.map((m) => {
                      const Icon = m.icon;
                      return (
                        <CmdRow
                          key={`child:${m.pageId}:${m.childId}`}
                          value={`child ${m.pageLabel} ${m.childLabel}`}
                          icon={<Icon className={navIconStrokeClass('h-4 w-4 text-text-faint')} />}
                          label={`${m.pageLabel} · ${m.childLabel}`}
                          subLabel={m.href}
                          onSelect={() => selectChildPage(m)}
                        />
                      );
                    })}
                  </Command.Group>
                )}

                {showFindTriage && (
                  <>
                    <Command.Group heading="Find" className={GROUP_HEADING_CLASS}>
                      <CmdRow
                        value={`find resolve ${trimmedQuery}`}
                        icon={
                          resolvePending ? (
                            <Loader2 className="h-4 w-4 animate-spin text-text-faint" />
                          ) : (
                            <Search className="h-4 w-4 text-text-faint" />
                          )
                        }
                        label={`See all results for "${trimmedQuery}"`}
                        subLabel="Resolve order · tracking · serial"
                        onSelect={() => {
                          void commitFindIdentifier();
                        }}
                      />
                    </Command.Group>
                    {findPreviewGroups.map((group) => (
                      <Command.Group
                        key={`find:${group.label}`}
                        heading={group.label}
                        className={GROUP_HEADING_CLASS}
                      >
                        {group.hits.map((hit) => (
                          <Command.Item
                            key={`find-hit:${hit.entityType}:${hit.id}`}
                            value={`find result ${hit.entityType} ${hit.id} ${hit.title}`}
                            onSelect={() => navigateHit(hit)}
                            className={cn(
                              'mx-1 cursor-pointer rounded-lg p-0 text-left',
                              'data-[selected=true]:bg-surface-sunken aria-selected:bg-surface-sunken',
                            )}
                          >
                            {/*
                              SearchResultRow is a Link; pointer-events-none keeps
                              cmdk selection as the sole click/keyboard owner.
                            */}
                            <div className="pointer-events-none w-full">
                              <SearchResultRow
                                hit={hit}
                                density="dropdown"
                                showJourneyAction={false}
                              />
                            </div>
                          </Command.Item>
                        ))}
                      </Command.Group>
                    ))}
                  </>
                )}

                {showSearchGroup && searchResults.length > 0 && (
                  <Command.Group heading="Search results" className={GROUP_HEADING_CLASS}>
                    <CmdRow
                      value={`search all results ${query}`}
                      icon={<Search className="h-4 w-4 text-text-faint" />}
                      label={`See all matching orders for "${trimmedQuery}"`}
                      subLabel="Open the orders board filtered by this search"
                      onSelect={() =>
                        navigate({
                          id: `search-all:${trimmedQuery}`,
                          label: `Search: ${trimmedQuery}`,
                          href: `/shipping/orders?search=${encodeURIComponent(trimmedQuery)}`,
                        })
                      }
                    />
                    {searchResults.map((r) => {
                      const Icon = ENTITY_ICONS[r.entityType] || Search;
                      return (
                        <CmdRow
                          key={`result:${r.entityType}:${r.id}`}
                          value={`result ${r.entityType} ${r.id} ${r.title}`}
                          icon={<Icon className={navIconStrokeClass('h-4 w-4 text-text-faint')} />}
                          label={r.title}
                          subLabel={r.subtitle}
                          badge={r.entityType}
                          chips={r.chips}
                          onSelect={() =>
                            navigate({
                              id: `result:${r.entityType}:${r.id}`,
                              label: r.title,
                              subtitle: r.subtitle,
                              href: r.href,
                              entityType: r.entityType,
                            })
                          }
                        />
                      );
                    })}
                  </Command.Group>
                )}
              </Command.List>

              <div className="flex items-center justify-between gap-3 border-t border-border-hairline bg-surface-canvas/70 px-4 py-2 text-role-micro text-text-soft">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1">
                    <kbd className="rounded border border-border-soft bg-surface-card px-1 py-0.5 font-mono">↑↓</kbd>
                    {findMode ? 'results' : 'navigate'}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <kbd className="rounded border border-border-soft bg-surface-card px-1 py-0.5 font-mono">↵</kbd>
                    {findMode ? 'open' : 'select'}
                  </span>
                  <span className="hidden sm:inline-flex items-center gap-1">
                    <kbd className="rounded border border-border-soft bg-surface-card px-1 py-0.5 font-mono">esc</kbd>
                    close
                  </span>
                </div>
                <span className="hidden md:inline-flex items-center gap-1">
                  <kbd className="rounded border border-border-soft bg-surface-card px-1 py-0.5 font-mono">⌘K</kbd>
                  toggle
                </span>
              </div>
            </Command>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ── Spine page group ──────────────────────────────────────────────────────

function SpineNavGroup({
  group,
  stagger,
  openKey,
  onSelectPage,
}: {
  group: CommandBarNavGroup;
  stagger: boolean;
  openKey: boolean;
  onSelectPage: (page: {
    id: string;
    label: string;
    href: string;
  }) => void;
}) {
  const SectionIcon = group.sectionIcon;
  const heading = (
    <span className="inline-flex items-center gap-1.5">
      {SectionIcon ? (
        // Band glyph uses the same muted ink as an idle row — spine is
        // monochrome; section identity is the labelled band, never a hue.
        <SectionIcon className={`h-3 w-3 ${group.accent.idlePageIcon}`} />
      ) : null}
      {group.label}
    </span>
  );

  const idleIconClass = group.accent.childIdleIcon;

  const rows = group.rows.map((row) => {
    if (row.type === 'subgroup') {
      const Icon = row.icon;
      return (
        <div
          key={`subgroup:${group.id}:${row.id}`}
          className="mx-1 flex items-center gap-2 px-3 py-1.5 text-role-caption font-semibold text-text-muted"
          aria-hidden
        >
          <Icon className={navIconStrokeClass(`h-3.5 w-3.5 ${idleIconClass}`)} />
          <span>{row.label}</span>
        </div>
      );
    }

    const Icon = row.icon;
    const pageRow = (
      <CmdRow
        key={`nav:${row.id}`}
        value={`page ${row.label} ${row.href} ${group.label}`}
        icon={<Icon className={`h-4 w-4 ${idleIconClass}`} />}
        iconSelectedClassName={group.accent.cmdkSelectedIcon}
        label={row.label}
        subLabel={row.href}
        selectedClassName={group.accent.cmdkSelected}
        className={row.indented ? 'pl-7' : undefined}
        onSelect={() =>
          onSelectPage({ id: row.id, label: row.label, href: row.href })
        }
      />
    );

    if (!stagger) return pageRow;

    return (
      <motion.div
        key={`nav-stagger:${row.id}`}
        variants={framerVariants.spineRowStaggerItem}
      >
        {pageRow}
      </motion.div>
    );
  });

  return (
    <Command.Group heading={heading} className={GROUP_HEADING_CLASS}>
      {stagger ? (
        <motion.div
          key={`spine-stagger-${group.id}-${openKey}`}
          initial="hidden"
          animate="visible"
          variants={framerVariants.spineRowStaggerContainer}
        >
          {rows}
        </motion.div>
      ) : (
        rows
      )}
    </Command.Group>
  );
}

// ── Row primitive ─────────────────────────────────────────────────────────

interface CmdRowProps {
  value: string;
  icon?: React.ReactNode;
  label: string;
  subLabel?: string;
  badge?: string;
  chips?: SearchResultChip[];
  onSelect: () => void;
  /** Soft accent wash when cmdk-selected — full `data-[selected=true]:*` tokens from spine SoT. */
  selectedClassName?: string;
  /** Icon tint when selected — full `group-data-[selected=true]:*` tokens from spine SoT. */
  iconSelectedClassName?: string;
  className?: string;
}

const CHIP_TONE_CLASSES: Record<string, string> = {
  gray: 'bg-surface-canvas text-text-muted ring-border-soft',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200',
};

function CmdRow({
  value,
  icon,
  label,
  subLabel,
  badge,
  chips,
  onSelect,
  selectedClassName,
  iconSelectedClassName,
  className,
}: CmdRowProps) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className={[
        'group mx-1 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-text-default transition-colors',
        'data-[selected=true]:bg-surface-sunken data-[selected=true]:text-text-default aria-selected:bg-surface-sunken',
        selectedClassName ?? '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {icon ? (
        <span
          className={[
            'flex h-5 w-5 shrink-0 items-center justify-center [&_svg]:transition-colors',
            iconSelectedClassName ?? '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{label}</span>
        {subLabel && (
          <span className="block truncate text-role-caption font-medium text-text-soft">{subLabel}</span>
        )}
      </span>
      {chips?.slice(0, 2).map((chip) => (
        <span
          key={chip.label}
          className={`hidden shrink-0 rounded px-1.5 py-0.5 text-role-eyebrow uppercase tracking-widest ring-1 ring-inset md:inline-flex ${
            CHIP_TONE_CLASSES[chip.tone ?? 'gray'] ?? CHIP_TONE_CLASSES.gray
          }`}
        >
          {chip.label}
        </span>
      ))}
      {badge && (
        <span className="shrink-0 rounded-md bg-surface-sunken px-1.5 py-0.5 text-role-eyebrow uppercase tracking-widest text-text-soft group-data-[selected=true]:bg-surface-card group-data-[selected=true]:text-text-muted">
          {badge}
        </span>
      )}
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-faint opacity-0 transition-opacity group-data-[selected=true]:opacity-100" />
    </Command.Item>
  );
}
