'use client';

import { Fragment } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from '@/components/Icons';
import { useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
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
 * The page list inside the sidebar spine — Main / Stations / More in nav order,
 * each row expandable to its L2 modes.
 *
 * **This replaced `MasterNavDropdown`**, which rendered the same rows but owned
 * floating-card chrome (radius / border / fill / shadow / height cap) and an
 * `x: -10` entry slide, because it lived in an `AnchoredLayer` portal that flew
 * out over the work canvas. The spine is now the surface — it owns the card, the
 * scrollport and the enter animation — so the list is pure content and always
 * renders in flow. One nav grammar, no portal, nothing to clip it.
 *
 * A row **with modes expands rather than navigates**: the modes are the real
 * destinations, and jumping to a default the operator did not pick is a worse
 * guess than showing the choice. Modeless rows navigate. (The transient flyout
 * used to navigate on every row because a fast jump was that surface's whole
 * point; there is no such surface any more.)
 *
 * L1 page rows render each page's SoT icon (lighter page stroke); expanded L2
 * mode rows keep mode glyphs (heavier mode stroke).
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
  className?: string;
}

export function SidebarNavList({
  activePage,
  activeModeId,
  otherPages,
  expandedKey,
  onToggleRow,
  onNavigate,
  onRowHover,
  className,
}: SidebarNavListProps) {
  const highlightedModeId = activeModeId ?? activePage.modes?.[0]?.id ?? null;
  // Routed through the bridge so `prefers-reduced-motion` collapses each row's
  // height expand to an instant change.
  const rowTransition = useMotionTransition(softSpring);

  const renderRow = (page: SidebarPageNav, keyPrefix: string) => {
    const rowKey = `${keyPrefix}-${page.id}`;
    const open = expandedKey === rowKey;
    const isPageActive = page.id === activePage.id;
    const modeCount = page.modes?.length ?? 0;
    const expandable = modeCount > 1;
    const PageIcon = page.icon;
    return (
      <div key={rowKey}>
        {/*
          ONE bar, one control.

          This used to be two buttons inside a shared wrapper — label on the
          left, mode-count + chevron on the right — each with its own radius and
          its own hover fill. On an expandable row both fired the SAME handler,
          so the split bought nothing and cost plenty: hovering lit up half a
          row, the count and caret read as a separate widget parked beside the
          page rather than as that page's own metadata, and a keyboard user got
          two tab stops to the same destination. The row is the affordance, so
          the row is the button.
        */}
        <button
          type="button"
          onClick={() => (expandable ? onToggleRow(open ? null : rowKey) : onNavigate(page.id))}
          aria-expanded={expandable ? open : undefined}
          onMouseEnter={onRowHover ? () => onRowHover(page) : undefined}
          aria-label={expandable ? `${page.label} — ${modeCount} modes` : `Go to ${page.label}`}
          className={cn(
            'ds-raw-button flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors',
            isPageActive ? 'bg-blue-600 text-white' : 'hover:bg-surface-canvas',
          )}
        >
          <PageIcon
            className={navIconStrokeClass(
              'page',
              cn('h-4 w-4 shrink-0', isPageActive ? 'text-white' : 'text-text-muted'),
            )}
          />
          <span className="min-w-0 flex-1 truncate text-role-body font-semibold">{page.label}</span>
          {/* Trailing metadata, inside the bar: how many modes, and which way
              this row is currently folded. Never its own hit target. */}
          {expandable && (
            <span className="flex shrink-0 items-center gap-1.5" aria-hidden>
              <span
                className={cn(
                  'text-role-caption font-semibold tabular-nums',
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
            </span>
          )}
        </button>
        <AnimatePresence initial={false}>
          {open && page.modes && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={rowTransition}
              className="overflow-hidden"
            >
              {/*
                The spline: one hairline descending from the parent row, so a run
                of modes reads as *that page's* children at a glance rather than
                as a wall of indented text — Gestalt continuity groups them, and
                lets the eye skip the whole run when it is not the one it wants.
                `ml-4` lands the line under the page icon, so it reads as
                descending from the row instead of floating in the gutter.
              */}
              <div className="ml-4 space-y-0.5 border-l border-border-soft py-1 pl-2 pr-1">
                {page.modes.map((mode, i) => {
                  const ModeIcon = mode.icon;
                  const isModeActive = isPageActive && mode.id === highlightedModeId;
                  // Heading shown once, above the first row of each group (admin
                  // sections). Pages without grouped modes never render one.
                  const showGroupHeader = mode.group && mode.group !== page.modes![i - 1]?.group;
                  return (
                    <Fragment key={mode.id}>
                      {showGroupHeader && (
                        <p className="px-2.5 pb-0.5 pt-2 text-role-micro uppercase tracking-widest text-text-muted/70">
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
    <div role="menu" aria-label="Pages" className={cn('p-1', className)}>
      {PAGE_GROUPS.map((group) => {
        const groupPages = otherPages.filter((p) => (p.kind ?? 'bottom') === group.kind);
        if (groupPages.length === 0) return null;
        return (
          <div key={group.kind}>
            <p className="px-2.5 pb-1 pt-1.5 text-role-micro uppercase tracking-widest text-text-muted/70">
              {group.label}
            </p>
            {groupPages.map((page) => renderRow(page, group.kind))}
          </div>
        );
      })}
    </div>
  );
}
