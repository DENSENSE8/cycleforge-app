'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from '@/design-system/motion';
import {
  framerPresence,
  framerTransition,
  framerVariants,
} from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import { buildNavDestinations, type NavDestination } from '@/lib/nav/nav-destinations';
import { searchNav, splitNavHighlight, type NavMatch } from '@/lib/nav/nav-search';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import {
  spineAccentFor,
  type SpineAccentClasses,
} from '@/lib/nav/spine-section-accent';
import {
  SPINE_SECTIONS,
  STATION_SUBGROUPS,
  spineSectionIdForPage,
  type SidebarPageNav,
  type SpineSectionId,
  type StationSubgroupId,
} from '@/lib/sidebar-navigation';
import { cn } from '@/utils/_cn';
import { StaffAccountFooter } from './StaffAccountFooter';

/**
 * The page list inside the sidebar spine — **ONE flat scrolling map**.
 *
 * Home / Search / Media / Chat stay top-pinned; the body is every reachable
 * destination in {@link SPINE_SECTIONS} order, grouped by a `border-t` and
 * nothing else; a footer-pinned {@link TechRailSearchBar} (`density="row"`, so
 * the band measures a nav row rather than a station rail's dock) sits above the
 * footer band — Workflow Studio · Admin · Settings — then
 * {@link StaffAccountFooter}.
 *
 * ## The drill is gone (2026-08-02)
 *
 * Six of the eight sections held exactly one page, so drilling charged a click
 * to reveal a row carrying the section's own name — `Catalog › Catalog`. That
 * duplicate was the visible symptom of hierarchy with no content.
 *
 * Sections therefore render **no header row**: a header would re-create the
 * duplicate everywhere a section shares a name with a page beneath it, which is
 * most of them. Every row here is an addressable destination. What a section IS
 * survives as the divider between blocks, plus the labelled bands ⌘K groups by
 * and the parent `context` string `nav-destinations.ts` puts on every flat
 * search row — neither of which had to be built, and both of which are why the
 * label can go.
 *
 * The divider is **load-bearing**: the root axis is deliberately mixed (Scan
 * Stations is an INPUT MODEL among business DOMAINS) and the rule between the
 * blocks is the only thing left saying so.
 *
 * ## Children show for the ACTIVE page only
 *
 * Reverses "modes stay always expanded" (the pre-rename wording), which was
 * affordable only while a
 * drill kept one section on screen at a time. Flat, expanding every multi-child
 * page measures **64 rows / ~1790px against a ~600px scrollport** — 43 of them
 * child rows — which fails the one thing the flatten was for.
 *
 * ## Chrome
 *
 * **Neutral and STILL.** Accents resolve to one grey ladder via
 * {@link spineAccentFor} — the eight section hues are gone. Nothing on a row
 * travels on hover: the glyph's 2px CSS lift was deleted with the hues, because
 * a structural anchor in a 20-row column should not move under the pointer, and
 * the neutral wash answers hover on its own. The older bans stand and are about
 * cost, not taste — a framer `whileHover` here would re-render React on every
 * mousemove across the list, a row-level `scale` breaks the baseline every dense
 * surface beside it aligns to, and a hover weight shift reflows text mid-pointer.
 *
 * **Every row carries its glyph, at the same light page stroke.** A child
 * / station-subgroup) row is the switch between one page's siblings, which is
 * the job the GlobalHeader page switcher draws with the same icon set — two doors
 * onto one destination must not disagree about whether it has a face. What child
 * rows do NOT get is the heavier L2 weight: at 2.25 a child glyph out-draws its
 * own parent at 1.5. Subordination is the indent, the caption/medium type, and
 * the muted ink.
 *
 * **The map mounts instantly.** It is painted on every cold load, so a cascade
 * there is time-to-interactive spent on rows whose position the operator already
 * knows. The one surviving cascade ({@link framerVariants.spineRowStaggerContainer})
 * belongs to the active page's children, which genuinely mount on navigation.
 * Body swap (map ⇄ ranked results) is opacity-only
 * {@link framerPresence.spineBodySwap}.
 */
interface SidebarNavListProps {
  activePage: SidebarPageNav;
  activeChildId: string | null;
  otherPages: SidebarPageNav[];
  onNavigate: (pageId: string, childId?: string) => void;
  /** Hover hook per page row — warms the destination's data (nav-data-prefetch). */
  onRowHover?: (page: SidebarPageNav) => void;
  className?: string;
}

function pagesForSection(pages: SidebarPageNav[], sectionId: SpineSectionId): SidebarPageNav[] {
  return pages.filter((p) => spineSectionIdForPage(p) === sectionId);
}

function subgroupDef(id: StationSubgroupId | undefined) {
  if (!id) return null;
  return STATION_SUBGROUPS.find((g) => g.id === id) ?? null;
}

// There is deliberately NO local matcher here. A query switches the body to the
// flat destination list, which ranks through `searchNav` — the one nav matcher.
// Two unranked `includes()` helpers used to live at this spot: one narrowed the
// root's section BUTTONS, the other the drill's pages. That split is what made
// typing a page's exact name return a category.

export function SidebarNavList({
  activePage,
  activeChildId,
  otherPages,
  onNavigate,
  onRowHover,
  className,
}: SidebarNavListProps) {
  const highlightedChildId = activeChildId ?? activePage.children?.[0]?.id ?? null;
  const bodySwapPresence = useMotionPresence(framerPresence.spineBodySwap);
  const bodySwapTransition = useMotionTransition(framerTransition.spineBodySwap);
  const activeWashPresence = useMotionPresence(framerPresence.spineActiveWash);
  const activeWashTransition = useMotionTransition(framerTransition.spineActiveWash);
  const [navFilter, setNavFilter] = useState('');
  const navFilterRef = useRef(navFilter);
  navFilterRef.current = navFilter;
  /**
   * Has the operator touched the footer filter yet? Not "is a filter active" —
   * see {@link rowStaggerInitial}. Re-armed when the ACTIVE PAGE changes, which
   * is the only thing that mounts rows now that there is no drill to enter: an
   * empty query lets the incoming page's children cascade, while a preserved
   * non-empty query keeps `touched` so the list does not re-fade under the
   * cursor.
   */
  const [filterTouched, setFilterTouched] = useState(false);

  useEffect(() => {
    setFilterTouched(Boolean(navFilterRef.current.trim()));
  }, [activePage.id]);

  const handleNavFilter = (next: string) => {
    setFilterTouched(true);
    setNavFilter(next);
  };

  /**
   * The cascade belongs to ENTERING a section — not to any later edit of the
   * list. The containers key on the SECTION id, so typing never remounts them,
   * but a row that newly matches would still mount at `hidden` and fade in
   * alone; `initial={false}` makes late arrivals inherit `visible`.
   *
   * Gate on "has the filter been TOUCHED", not on "is a filter active": keying
   * off `navFilter` being non-empty re-armed the cascade the moment the
   * operator cleared the box, so backspacing to nothing re-faded the entire
   * list they had just narrowed down. Clearing a filter is still filtering.
   */
  const rowStaggerInitial: 'hidden' | false = filterTouched ? false : 'hidden';

  /**
   * A non-empty query switches the body from HIERARCHY to a flat ranked list.
   *
   * Categories answer "what exists" (recognition); search answers "take me to
   * the thing I named" (recall). Filtering the *category* buttons served
   * neither: typing a page's exact name returned a section that did not contain
   * the word, and the operator still had to drill and re-scan. Tree at rest,
   * flat while searching — the same switch VS Code / Linear / Notion make.
   */
  const searching = navFilter.trim().length > 0;

  const destinations = useMemo(
    // `otherPages` is misnamed upstream — MasterNav passes the FULL page list,
    // active page included. Merging by id rather than spreading keeps this
    // correct under either contract; spreading duplicated every destination of
    // the active page under an identical key, so the keyboard cursor lit two
    // rows at once and React saw duplicate children.
    () => {
      const seen = new Set(otherPages.map((p) => p.id));
      const pages = seen.has(activePage.id) ? otherPages : [activePage, ...otherPages];
      return buildNavDestinations(pages);
    },
    [activePage, otherPages],
  );
  const results = useMemo(
    () => (searching ? searchNav(destinations, navFilter) : []),
    [searching, destinations, navFilter],
  );

  /** Keyboard cursor into `results`. Reset whenever the result set changes. */
  const [cursor, setCursor] = useState(0);
  useEffect(() => {
    setCursor(0);
  }, [navFilter]);
  const activeResultKey = results[cursor]?.item.key ?? null;

  const goToDestination = (destination: NavDestination) => {
    onNavigate(destination.pageId, destination.childId);
  };

  /**
   * ↓/↑/Enter from the filter box. A filter with results and no keyboard makes
   * the operator type, lift, and aim — which is the whole cost the box was
   * meant to remove. Escape clears (and only then blurs), so one key gets back
   * to the map.
   */
  const handleFilterKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!searching || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const picked = results[cursor]?.item;
      if (picked) {
        goToDestination(picked);
        handleNavFilter('');
      }
    }
  };

  const topPages = otherPages.filter((p) => p.kind === 'top');
  const bottomPages = otherPages.filter((p) => (p.kind ?? 'bottom') === 'bottom');
  const neutralAccent = spineAccentFor(null);

  /**
   * A child row — a page's child page, or a station inside a subgroup.
   *
   * **It keeps its glyph**, at the SAME light page stroke as its parent. These
   * rows are the switch between siblings of one page (Reference ⇄ Manuals ⇄
   * Labels), and that is the same job — and the same icon set — the GlobalHeader
   * page switcher draws with glyphs. Dropping them here would leave the app's two
   * doors onto one destination disagreeing about whether it has a face.
   *
   * Hierarchy is carried by the indent (`pl-7`), the caption/medium type against
   * the parent's body/semibold, and the muted ink — never by a heavier stroke.
   * A child glyph at the L2 weight (2.25) would out-draw its own parent at 1.5,
   * which inverts the ladder it was supposed to express.
   */
  const renderChildLikeRow = (
    opts: {
      id: string;
      label: string;
      icon: SidebarPageNav['icon'];
      active: boolean;
      onClick: () => void;
      onMouseEnter?: () => void;
    },
    accent: SpineAccentClasses,
  ) => {
    const RowIcon = opts.icon;
    return (
      <button
        type="button"
        onClick={opts.onClick}
        onMouseEnter={opts.onMouseEnter}
        className={cn(
          'ds-raw-button group flex w-full items-center gap-2 rounded-md py-1 pl-7 pr-2 text-left transition-colors duration-150',
          opts.active ? accent.childActive : accent.childIdle,
        )}
      >
        {RowIcon ? (
          <RowIcon
            className={navIconStrokeClass(
              'page',
              cn(
                'h-3.5 w-3.5 shrink-0',
                opts.active ? accent.childActiveIcon : accent.childIdleIcon,
              ),
            )}
          />
        ) : null}
        <span className="min-w-0 flex-1 truncate text-role-caption font-medium">{opts.label}</span>
      </button>
    );
  };

  const renderPageHeader = (opts: {
    label: string;
    icon: SidebarPageNav['icon'];
    active: boolean;
    count?: number;
    ariaLabel: string;
    onClick: () => void;
    onMouseEnter?: () => void;
  }, accent: SpineAccentClasses) => {
    const PageIcon = opts.icon;
    const showCount = (opts.count ?? 0) > 1;
    const header = (
      <button
        type="button"
        onClick={opts.onClick}
        onMouseEnter={opts.onMouseEnter}
        aria-label={opts.ariaLabel}
        className={cn(
          'ds-raw-button group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors duration-150',
          opts.active ? accent.activePage : accent.idlePage,
        )}
      >
        <PageIcon
          className={navIconStrokeClass(
            'page',
            cn(
              'h-3.5 w-3.5 shrink-0',
              opts.active ? accent.activePageIcon : accent.idlePageIcon,
            ),
          )}
        />
        <span className="min-w-0 flex-1 truncate text-role-body font-semibold leading-tight">{opts.label}</span>
        {showCount ? (
          <span
            className={cn(
              'shrink-0 text-role-micro font-semibold tabular-nums',
              opts.active ? 'text-white/80' : 'text-text-muted',
            )}
            aria-hidden
          >
            {opts.count}
          </span>
        ) : null}
      </button>
    );

    if (!opts.active) return header;

    return (
      <motion.div
        initial={activeWashPresence.initial}
        animate={activeWashPresence.animate}
        transition={activeWashTransition}
      >
        {header}
      </motion.div>
    );
  };

  const renderRow = (
    page: SidebarPageNav,
    keyPrefix: string,
    accent: SpineAccentClasses,
    opts?: { pinned?: boolean },
  ) => {
    const rowKey = `${keyPrefix}-${page.id}`;
    // Membership + highlight come from the page id alone. There used to be a
    // second, page-id-keyed "print alias" predicate here so a Print Stations row
    // could light up while the operator was on someone else's URL; the domain
    // split deleted those rows, and with them the only reason the spine ever
    // had to know a specific page's name.
    const isPageActive = page.id === activePage.id;
    const childCount = page.children?.length ?? 0;
    /**
     * **Children show for the ACTIVE page only** (2026-08-02), reversing
     * "modes stay always expanded" (its pre-rename name).
     *
     * That rule was affordable while a drill was on screen, because only one
     * section's pages existed at a time. Flattening removed the container and
     * with it the affordability: measured against the live registry, expanding
     * every multi-child page produces **64 rows (~1790px)** against a ~600px
     * scrollport at 1440×900 — and 43 of those 64 are child rows. A map you have
     * to scroll three times is not a map, and it fails the one thing the
     * flatten was for (lateral navigation in one click).
     *
     * Expanding only the active page keeps the whole map ~18 rows plus wherever
     * you already are. The children of the page you are ON are the ones you
     * switch between; every other page's children are one click away and named
     * by ⌘K and the flat search besides.
     */
    const hasChildren = !opts?.pinned && childCount > 1;
    const showChildren = hasChildren && isPageActive;
    return (
      <div key={rowKey}>
        {renderPageHeader(
          {
            label: page.label,
            icon: page.icon,
            active: isPageActive,
            // The count is decoupled from expansion on purpose: it means "this
            // page has N children", which is true whether or not they are drawn.
            // Tying it to `showChildren` would hide the cardinality on exactly the
            // rows whose children are NOT on screen — the rows that need it.
            count: hasChildren ? childCount : undefined,
            ariaLabel: hasChildren ? `${page.label} — ${childCount} pages` : `Go to ${page.label}`,
            onClick: () => onNavigate(page.id),
            onMouseEnter: onRowHover ? () => onRowHover(page) : undefined,
          },
          accent,
        )}

        {showChildren && page.children ? (
          <motion.ul
            role="group"
            aria-label={`${page.label} pages`}
            className="list-none p-0"
            initial={rowStaggerInitial}
            animate="visible"
            variants={framerVariants.spineRowStaggerContainer}
          >
            {page.children.map((child) => (
              <motion.li key={child.id} variants={framerVariants.spineRowStaggerItem}>
                {renderChildLikeRow(
                  {
                    id: child.id,
                    label: child.label,
                    icon: child.icon,
                    active: isPageActive && highlightedChildId === child.id,
                    onClick: () => onNavigate(page.id, child.id),
                  },
                  accent,
                )}
              </motion.li>
            ))}
          </motion.ul>
        ) : null}
      </div>
    );
  };

  /**
   * THE map — one flat scrolling list. There is no drill (2026-08-02).
   *
   * Six of the eight sections held exactly one page, so the drill charged a
   * click to reveal a row carrying the section's own name: `Catalog › Catalog`.
   * That is hierarchy with no content, and the duplicate label was the symptom
   * that made it visible.
   *
   * **Sections render NO header row of their own** — they are a `border-t`
   * between groups and nothing else. A header would re-create the duplicate the
   * flatten exists to remove (`Inventory` the group over `Inventory` the page)
   * everywhere a section shares a name with a page under it, which is most of
   * them. Every row in this list is therefore an addressable destination; what
   * a section *is* survives as the divider, plus the labelled bands ⌘K already
   * groups by and the parent `context` string on every flat search row.
   *
   * **The divider is load-bearing, not decoration.** The root axis is
   * deliberately mixed — Scan Stations is an INPUT MODEL sitting among business
   * DOMAINS — and the rule between the blocks is the only thing left saying so.
   */
  const renderMap = () => {
    const groups = SPINE_SECTIONS.map((section) => ({
      section,
      pages: pagesForSection(otherPages, section.id),
      // Hollow stays forbidden: a section whose every page was
      // permission-filtered renders nothing at all — absent, never disabled.
    })).filter((g) => g.pages.length > 0);

    return (
      <ul role="group" aria-label="Sections" className="list-none p-0">
        {groups.map(({ section, pages }, index) => {
          const accent = spineAccentFor(section.id);
          let lastSubgroup: StationSubgroupId | undefined;
          const subgroupMembers = (subgroup: StationSubgroupId) =>
            pages.filter((p) => p.kind === 'station' && p.stationSubgroup === subgroup);

          return (
            <li
              key={section.id}
              // The group's identity is its rule + its own aria-label; there is
              // no visible header row to carry the name.
              aria-label={section.label}
              className={cn(index > 0 && 'mt-1 border-t border-border-soft pt-1')}
            >
              {pages.map((page) => {
                const subgroup = page.kind === 'station' ? page.stationSubgroup : undefined;
                const def = subgroupDef(subgroup);
                const showHeader = Boolean(def && subgroup !== lastSubgroup);
                lastSubgroup = subgroup ?? undefined;

                const members = subgroup ? subgroupMembers(subgroup) : [];
                const subgroupActive = members.some((m) => m.id === activePage.id);
                const firstMember = members[0];

                return (
                  <div key={page.id}>
                    {showHeader && def && firstMember ? (
                      renderPageHeader(
                        {
                          label: def.label,
                          icon: def.icon,
                          active: subgroupActive,
                          count: members.length,
                          ariaLabel:
                            members.length > 1
                              ? `${def.label} — ${members.length} stations`
                              : `Go to ${def.label}`,
                          onClick: () => onNavigate(firstMember.id),
                          onMouseEnter: onRowHover ? () => onRowHover(firstMember) : undefined,
                        },
                        accent,
                      )
                    ) : null}
                    {subgroup
                      ? renderChildLikeRow(
                          {
                            id: page.id,
                            label: page.label,
                            icon: page.icon,
                            active: page.id === activePage.id,
                            onClick: () => onNavigate(page.id),
                            onMouseEnter: onRowHover ? () => onRowHover(page) : undefined,
                          },
                          accent,
                        )
                      : renderRow(page, section.id, accent)}
                  </div>
                );
              })}
            </li>
          );
        })}
      </ul>
    );
  };

  /**
   * One flat destination row. Deliberately NOT the section/page/child row chrome
   * from the hierarchy: those encode depth (indent, child count, chevron), and
   * depth is exactly what a flat result list has thrown away. Reusing them here
   * would draw a tree that no longer exists.
   */
  const renderResultRow = (destination: NavDestination, match: NavMatch) => {
    const Icon = destination.icon;
    const accent = spineAccentFor(destination.sectionId);
    const isCursor = destination.key === activeResultKey;
    return (
      <li key={destination.key}>
        <button
          type="button"
          role="option"
          aria-selected={isCursor}
          onClick={() => {
            goToDestination(destination);
            handleNavFilter('');
          }}
          onMouseEnter={() => {
            const page = destination.pageId === activePage.id
              ? activePage
              : otherPages.find((pg) => pg.id === destination.pageId);
            if (page) onRowHover?.(page);
          }}
          className={cn(
            'ds-raw-button group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors duration-150',
            isCursor ? accent.activePage : accent.idlePage,
          )}
        >
          <Icon
            className={navIconStrokeClass(
              'page',
              cn(
                'h-3.5 w-3.5 shrink-0',
                isCursor ? accent.activePageIcon : accent.idlePageIcon,
              ),
            )}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-role-body font-semibold leading-tight">
              {splitNavHighlight(destination.label, match.ranges).map((part, i) =>
                part.hit ? (
                  // Marks the characters that justified the row. Underline, not
                  // a fill: a background chip inside a 12px label at this
                  // density reads as a second chip beside the section eyebrow.
                  <span key={i} className="underline decoration-2 underline-offset-2">
                    {part.text}
                  </span>
                ) : (
                  <span key={i}>{part.text}</span>
                ),
              )}
            </span>
            {destination.context ? (
              <span
                className={cn(
                  'block truncate text-role-micro uppercase tracking-widest',
                  isCursor ? 'text-white/70' : 'text-text-faint',
                )}
              >
                {destination.context}
              </span>
            ) : null}
          </span>
        </button>
      </li>
    );
  };

  const renderSearchResults = () => (
    <ul role="listbox" aria-label="Matching destinations" className="list-none p-0">
      {results.length === 0 ? (
        // Names the query back. "No results" leaves the operator unsure whether
        // the place does not exist or the box simply is not working.
        <li className="px-2 py-2 text-role-caption text-text-muted">
          No destination matches “{navFilter.trim()}”
        </li>
      ) : (
        results.map(({ item, match }) => renderResultRow(item, match))
      )}
    </ul>
  );

  return (
    <div role="menu" aria-label="Pages" className={cn('flex h-full min-h-0 flex-col', className)}>
      {topPages.length > 0 ? (
        <div className="shrink-0 border-b border-border-soft p-1">
          {topPages.map((page) => renderRow(page, 'top', neutralAccent, { pinned: true }))}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        <AnimatePresence mode="wait" initial={false}>
          {/* Keyed on the MODE, not the query: typing must update the list in
              place, never replay the crossfade on every keystroke. The swap
              animates once, when the body changes what KIND of thing it is —
              the map (hierarchy) or the ranked results (flat). That is now the
              body's only swap; the drill it was built for is gone. */}
          <motion.div
            key={searching ? 'search' : 'map'}
            initial={bodySwapPresence.initial}
            animate={bodySwapPresence.animate}
            exit={bodySwapPresence.exit}
            transition={bodySwapTransition}
          >
            {searching ? renderSearchResults() : renderMap()}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="shrink-0">
        {/* One placeholder, because the box now does ONE thing everywhere: it
            searches every destination. It used to say "Filter sections…" at the
            root and "Filter pages…" in a drill — two behaviours from one field,
            and the root one described filtering categories rather than finding
            a page. */}
        {/* `density="row"` — the spine's band sits in a list of 30px rows, so
            the station rails' 49px dock inset read as a separate surface. The
            32px field is untouched (it is the floor's touch target); only the
            band's own vertical padding goes. */}
        <TechRailSearchBar
          value={navFilter}
          onChange={handleNavFilter}
          onKeyDown={handleFilterKeyDown}
          placeholder="Go to…"
          density="row"
        />
        {bottomPages.length > 0 ? (
          <div className="border-t border-border-soft p-1">
            {bottomPages.map((page) => renderRow(page, 'bottom', neutralAccent, { pinned: true }))}
          </div>
        ) : null}
        <StaffAccountFooter />
      </div>
    </div>
  );
}
