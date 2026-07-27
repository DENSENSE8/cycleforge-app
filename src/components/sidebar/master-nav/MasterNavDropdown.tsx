'use client';

import { forwardRef, Fragment } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from '@/components/Icons';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import type { SidebarNavItem, SidebarPageNav } from '@/lib/sidebar-navigation';
import { cn } from '@/utils/_cn';

const spring = { type: 'spring', stiffness: 520, damping: 36 } as const;
const softSpring = { type: 'spring', stiffness: 320, damping: 30 } as const;

// All-pages grouping mirrors the legacy sidebar nav (Main / Stations / More),
// keyed off each page's `kind`. Pages with no kind fall into "More".
const PAGE_GROUPS: ReadonlyArray<{ kind: NonNullable<SidebarNavItem['kind']>; label: string }> = [
  { kind: 'main', label: 'Main' },
  { kind: 'station', label: 'Stations' },
  { kind: 'bottom', label: 'More' },
];

/**
 * The master-nav menu (plan §3.4): Main / Stations / More in sidebar nav order.
 * Recent jumps live in the closed header band — not duplicated here. The active
 * page only appears in its group (blue row).
 *
 * L1 page rows render each page's SoT icon (`page.icon`, lighter page stroke).
 * Expanded L2 mode rows keep mode glyphs (heavier mode stroke).
 */
interface MasterNavDropdownProps {
  activePage: SidebarPageNav;
  activeModeId: string | null;
  otherPages: SidebarPageNav[];
  /** `"${section}-${pageId}"` of the row whose modes are expanded, or null. */
  expandedKey: string | null;
  onToggleRow: (key: string | null) => void;
  onNavigate: (pageId: string, modeId?: string) => void;
  /** Hover hook per page row — warms the destination's data (nav-data-prefetch). */
  onRowHover?: (page: SidebarPageNav) => void;
  /**
   * Drop the floating card chrome (radius / border / fill / shadow). For the
   * in-flow `docked` layout, where the station column's nav card already
   * provides the surface and a second card inside it would read as nested.
   */
  flat?: boolean;
  className?: string;
}

export const MasterNavDropdown = forwardRef<HTMLDivElement, MasterNavDropdownProps>(function MasterNavDropdown(
  { activePage, activeModeId, otherPages, expandedKey, onToggleRow, onNavigate, onRowHover, flat = false, className },
  ref,
) {
  const highlightedModeId = activeModeId ?? activePage.modes?.[0]?.id ?? null;

  const renderRow = (page: SidebarPageNav, keyPrefix: string) => {
    const rowKey = `${keyPrefix}-${page.id}`;
    const open = expandedKey === rowKey;
    const isPageActive = page.id === activePage.id;
    const modeCount = page.modes?.length ?? 0;
    const PageIcon = page.icon;
    return (
      <div key={rowKey}>
        <div
          className={cn(
            'flex items-stretch overflow-hidden rounded-xl transition-colors',
            isPageActive && 'bg-blue-600',
          )}
        >
          {/* Left: go straight to the page's default mode. Icon + label. */}
          <button
            type="button"
            onClick={() => onNavigate(page.id)}
            onMouseEnter={onRowHover ? () => onRowHover(page) : undefined}
            aria-label={`Go to ${page.label}`}
            className={cn(
              'ds-raw-button flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left transition-colors',
              isPageActive ? 'text-white' : 'rounded-xl hover:bg-surface-canvas',
            )}
          >
            <PageIcon
              className={navIconStrokeClass(
                'page',
                cn('h-4 w-4 shrink-0', isPageActive ? 'text-white' : 'text-text-muted'),
              )}
            />
            <span className="min-w-0 flex-1 truncate text-role-body font-semibold">{page.label}</span>
          </button>
          {/* Right: expand / collapse this page's modes (no-op if 0/1 mode). */}
          {modeCount > 1 && (
            <button
              type="button"
              onClick={() => onToggleRow(open ? null : rowKey)}
              aria-expanded={open}
              aria-label={`${modeCount} modes`}
              className={cn(
                'ds-raw-button flex shrink-0 items-center gap-1.5 px-2.5 py-2 transition-colors',
                isPageActive ? 'text-white/90 hover:text-white' : 'rounded-xl hover:bg-surface-canvas',
              )}
            >
              <span
                className={cn(
                  'text-role-caption font-bold tabular-nums',
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
                <ChevronDown className="h-4 w-4" />
              </motion.span>
            </button>
          )}
        </div>
        <AnimatePresence initial={false}>
          {open && page.modes && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={softSpring}
              className="overflow-hidden"
            >
              <div className={/* ds-allow-spacing — indent mode rows under page label */ 'space-y-0.5 py-1 pl-3 pr-1'}>
                {page.modes.map((mode, i) => {
                  const ModeIcon = mode.icon;
                  const isModeActive = isPageActive && mode.id === highlightedModeId;
                  // Heading shown once, above the first row of each group (admin
                  // sections). Pages without grouped modes never render one.
                  const showGroupHeader = mode.group && mode.group !== page.modes![i - 1]?.group;
                  return (
                    <Fragment key={mode.id}>
                      {showGroupHeader && (
                        <p className="px-2.5 pb-0.5 pt-2 text-role-micro font-bold uppercase tracking-widest text-text-muted/70">
                          {mode.group}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => onNavigate(page.id, mode.id)}
                        className={cn(
                          'ds-raw-button flex w-full items-center gap-2.5 rounded-lg inset-cozy text-left text-role-data font-medium transition-colors',
                          isModeActive
                            ? 'bg-blue-600 text-white'
                            : 'text-text-default hover:bg-blue-600 hover:text-white',
                        )}
                      >
                        <ModeIcon className={navIconStrokeClass('mode', 'h-4 w-4 shrink-0')} />
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

  return (
    <motion.div
      ref={ref}
      initial={flat ? false : { opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={flat ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
      transition={softSpring}
      className={cn(
        'max-h-[340px] overflow-y-auto p-1',
        !flat && 'z-dropdown rounded-2xl border border-border-soft bg-surface-card shadow-xl shadow-slate-900/10',
        className,
      )}
    >
      {PAGE_GROUPS.map((group) => {
        const groupPages = otherPages.filter((p) => (p.kind ?? 'bottom') === group.kind);
        if (groupPages.length === 0) return null;
        return (
          <div key={group.kind}>
            <p className="px-2.5 pb-1 pt-1.5 text-role-micro font-bold uppercase tracking-widest text-text-muted/70">{group.label}</p>
            {groupPages.map((page) => renderRow(page, group.kind))}
          </div>
        );
      })}
    </motion.div>
  );
});
