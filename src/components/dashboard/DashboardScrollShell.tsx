'use client';

import { createContext, useContext, useRef, type ReactNode, type RefObject } from 'react';
import { cn } from '@/utils/_cn';
import { zIndex } from '@/design-system/tokens/z-index';

const DashboardScrollContext = createContext<RefObject<HTMLElement | null> | null>(null);

/** Primary dashboard scroll port — virtualization targets this ancestor. */
export function useDashboardScrollParent(): RefObject<HTMLElement | null> {
  const ctx = useContext(DashboardScrollContext);
  if (!ctx) {
    throw new Error('useDashboardScrollParent must be used within DashboardScrollShell');
  }
  return ctx;
}

export interface DashboardScrollShellProps {
  children: ReactNode;
  className?: string;
  /**
   * Pinned chrome docked ABOVE the scroll body — the single always-visible top
   * bar (lifecycle tabs + filters). It lives *outside* the scroll port, so it
   * is the only sticky top layer: inner sticky elements (day-band headers) then
   * dock at `top-0` of the body directly beneath it, with **no offset math**.
   *
   * This is the house "sticky chrome outside the scroll container" pattern
   * (see {@link DateGroupHeader}) — it replaces stacking two `sticky top-*`
   * bands in one port, where the second band had to guess the first's height.
   * The chrome slot owns the `z-header` band; nothing in the body can overlap
   * it because it is a non-scrolling sibling, not a competing sticky layer.
   */
  chrome?: ReactNode;
  /**
   * Pinned chrome docked BELOW the scroll body — same outside-the-port pattern
   * as {@link chrome}. Media Library mounts {@link TableStatusBar} here so the
   * foot cannot float mid-stream when the panel overflows a `flex-1` column
   * inside the scrollport (sticky `bottom-0` alone cannot save that geometry).
   */
  footer?: ReactNode;
}

/**
 * Workbench scroll shell for Dashboard · Outbound — a non-scrolling outer
 * column that pins `chrome` on top of one vertical scroll body (KPI + tables).
 * Mirrors {@link MonitorPageShell}. Virtualization targets the scroll body via
 * {@link useDashboardScrollParent}.
 */
export function DashboardScrollShell({
  children,
  className,
  chrome,
  footer,
}: DashboardScrollShellProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <DashboardScrollContext.Provider value={scrollRef}>
      {/* No ground fill here — `appContentShellClass` (the `<main>`) owns the
          single page ground, and under receiving the context host paints the
          wash on top of it. An opaque canvas fill at this level covered that
          wash and left a tone seam at the rail edge. */}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {chrome ? (
          <div
            className="relative shrink-0"
            style={{ zIndex: zIndex.header }}
            data-dashboard-chrome
          >
            {chrome}
          </div>
        ) : null}
        <div
          ref={scrollRef}
          data-testid="dashboard-scroll"
          className={cn(
            'relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-clip',
            className,
          )}
        >
          {children}
        </div>
        {footer ? (
          <div
            className="relative shrink-0"
            style={{ zIndex: zIndex.header }}
            data-dashboard-footer
            data-testid="dashboard-footer"
          >
            {footer}
          </div>
        ) : null}
      </div>
    </DashboardScrollContext.Provider>
  );
}
