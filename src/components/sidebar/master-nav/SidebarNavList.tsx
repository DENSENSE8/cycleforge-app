'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from '@/components/Icons';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import {
  SPINE_SECTIONS,
  STATION_SUBGROUPS,
  spineSectionIdForPage,
  type SidebarPageNav,
  type SpineSectionId,
  type StationSubgroupId,
} from '@/lib/sidebar-navigation';
import { cn } from '@/utils/_cn';

/**
 * The page list inside the sidebar spine — section drills (Overview / Scan
 * Stations / Desk / Stock / Products / Library) replace the body with back +
 * pages. Home / Search / Media / AI Chat stay top-pinned; Settings + Admin stay
 * footer-pinned. Multi-mode pages show children always expanded with a pinned
 * mode count (no accordion chevron). Station subgroups (Receiving) reuse the
 * same page-header chrome + mode-row indent. L2 Mode also lives in GlobalHeader.
 * Motion: opacity-only {@link framerPresence.spineDrill}.
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

  const topPages = otherPages.filter((p) => p.kind === 'top');
  const bottomPages = otherPages.filter((p) => (p.kind ?? 'bottom') === 'bottom');
  const activeSectionId = spineSectionIdForPage(activePage);

  const renderModeLikeRow = (
    opts: {
      id: string;
      label: string;
      icon: SidebarPageNav['icon'];
      active: boolean;
      onClick: () => void;
      onMouseEnter?: () => void;
    },
  ) => {
    const RowIcon = opts.icon;
    return (
      <button
        type="button"
        onClick={opts.onClick}
        onMouseEnter={opts.onMouseEnter}
        className={cn(
          'ds-raw-button flex w-full items-center gap-2 rounded-md py-1 pl-7 pr-2 text-left transition-colors',
          opts.active
            ? 'bg-blue-600/15 text-blue-700'
            : 'text-text-default hover:bg-surface-canvas',
        )}
      >
        {RowIcon ? (
          <RowIcon
            className={navIconStrokeClass(
              'mode',
              cn('h-3.5 w-3.5 shrink-0', opts.active ? 'text-blue-600' : 'text-text-muted'),
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
  }) => {
    const PageIcon = opts.icon;
    const showCount = (opts.count ?? 0) > 1;
    return (
      <button
        type="button"
        onClick={opts.onClick}
        onMouseEnter={opts.onMouseEnter}
        aria-label={opts.ariaLabel}
        className={cn(
          'ds-raw-button flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors',
          opts.active
            ? 'bg-blue-600 text-white'
            : 'text-text-muted hover:bg-surface-canvas hover:text-text-default',
        )}
      >
        <PageIcon
          className={navIconStrokeClass(
            'page',
            cn('h-3.5 w-3.5 shrink-0', opts.active ? 'text-white' : 'text-text-muted'),
          )}
        />
        <span className="min-w-0 flex-1 truncate text-role-caption font-semibold">{opts.label}</span>
        {showCount ? (
          <span
            className={cn(
              'shrink-0 text-role-micro font-semibold tabular-nums',
              opts.active ? 'text-white/80' : 'text-text-muted/60',
            )}
            aria-hidden
          >
            {opts.count}
          </span>
        ) : null}
      </button>
    );
  };

  const renderRow = (page: SidebarPageNav, keyPrefix: string, opts?: { pinned?: boolean }) => {
    const rowKey = `${keyPrefix}-${page.id}`;
    const isPageActive = page.id === activePage.id;
    const modeCount = page.modes?.length ?? 0;
    const showModes = !opts?.pinned && modeCount > 1;
    return (
      <div key={rowKey}>
        {renderPageHeader({
          label: page.label,
          icon: page.icon,
          active: isPageActive,
          count: showModes ? modeCount : undefined,
          ariaLabel: showModes ? `${page.label} — ${modeCount} modes` : `Go to ${page.label}`,
          onClick: () => onNavigate(page.id),
          onMouseEnter: onRowHover ? () => onRowHover(page) : undefined,
        })}

        {showModes && page.modes ? (
          <ul role="group" aria-label={`${page.label} modes`} className="list-none p-0">
            {page.modes.map((mode) => (
              <li key={mode.id}>
                {renderModeLikeRow({
                  id: mode.id,
                  label: mode.label,
                  icon: mode.icon,
                  active: isPageActive && highlightedModeId === mode.id,
                  onClick: () => onNavigate(page.id, mode.id),
                })}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  };

  const renderRoot = () => (
    <ul role="group" aria-label="Sections" className="list-none p-0">
      {SPINE_SECTIONS.map((section, index) => {
        const groupPages = pagesForSection(otherPages, section.id);
        if (groupPages.length === 0) return null;
        const sectionActive = activeSectionId === section.id;
        return (
          <li key={section.id} className={cn(index > 0 && 'mt-0.5')}>
            <button
              type="button"
              onClick={() => onDrillChange(section.id)}
              aria-label={`Open ${section.label}`}
              className={cn(
                'ds-raw-button flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors',
                sectionActive && drillId == null
                  ? 'bg-surface-canvas text-text-default'
                  : 'text-text-muted hover:bg-surface-canvas hover:text-text-default',
              )}
            >
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

  const renderDrill = (id: SpineSectionId) => {
    const section = SPINE_SECTIONS.find((d) => d.id === id);
    if (!section) return null;
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
          className="ds-raw-button mb-1 grid w-full grid-cols-[1.25rem_1fr_1.25rem] items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-canvas"
        >
          <ChevronLeft className="h-3.5 w-3.5 shrink-0 justify-self-start text-text-muted" aria-hidden />
          <span className="min-w-0 truncate text-center text-role-caption font-semibold">
            {section.label}
          </span>
          <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
        </button>
        <ul role="group" aria-label={section.label} className="list-none p-0">
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
              <li key={page.id}>
                {showHeader && def && firstMember ? (
                  <div>
                    {renderPageHeader({
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
                    })}
                  </div>
                ) : null}
                {subgroup ? (
                  renderModeLikeRow({
                    id: page.id,
                    label: page.label,
                    icon: page.icon,
                    active: page.id === activePage.id,
                    onClick: () => onNavigate(page.id),
                    onMouseEnter: onRowHover ? () => onRowHover(page) : undefined,
                  })
                ) : (
                  renderRow(page, id)
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  return (
    <div role="menu" aria-label="Pages" className={cn('flex h-full min-h-0 flex-col', className)}>
      {topPages.length > 0 ? (
        <div className="shrink-0 border-b border-border-soft p-1">
          {topPages.map((page) => renderRow(page, 'top', { pinned: true }))}
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

      {bottomPages.length > 0 ? (
        <div className="shrink-0 border-t border-border-soft p-1">
          {bottomPages.map((page) => renderRow(page, 'bottom', { pinned: true }))}
        </div>
      ) : null}
    </div>
  );
}
