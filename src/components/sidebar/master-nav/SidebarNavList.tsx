'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronLeft, ChevronRight } from '@/components/Icons';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import {
  SPINE_DRILLS,
  spineDrillIdForPage,
  type SidebarPageNav,
  type SpineDrillId,
} from '@/lib/sidebar-navigation';
import { cn } from '@/utils/_cn';

const softSpring = { type: 'spring', stiffness: 320, damping: 30 } as const;

/**
 * The page list inside the sidebar spine — section drills (Overview / Library /
 * Floor / Desk / Stock) replace the body with back + pages; Search + Media stay
 * top-pinned, Settings + Admin stay footer-pinned. Modes stay accordion +
 * GlobalHeader Mode — never a second drill altitude. Motion: opacity-only
 * {@link framerPresence.spineDrill}.
 */
interface SidebarNavListProps {
  activePage: SidebarPageNav;
  activeModeId: string | null;
  otherPages: SidebarPageNav[];
  /** `"${section}-${pageId}"` of the row whose modes are expanded, or null. */
  expandedKey: string | null;
  onToggleRow: (key: string | null) => void;
  onNavigate: (pageId: string, modeId?: string) => void;
  /** Hover hook per page row — warms the destination's data (nav-data-prefetch). */
  onRowHover?: (page: SidebarPageNav) => void;
  /** Active section drill or null for the root map of section buttons. */
  drillId: SpineDrillId | null;
  onDrillChange: (id: SpineDrillId | null) => void;
  className?: string;
}

function pagesForDrill(pages: SidebarPageNav[], drillId: SpineDrillId): SidebarPageNav[] {
  return pages.filter((p) => spineDrillIdForPage(p) === drillId);
}

export function SidebarNavList({
  activePage,
  activeModeId,
  otherPages,
  expandedKey,
  onToggleRow,
  onNavigate,
  onRowHover,
  drillId,
  onDrillChange,
  className,
}: SidebarNavListProps) {
  const highlightedModeId = activeModeId ?? activePage.modes?.[0]?.id ?? null;
  const rowTransition = useMotionTransition(softSpring);
  const drillPresence = useMotionPresence(framerPresence.spineDrill);
  const drillTransition = useMotionTransition(framerTransition.spineDrill);

  const topPages = otherPages.filter((p) => p.kind === 'top');
  const bottomPages = otherPages.filter((p) => (p.kind ?? 'bottom') === 'bottom');
  const activeDrillId = spineDrillIdForPage(activePage);

  const renderRow = (page: SidebarPageNav, keyPrefix: string, opts?: { pinned?: boolean }) => {
    const rowKey = `${keyPrefix}-${page.id}`;
    const open = expandedKey === rowKey;
    const isPageActive = page.id === activePage.id;
    const modeCount = page.modes?.length ?? 0;
    const expandable = !opts?.pinned && modeCount > 1;
    const PageIcon = page.icon;
    return (
      <div key={rowKey}>
        <button
          type="button"
          onClick={() => (expandable ? onToggleRow(open ? null : rowKey) : onNavigate(page.id))}
          aria-expanded={expandable ? open : undefined}
          onMouseEnter={onRowHover ? () => onRowHover(page) : undefined}
          aria-label={expandable ? `${page.label} — ${modeCount} modes` : `Go to ${page.label}`}
          className={cn(
            'ds-raw-button flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors',
            isPageActive
              ? 'bg-blue-600 text-white'
              : 'text-text-muted hover:bg-surface-canvas hover:text-text-default',
          )}
        >
          <PageIcon
            className={navIconStrokeClass(
              'page',
              cn('h-3.5 w-3.5 shrink-0', isPageActive ? 'text-white' : 'text-text-muted'),
            )}
          />
          <span className="min-w-0 flex-1 truncate text-role-caption font-semibold">{page.label}</span>
          {expandable && (
            <span className="flex shrink-0 items-center gap-1" aria-hidden>
              <span
                className={cn(
                  'text-role-micro font-semibold tabular-nums',
                  isPageActive ? 'text-white/80' : 'text-text-muted/60',
                )}
              >
                {modeCount}
              </span>
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 transition-transform',
                  open && 'rotate-180',
                  isPageActive ? 'text-white/80' : 'text-text-faint',
                )}
              />
            </span>
          )}
        </button>

        <AnimatePresence initial={false}>
          {expandable && open && page.modes ? (
            <motion.ul
              key={`${rowKey}-modes`}
              role="group"
              aria-label={`${page.label} modes`}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={rowTransition}
              className="list-none overflow-hidden p-0"
            >
              {page.modes.map((mode) => {
                const ModeIcon = mode.icon;
                const modeActive = isPageActive && highlightedModeId === mode.id;
                return (
                  <li key={mode.id}>
                    <button
                      type="button"
                      onClick={() => onNavigate(page.id, mode.id)}
                      className={cn(
                        'ds-raw-button flex w-full items-center gap-2 rounded-md py-1 pl-7 pr-2 text-left transition-colors',
                        modeActive
                          ? 'bg-blue-600/15 text-blue-700'
                          : 'text-text-default hover:bg-surface-canvas',
                      )}
                    >
                      {ModeIcon ? (
                        <ModeIcon
                          className={navIconStrokeClass(
                            'mode',
                            cn('h-3.5 w-3.5 shrink-0', modeActive ? 'text-blue-600' : 'text-text-muted'),
                          )}
                        />
                      ) : null}
                      <span className="min-w-0 flex-1 truncate text-role-caption font-medium">
                        {mode.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </motion.ul>
          ) : null}
        </AnimatePresence>
      </div>
    );
  };

  const renderRoot = () => (
    <ul role="group" aria-label="Sections" className="list-none p-0">
      {SPINE_DRILLS.map((drill, index) => {
        const groupPages = pagesForDrill(otherPages, drill.id);
        if (groupPages.length === 0) return null;
        const sectionActive = activeDrillId === drill.id;
        return (
          <li
            key={drill.id}
            className={cn(index > 0 && 'mt-0.5')}
          >
            <button
              type="button"
              onClick={() => onDrillChange(drill.id)}
              aria-label={`Open ${drill.label}`}
              className={cn(
                'ds-raw-button flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors',
                sectionActive && drillId == null
                  ? 'bg-surface-canvas text-text-default'
                  : 'text-text-muted hover:bg-surface-canvas hover:text-text-default',
              )}
            >
              <span className="min-w-0 flex-1 truncate text-role-caption font-semibold">
                {drill.label}
              </span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-faint" aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );

  const renderDrill = (id: SpineDrillId) => {
    const drill = SPINE_DRILLS.find((d) => d.id === id);
    if (!drill) return null;
    const groupPages = pagesForDrill(otherPages, id);
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
            {drill.label}
          </span>
          <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
        </button>
        <ul role="group" aria-label={drill.label} className="list-none p-0">
          {groupPages.map((page) => (
            <li key={page.id}>{renderRow(page, id)}</li>
          ))}
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
