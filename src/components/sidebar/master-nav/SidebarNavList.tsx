'use client';

import { useEffect, useRef, useState } from 'react';
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
 * Scan Stations / the six business domains / Workflow Studio — the ordered SoT
 * is {@link SPINE_SECTIONS}) replace the
 * body with back + pages. Home / Search / Media / Chat stay top-pinned; a
 * footer-pinned {@link TechRailSearchBar} (same bottom band as station rails)
 * sits above Settings + Admin, then {@link StaffAccountFooter}. Always filters
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

/** Case-insensitive match against page label + mode labels. */
function pageMatchesDrillFilter(page: SidebarPageNav, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (page.label.toLowerCase().includes(q)) return true;
  return (page.modes ?? []).some((mode) => mode.label.toLowerCase().includes(q));
}

/** Root map: section label hit, or any page/mode under that section. */
function sectionMatchesNavFilter(
  sectionId: SpineSectionId,
  pages: SidebarPageNav[],
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const section = SPINE_SECTIONS.find((s) => s.id === sectionId);
  if (section?.label.toLowerCase().includes(q)) return true;
  return pagesForSection(pages, sectionId).some((page) => pageMatchesDrillFilter(page, query));
}

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
        <span className="min-w-0 flex-1 truncate text-role-caption font-semibold">{opts.label}</span>
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
    const visibleSections = SPINE_SECTIONS.filter((section) =>
      sectionMatchesNavFilter(section.id, otherPages, navFilter),
    );
    return (
      <ul role="group" aria-label="Sections" className="list-none p-0">
        {visibleSections.length === 0 ? (
          <li className="px-2 py-2 text-role-caption text-text-muted">No matching sections</li>
        ) : null}
        {visibleSections.map((section, index) => {
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
                <span className="min-w-0 flex-1 truncate text-role-caption font-semibold">
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
    const groupPages = pagesForSection(otherPages, id).filter((page) =>
      pageMatchesDrillFilter(page, navFilter),
    );
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
          <span className="min-w-0 truncate text-center text-role-caption font-semibold">
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

  return (
    <div role="menu" aria-label="Pages" className={cn('flex h-full min-h-0 flex-col', className)}>
      {topPages.length > 0 ? (
        <div className="shrink-0 border-b border-border-soft p-1">
          {topPages.map((page) => renderRow(page, 'top', neutralAccent, { pinned: true }))}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={drillId ?? 'root'}
            initial={drillPresence.initial}
            animate={drillPresence.animate}
            exit={drillPresence.exit}
            transition={drillTransition}
          >
            {drillId ? renderDrill(drillId) : renderRoot()}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="shrink-0">
        <TechRailSearchBar
          value={navFilter}
          onChange={handleNavFilter}
          placeholder={drillId ? 'Filter pages…' : 'Filter sections…'}
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
