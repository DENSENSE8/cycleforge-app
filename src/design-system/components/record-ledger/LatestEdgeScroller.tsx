'use client';

/**
 * ONE horizontal scroller for a record's left → right step rail, pinned on
 * open so its NEWEST step sits at the right edge: the operator opens a record
 * to see what is true now, and scrolls left for history (owner 2026-09-29).
 * Serves the carrier rail (`CarrierEventsRail`), the inbound floor ladder and
 * the outbound compact Fulfillment ladder.
 *
 * The newest step is the last `StepRail` step that is not `pending` (done or
 * the ringed "now"). A history rail — every step done, like the carrier's
 * scans — pins to the far right; a ladder with steps still to come pins its
 * "now" to the right edge, so the not-yet steps never push it out of view.
 *
 * Data, fonts and the responsive rail can all settle their final width after
 * first paint, so the viewport stays pinned through those layout changes (a
 * `ResizeObserver` on the content) instead of trusting one early scroll. A
 * new `latestKey` — a newer step landed — re-pins.
 */

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/utils/_cn';

export function LatestEdgeScroller({
  latestKey,
  children,
  className,
  testId,
}: {
  /** Identity of the newest step; a change re-pins to the latest edge. */
  latestKey: string | null;
  /** A `horizontalScroll` rail — its width is the content's. */
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    let frame: number | null = null;
    const pinToLatest = () => {
      const viewport = viewportRef.current;
      const content = contentRef.current;
      if (!viewport || !content) return;
      const max = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      const steps = content.querySelectorAll<HTMLElement>('[data-step-state]');
      if (steps.length === 0) {
        viewport.scrollLeft = max;
        return;
      }
      const newest = [...steps].findLast((step) => step.dataset.stepState !== 'pending');
      if (!newest) {
        viewport.scrollLeft = 0;
        return;
      }
      const right = newest.getBoundingClientRect().right - content.getBoundingClientRect().left;
      viewport.scrollLeft = Math.min(max, Math.max(0, right - viewport.clientWidth));
    };
    const schedulePin = () => {
      if (frame != null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(pinToLatest);
    };

    pinToLatest();
    schedulePin();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedulePin);
    if (observer && contentRef.current) observer.observe(contentRef.current);

    return () => {
      if (frame != null) window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [latestKey]);

  return (
    <div
      ref={viewportRef}
      className={cn('min-w-0 overflow-x-auto overscroll-x-contain pb-1 scrollbar-thin', className)}
      tabIndex={0}
      data-testid={testId}
      data-initial-edge="latest"
    >
      <div ref={contentRef} className="min-w-max">
        {children}
      </div>
    </div>
  );
}
