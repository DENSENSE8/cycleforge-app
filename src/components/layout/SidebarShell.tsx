'use client';

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { SIDEBAR_GUTTER, sidebarHeaderPillRowClass } from '@/components/layout/header-shell';
import { SidebarRailScrollport } from '@/components/sidebar/rail-shell/SidebarRailScrollport';
import { FilterRefinementBar, type FilterRefinementBarProps } from '@/design-system/components/FilterRefinementBar';

/**
 * The ONE layout shell for every master sidebar.
 *
 * Search is NOT a sidebar concern: the global header pill
 * ({@link GlobalHeaderSearch}) is the single search surface. Page-scoped lookup
 * goes through the AI assistant. The sidebar renders NO search band — enforced
 * by `sidebar-search-bar.guard.test.ts`.
 *
 * The shell owns the structure so panels supply only slots, never layout:
 *
 *   h-full flex flex-col overflow-hidden     ← outer column (never scrolls)
 *     headerAbove                            ← pinned: filterControl / eyebrow / facet filters
 *     <FilterRefinementBar/> (optional)      ← the glassmorphic filter pill
 *     headerRows[]  (each a 40px pill band)  ← pinned: sub-tabs / field scopes / chips
 *                                            (NOT page L2 — that lives in GlobalHeader)
 *     headerBelow                            ← pinned, non-banded, OUTSIDE the scroll
 *     children  (flex-1 overflow-y-auto)     ← the only scrolling region
 *     footer                                 ← pinned bottom, OUTSIDE the scroll
 */
export interface SidebarShellProps {
  /**
   * Optional configuration for a unified filter bar. When provided, the shell
   * renders a `<FilterRefinementBar variant="sidebar">` at the top of the panel.
   * This is a structured refinement UI, NOT a text-search band — search lives in
   * the global header (see file header).
   */
  filter?: Omit<FilterRefinementBarProps, 'variant'>;

  /** Pinned rows ABOVE the filter (filterControl, section eyebrow, mode rail).
   *  Rendered raw, in order — the panel decides whether to band/gutter each. */
  headerAbove?: ReactNode;

  /** Pinned 40px rows BELOW the filter (tab pills, field-scope pills, chips).
   *  The shell wraps each in `sidebarHeaderPillRowClass`, so panels never
   *  hand-wrap the band. Falsy entries are skipped (conditional rows). */
  headerRows?: Array<ReactNode | false | null | undefined>;

  /** Pinned, non-banded block below the rows and OUTSIDE the scroll body — for
   *  filter popovers / refresh buttons whose absolute menus would otherwise be
   *  clipped by the body's `overflow-y-auto` (e.g. Receiving). */
  headerBelow?: ReactNode;

  /** The scroll body. Shell owns `flex-1 overflow-y-auto ${SIDEBAR_GUTTER} pt-4`. */
  children?: ReactNode;

  /** Extra classes for the scroll body (e.g. `space-y-4`, `scrollbar-hide`, `pb-6`). */
  bodyClassName?: string;

  /**
   * When true, the body uses {@link SidebarRailScrollport} (flat bottom
   * more-below fade) instead of a raw overflow div. Enable for recent-activity
   * feeds (Labels, Dashboard Recents).
   */
  scrollMoreBelow?: boolean;

  /** Pinned block BELOW the scroll body, at the very bottom of the sidebar and
   *  OUTSIDE the scroll — e.g. an always-available dock scan bar. */
  footer?: ReactNode;

  /** Outer container element. Pass a framer `motion.div` for stagger panels;
   *  `containerProps` (initial/animate/variants) spread onto it. */
  as?: React.ElementType;
  containerProps?: Record<string, unknown>;
  className?: string;
}

export function SidebarShell({
  filter,
  headerAbove,
  headerRows,
  headerBelow,
  children,
  bodyClassName,
  scrollMoreBelow = false,
  footer,
  as: Container = 'div',
  containerProps,
  className,
}: SidebarShellProps) {
  return (
    <Container
      {...containerProps}
      className={cn('flex h-full flex-col overflow-hidden', className)}
    >
      {headerAbove}

      {filter && (
        // Default (glassmorphic pill) variant, floated with the house gutter —
        // the house pill variant, not the old flat 40px band.
        <div className={cn('relative z-30 shrink-0 bg-surface-card py-2', SIDEBAR_GUTTER)}>
          <FilterRefinementBar {...filter} />
        </div>
      )}

      {headerRows?.map((row, i) =>
        row ? (
          <div key={i} className={sidebarHeaderPillRowClass}>
            {row}
          </div>
        ) : null,
      )}

      {headerBelow ? <div className="shrink-0">{headerBelow}</div> : null}

      {children != null ? (
        scrollMoreBelow ? (
          <SidebarRailScrollport bodyClassName={cn(SIDEBAR_GUTTER, 'pt-4', bodyClassName)}>
            {children}
          </SidebarRailScrollport>
        ) : (
          <div className={cn('min-h-0 flex-1 overflow-y-auto', SIDEBAR_GUTTER, 'pt-4', bodyClassName)}>
            {children}
          </div>
        )
      ) : null}

      {footer ? <div className="shrink-0">{footer}</div> : null}
    </Container>
  );
}
