'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from '@/design-system/motion';
import { ChevronLeft, ChevronRight } from '@/components/Icons';
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
  SPINE_ICON_LIFT_CLASS,
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
 * The page list inside the sidebar spine — section drills (Analytics Monitor /
 * Scan Stations / the six business domains — the ordered SoT is
 * {@link SPINE_SECTIONS}) replace the
 * body with back + pages. Home / Search / Media / Chat stay top-pinned; a
 * footer-pinned {@link TechRailSearchBar} (`density="row"`, so the band measures
 * a nav row rather than a station rail's dock) sits above the footer band —
 * Workflow Studio · Admin · Settings — then {@link StaffAccountFooter}. Always filters
 * the visible map (root sections or the open drill's pages). Multi-mode pages
 * show children always expanded with a pinned mode count (no accordion
 * chevron). Station subgroups (Receiving) reuse the same page-header chrome +
 * mode-row indent. L2 Mode also lives in GlobalHeader. Motion: opacity-only
 * {@link framerPresence.spineDrill} + named active-wash SoT, and ONE row cascade
 * ({@link framerVariants.spineRowStaggerContainer}) shared by drill page rows
 * and the mode rows nested under them. Accents: {@link spineAccentFor}; icon
 * hover/press travel: {@link SPINE_ICON_LIFT_CLASS} (pure CSS — the spine never
 * mounts a framer `whileHover`, and the row itself never moves or scales).
 *
 * The ROOT section map mounts instantly, on purpose: it is the first thing
 * painted on every cold load, so a cascade there is time-to-interactive spent
 * on five buttons the operator already knows the position of. The cascade earns
 * its keep inside a drill, where the list is long and its contents change.
 */
interface SidebarNavListProps {
  activePage: SidebarPageNav;
  activeModeId: string | null;
  otherPages: SidebarPageNav[];
  onNavigate: (pageId: string, modeId?: string) => void;
  /** Hover hook per page row — warms the destination's data (nav-data-prefetch). */
  onRowHover?: (page: SidebarPageNav) => void;
  /** Active section drill or null for the root map of section buttons. */
  drillId: SpineSectionId | null;
  onDrillChange: (id: SpineSectionId | null) => void;
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
  activeModeId,
  otherPages,
  onNavigate,
  onRowHover,
  drillId,
  onDrillChange,
  className,
}: SidebarNavListProps) {
  const highlightedModeId = activeModeId ?? activePage.modes?.[0]?.id ?? null;
  const drillPresence = useMotionPresence(framerPresence.spineDrill);
  const drillTransition = useMotionTransition(framerTransition.spineDrill);
  const activeWashPresence = useMotionPresence(framerPresence.spineActiveWash);
  const activeWashTransition = useMotionTransition(framerTransition.spineActiveWash);
  const [navFilter, setNavFilter] = useState('');
  const navFilterRef = useRef(navFilter);
  navFilterRef.current = navFilter;
  /**
   * Has the operator touched the footer filter yet? Not "is a filter active" —
   * see {@link rowStaggerInitial}. On section enter, an empty query re-arms the
   * cascade; a preserved non-empty query keeps `touched` so the list does not
   * re-fade under the cursor.
   */
  const [filterTouched, setFilterTouched] = useState(false);

  useEffect(() => {
    setFilterTouched(Boolean(navFilterRef.current.trim()));
  }, [drillId]);

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
    onNavigate(destination.pageId, destination.modeId);
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
  const activeSectionId = spineSectionIdForPage(activePage);
  const drillAccent = spineAccentFor(drillId);
  const neutralAccent = spineAccentFor(null);

  const renderModeLikeRow = (
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
          opts.active ? accent.modeActive : accent.modeIdle,
        )}
      >
        {RowIcon ? (
          <RowIcon
            className={navIconStrokeClass(
              'mode',
              cn(
                'h-3.5 w-3.5 shrink-0',
                SPINE_ICON_LIFT_CLASS,
                opts.active ? accent.modeActiveIcon : accent.modeIdleIcon,
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
              SPINE_ICON_LIFT_CLASS,
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
    const modeCount = page.modes?.length ?? 0;
    const showModes = !opts?.pinned && modeCount > 1;
    return (
      <div key={rowKey}>
        {renderPageHeader(
          {
            label: page.label,
            icon: page.icon,
            active: isPageActive,
            count: showModes ? modeCount : undefined,
            ariaLabel: showModes ? `${page.label} — ${modeCount} modes` : `Go to ${page.label}`,
            onClick: () => onNavigate(page.id),
            onMouseEnter: onRowHover ? () => onRowHover(page) : undefined,
          },
          accent,
        )}

        {showModes && page.modes ? (
          <motion.ul
            role="group"
            aria-label={`${page.label} modes`}
            className="list-none p-0"
            initial={rowStaggerInitial}
            animate="visible"
            variants={framerVariants.spineRowStaggerContainer}
          >
            {page.modes.map((mode) => (
              <motion.li key={mode.id} variants={framerVariants.spineRowStaggerItem}>
                {renderModeLikeRow(
                  {
                    id: mode.id,
                    label: mode.label,
                    icon: mode.icon,
                    active: isPageActive && highlightedModeId === mode.id,
                    onClick: () => onNavigate(page.id, mode.id),
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

  const renderRoot = () => {
    // The resting map is the WHOLE map — narrowing happens in the search body.
    return (
      <ul role="group" aria-label="Sections" className="list-none p-0">
        {SPINE_SECTIONS.map((section, index) => {
          const groupPages = pagesForSection(otherPages, section.id);
          if (groupPages.length === 0) return null;
          const sectionActive = activeSectionId === section.id;
          const SectionIcon = section.icon;
          const accent = spineAccentFor(section.id);
          return (
            <li key={section.id} className={cn(index > 0 && 'mt-0.5')}>
              <button
                type="button"
                onClick={() => onDrillChange(section.id)}
                aria-label={`Open ${section.label}`}
                className={cn(
                  'ds-raw-button group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors duration-150',
                  sectionActive && drillId == null ? accent.sectionActive : accent.sectionIdle,
                )}
              >
                <SectionIcon
                  className={navIconStrokeClass(
                    'page',
                    cn(
                      'h-3.5 w-3.5 shrink-0',
                      SPINE_ICON_LIFT_CLASS,
                      sectionActive && drillId == null
                        ? accent.sectionActiveIcon
                        : accent.sectionIdleIcon,
                    ),
                  )}
                />
                <span className="min-w-0 flex-1 truncate text-role-body font-semibold leading-tight">
                  {section.label}
                </span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-faint" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    );
  };

  const renderDrill = (id: SpineSectionId) => {
    const section = SPINE_SECTIONS.find((d) => d.id === id);
    if (!section) return null;
    const accent = drillAccent;
    const groupPages = pagesForSection(otherPages, id);
    let lastSubgroup: StationSubgroupId | undefined;

    const subgroupMembers = (subgroup: StationSubgroupId) =>
      groupPages.filter(
        (p) => p.kind === 'station' && p.stationSubgroup === subgroup,
      );

    return (
      <div>
        <button
          type="button"
          onClick={() => onDrillChange(null)}
          aria-label="Back to pages"
          className="ds-raw-button mb-1 grid w-full grid-cols-[1.25rem_1fr_1.25rem] items-center gap-2 rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-surface-canvas"
        >
          <ChevronLeft className="h-3.5 w-3.5 shrink-0 justify-self-start text-text-muted" aria-hidden />
          <span className="min-w-0 truncate text-center text-role-body font-semibold leading-tight">
            {section.label}
          </span>
          <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
        </button>
        <motion.ul
          role="group"
          aria-label={section.label}
          className="list-none p-0"
          key={`drill-rows-${section.id}`}
          initial={rowStaggerInitial}
          animate="visible"
          variants={framerVariants.spineRowStaggerContainer}
        >
          {groupPages.length === 0 ? (
            <li className="px-2 py-2 text-role-caption text-text-muted">No matching pages</li>
          ) : null}
          {groupPages.map((page) => {
            const subgroup =
              page.kind === 'station' ? page.stationSubgroup : undefined;
            const def = subgroupDef(subgroup);
            const showHeader = Boolean(def && subgroup !== lastSubgroup);
            if (subgroup) lastSubgroup = subgroup;
            else lastSubgroup = undefined;

            const members = subgroup ? subgroupMembers(subgroup) : [];
            const subgroupActive = members.some((m) => m.id === activePage.id);
            const firstMember = members[0];

            return (
              <motion.li key={page.id} variants={framerVariants.spineRowStaggerItem}>
                {showHeader && def && firstMember ? (
                  <div>
                    {renderPageHeader(
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
                    )}
                  </div>
                ) : null}
                {subgroup ? (
                  renderModeLikeRow(
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
                ) : (
                  renderRow(page, id, accent)
                )}
              </motion.li>
            );
          })}
        </motion.ul>
      </div>
    );
  };

  /**
   * One flat destination row. Deliberately NOT the section/page/mode row chrome
   * from the hierarchy: those encode depth (indent, mode count, chevron), and
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
                SPINE_ICON_LIFT_CLASS,
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
              animates once, when the body changes what kind of thing it is. */}
          <motion.div
            key={searching ? 'search' : (drillId ?? 'root')}
            initial={drillPresence.initial}
            animate={drillPresence.animate}
            exit={drillPresence.exit}
            transition={drillTransition}
          >
            {searching ? renderSearchResults() : drillId ? renderDrill(drillId) : renderRoot()}
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
