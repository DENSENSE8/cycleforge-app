'use client';

import { Fragment } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronLeft, ChevronRight, ShelvingUnit } from '@/components/Icons';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import {
  MAIN_GROUPS,
  STATION_GROUPS,
  STOCK_DRILL,
  type MainGroupId,
  type SidebarPageNav,
  type SpineDrillId,
  type StationGroupId,
} from '@/lib/sidebar-navigation';
import { cn } from '@/utils/_cn';

const spring = { type: 'spring', stiffness: 520, damping: 36 } as const;
const softSpring = { type: 'spring', stiffness: 320, damping: 30 } as const;

/** Scrollable L1 groups on the root list — Stock is a drill row after Stations. */
const SCROLL_GROUPS: ReadonlyArray<{ kind: 'main' | 'station'; label: string }> = [
  { kind: 'main', label: 'Main' },
  { kind: 'station', label: 'Stations' },
];

/**
 * The page list inside the sidebar spine — Main / Stations on the root, Stock
 * as a Vercel-style drill-in (chevron → back + children), Settings + Admin pinned.
 *
 * **Hybrid (not full Vercel):** Stations Floor/Desk stay always-visible so the
 * floor jump map is never replaced. Stock collapses Products → Inventory →
 * Warehouse behind one root row. Modes stay accordion + GlobalHeader Mode —
 * never a second drill altitude. Brief:
 * `docs/todo/spine-drill-in-vercel-GEMINI-RESEARCH-BRIEFING.md`.
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
  /** Active section drill (`stock`) or null for the root map. */
  drillId: SpineDrillId | null;
  onDrillChange: (id: SpineDrillId | null) => void;
  className?: string;
}

function mainGroupOf(page: SidebarPageNav): MainGroupId | null {
  return page.kind === 'main' ? page.mainGroup : null;
}

function stationGroupOf(page: SidebarPageNav): StationGroupId | null {
  return page.kind === 'station' ? page.stationGroup : null;
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

  const bottomPages = otherPages.filter((p) => (p.kind ?? 'bottom') === 'bottom');
  const stockPages = otherPages.filter((p) => p.kind === 'stock');
  const stockActive = activePage.kind === 'stock';

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
            isPageActive ? 'bg-blue-600 text-white' : 'hover:bg-surface-canvas',
          )}
        >
          <PageIcon
            className={navIconStrokeClass(
              'page',
              cn('h-3.5 w-3.5 shrink-0', isPageActive ? 'text-white' : 'text-text-muted'),
            )}
          />
          <span className="min-w-0 flex-1 truncate text-role-eyebrow font-semibold">{page.label}</span>
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
              <motion.span
                animate={{ rotate: open ? 180 : 0 }}
                transition={spring}
                className={isPageActive ? 'text-white' : 'text-text-muted'}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </motion.span>
            </span>
          )}
        </button>
        <AnimatePresence initial={false}>
          {open && expandable && page.modes && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={rowTransition}
              className="overflow-hidden"
            >
              <div className="ml-3.5 space-y-0.5 border-l border-border-soft py-1 pl-2 pr-1">
                {page.modes.map((mode, i) => {
                  const ModeIcon = mode.icon;
                  const isModeActive = isPageActive && mode.id === highlightedModeId;
                  const showGroupHeader = mode.group && mode.group !== page.modes![i - 1]?.group;
                  return (
                    <Fragment key={mode.id}>
                      {showGroupHeader && (
                        <p className="px-2 pb-0.5 pt-1.5 text-role-micro uppercase tracking-widest text-text-muted/70">
                          {mode.group}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => onNavigate(page.id, mode.id)}
                        className={cn(
                          'ds-raw-button flex w-full items-center gap-2 rounded-md inset-cozy text-left text-role-eyebrow font-medium transition-colors',
                          isModeActive
                            ? 'bg-blue-600 text-white'
                            : 'text-text-default hover:bg-blue-600 hover:text-white',
                        )}
                      >
                        <ModeIcon className={navIconStrokeClass('mode', 'h-3.5 w-3.5 shrink-0')} />
                        <span className="min-w-0 flex-1 truncate">{mode.label}</span>
                      </button>
                    </Fragment>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const renderNestGroups = (
    pages: SidebarPageNav[],
    groups: ReadonlyArray<{ id: string; label: string }>,
    groupOf: (page: SidebarPageNav) => string | null,
    keyPrefix: string,
  ) =>
    groups.map((group) => {
      const groupPages = pages.filter((p) => groupOf(p) === group.id);
      if (groupPages.length === 0) return null;
      const headingId = `${keyPrefix}-group-${group.id}`;
      return (
        <div key={group.id}>
          <p
            id={headingId}
            className="px-2 pb-0.5 pt-1 text-role-micro uppercase tracking-widest text-text-faint"
          >
            {group.label}
          </p>
          <ul role="group" aria-labelledby={headingId} className="list-none p-0">
            {groupPages.map((page) => (
              <li key={page.id}>{renderRow(page, keyPrefix)}</li>
            ))}
          </ul>
        </div>
      );
    });

  const renderRoot = () => (
    <>
      {SCROLL_GROUPS.map((group, groupIndex) => {
        const groupPages = otherPages.filter((p) => p.kind === group.kind);
        if (groupPages.length === 0) return null;
        return (
          <div
            key={group.kind}
            className={cn(groupIndex > 0 && 'mt-1.5 border-t border-border-soft pt-1.5')}
          >
            <p className="px-2 pb-1 pt-1 text-role-eyebrow uppercase tracking-widest text-text-soft">
              {group.label}
            </p>
            {group.kind === 'main'
              ? renderNestGroups(groupPages, MAIN_GROUPS, mainGroupOf, 'main')
              : renderNestGroups(groupPages, STATION_GROUPS, stationGroupOf, 'station')}
          </div>
        );
      })}

      {stockPages.length > 0 ? (
        <div className="mt-1.5 border-t border-border-soft pt-1.5">
          <button
            type="button"
            onClick={() => onDrillChange(STOCK_DRILL.id)}
            aria-label={`Open ${STOCK_DRILL.label}`}
            className={cn(
              'ds-raw-button flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors',
              stockActive && drillId == null
                ? 'bg-surface-canvas text-text-default'
                : 'hover:bg-surface-canvas',
            )}
          >
            <ShelvingUnit
              className={navIconStrokeClass('page', 'h-3.5 w-3.5 shrink-0 text-text-muted')}
            />
            <span className="min-w-0 flex-1 truncate text-role-eyebrow font-semibold">
              {STOCK_DRILL.label}
            </span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-faint" aria-hidden />
          </button>
        </div>
      ) : null}
    </>
  );

  const renderStockDrill = () => (
    <div>
      <button
        type="button"
        onClick={() => onDrillChange(null)}
        aria-label={`Back to pages`}
        className="ds-raw-button mb-1 grid w-full grid-cols-[1.25rem_1fr_1.25rem] items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-canvas"
      >
        <ChevronLeft className="h-3.5 w-3.5 shrink-0 justify-self-start text-text-muted" aria-hidden />
        <span className="min-w-0 truncate text-center text-role-eyebrow font-semibold">
          {STOCK_DRILL.label}
        </span>
        {/* Mirror chevron column so the title stays optically centered. */}
        <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
      </button>
      <ul role="group" aria-label={STOCK_DRILL.label} className="list-none p-0">
        {stockPages.map((page) => (
          <li key={page.id}>{renderRow(page, 'stock')}</li>
        ))}
      </ul>
    </div>
  );

  return (
    <div role="menu" aria-label="Pages" className={cn('flex h-full min-h-0 flex-col', className)}>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={drillId ?? 'root'}
            initial={drillPresence.initial}
            animate={drillPresence.animate}
            exit={drillPresence.exit}
            transition={drillTransition}
          >
            {drillId === STOCK_DRILL.id ? renderStockDrill() : renderRoot()}
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
