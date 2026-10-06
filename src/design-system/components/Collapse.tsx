'use client';

/**
 * Collapse — the ONE way a box animates its height open and shut.
 *
 * Why a primitive (2026-09-27): a hand-rolled `motion.div` with
 * `animate={{ height: 'auto' }}` animates ONLY its own height. Any space the
 * layout gives it from outside — the parent's flex / grid `gap`, a
 * `space-y-*` margin, its own `mt-*` — is not animated: it appears in one
 * frame on mount and vanishes in one frame on unmount. That is the
 * "closes, then a final hiccup" snap (measured on the order card's quick look:
 * height reached 0 at 210 ms, then the card dropped the parent's 8 px gap at
 * 460 ms when the box unmounted).
 *
 * Collapse measures that outside spacing on mount and moves it INSIDE the
 * animated height (a negative margin cancels it outside, padding carries it
 * inside), so the surrounding layout depends only on the height being
 * animated. Height uses the critically damped `springSnappy` (no overshoot),
 * opacity `fadeInstant`.
 *
 * - `<Collapse open>` — a region that opens and closes in place.
 * - `<CollapseItem>` — one row of a list whose rows come and go; the caller
 *   owns the `<AnimatePresence>` and keys each item.
 *
 * The animated frame never takes padding, border or background (that would
 * give it height at 0) and callers cannot give it any: `className` styles the
 * content box inside it; `subgrid` is the one placement it knows (a row of
 * its parent's column grid — frame, spacing box and content all subgrid).
 */

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, type Transition } from '../motion/react';
import { fadeInstant, springSnappy } from '../motion/tokens';
import { cn } from '@/utils/_cn';

const HIDDEN = { height: 0, opacity: 0 } as const;
const SHOWN = { height: 'auto', opacity: 1 } as const;
const TRANSITION: Transition = { height: springSnappy, opacity: fadeInstant };
/** A full row of the parent grid that keeps the parent's columns. */
const SUBGRID = 'col-span-full grid grid-cols-subgrid';

/** Space the layout gives the box on each edge, split into what came from the parent's gap vs the box's own margin. */
interface EdgeSpacing {
  gapTop: number;
  gapBottom: number;
  marginTop: number;
  marginBottom: number;
}

const NO_SPACING: EdgeSpacing = { gapTop: 0, gapBottom: 0, marginTop: 0, marginBottom: 0 };

/** A sibling that takes part in the parent's gap — absolute / fixed / hidden boxes do not. */
function inFlowSibling(el: Element, direction: 'previous' | 'next'): Element | null {
  let sibling = direction === 'previous' ? el.previousElementSibling : el.nextElementSibling;
  while (sibling) {
    const style = getComputedStyle(sibling);
    if (style.display !== 'none' && style.position !== 'absolute' && style.position !== 'fixed') return sibling;
    sibling = direction === 'previous' ? sibling.previousElementSibling : sibling.nextElementSibling;
  }
  return null;
}

/**
 * The spacing this box owns in its parent's flow. A stacking parent (column
 * flex, or grid) puts one `row-gap` between this box and a neighbour: the
 * one above when there is one, else the one below — exactly the gap that
 * disappears when the box does.
 */
function measureEdgeSpacing(el: HTMLElement): EdgeSpacing {
  const own = getComputedStyle(el);
  const spacing: EdgeSpacing = {
    gapTop: 0,
    gapBottom: 0,
    marginTop: parseFloat(own.marginTop) || 0,
    marginBottom: parseFloat(own.marginBottom) || 0,
  };
  const parent = el.parentElement;
  if (!parent) return spacing;
  const layout = getComputedStyle(parent);
  const stacks =
    (layout.display.endsWith('flex') && layout.flexDirection.startsWith('column')) || layout.display.endsWith('grid');
  const gap = stacks ? parseFloat(layout.rowGap) || 0 : 0;
  if (!gap) return spacing;
  if (inFlowSibling(el, 'previous')) spacing.gapTop = gap;
  else if (inFlowSibling(el, 'next')) spacing.gapBottom = gap;
  return spacing;
}

type CollapseTag = 'div' | 'li';

/**
 * A hairline between consecutive rows, drawn by a pseudo-element so it adds no height of its own.
 * `isolate` + `z-10` keep it ABOVE the row's content: a row whose card is
 * positioned / transformed with an opaque fill (a RecordCard `<article>`, a
 * sliding motion box) otherwise paints over the rule and the divider vanishes.
 */
const ROW_RULE =
  'relative isolate [&+&]:before:pointer-events-none [&+&]:before:absolute [&+&]:before:inset-x-4 [&+&]:before:top-px [&+&]:before:z-10 [&+&]:before:h-px [&+&]:before:bg-border-hairline';

interface CollapseItemProps {
  children: ReactNode;
  /** Styles the content inside the animated frame (padding, background, layout). */
  className?: string;
  /** Stacking/positioning that belongs on the animated frame itself. */
  frameClassName?: string;
  /** The item is one full row of its parent's column grid and keeps those columns (`grid-cols-subgrid`). */
  subgrid?: boolean;
  /** `li` when the item is a list row. */
  as?: CollapseTag;
  /** Grow in on mount (default). `false` = paint at full height and only collapse on exit (a list row that may leave). */
  enter?: boolean;
  /** Consecutive items draw a hairline between them. */
  rowRule?: boolean;
  /** Stagger for rows unfolding together (seconds). */
  delay?: number;
  /**
   * Seconds the height collapse waits on exit — a row whose content leaves
   * first (a swipe-dismissed card sliding off) closes its gap after it.
   */
  exitDelay?: number;
  /**
   * The open and close timing, when the surface's motion is a tween rather
   * than the default critically damped spring (the search well's panel:
   * ease-in-out, closing faster than it opens). Pass them through
   * `useMotionTransition` so reduced motion still holds.
   */
  timing?: { open: Transition; close: Transition };
  'data-testid'?: string;
}

/**
 * One height-animated box. Must be the direct keyed child of an
 * `<AnimatePresence>` (use {@link Collapse} for a single open/closed region).
 */
export function CollapseItem({
  children,
  className,
  frameClassName,
  subgrid = false,
  as = 'div',
  enter = true,
  rowRule = false,
  delay,
  exitDelay,
  timing,
  'data-testid': testId,
}: CollapseItemProps) {
  const frameRef = useRef<HTMLElement | null>(null);
  const [spacing, setSpacing] = useState<EdgeSpacing | null>(null);
  // Clip only while the height moves — a settled box must not cut off focus
  // rings, hover lifts or popover anchors that reach past it.
  const [clip, setClip] = useState(enter);

  // Before the first paint: read the spacing the layout gives this box, then
  // re-render with it moved inside the animated height.
  useLayoutEffect(() => {
    if (frameRef.current) setSpacing(measureEdgeSpacing(frameRef.current));
  }, []);

  const moved = spacing ?? NO_SPACING;
  const Frame = as === 'li' ? motion.li : motion.div;
  return (
    <Frame
      ref={(node: HTMLElement | null) => {
        frameRef.current = node;
      }}
      data-testid={testId}
      // While the height moves: descendants that skip rendering off-screen
      // (`content-visibility: auto`) opt back in, so `height: auto` is measured
      // from their real size, not their placeholder.
      data-collapse-clip={clip ? '' : undefined}
      initial={enter ? HIDDEN : false}
      animate={SHOWN}
      exit={
        timing
          ? { ...HIDDEN, transition: timing.close }
          : exitDelay
            ? { ...HIDDEN, transition: { ...TRANSITION, delay: exitDelay } }
            : HIDDEN
      }
      transition={timing ? timing.open : delay ? { ...TRANSITION, opacity: { ...fadeInstant, delay } } : TRANSITION}
      onAnimationStart={() => setClip(true)}
      onAnimationComplete={(definition) => {
        if (definition === SHOWN) setClip(false);
      }}
      style={{
        overflow: clip ? 'hidden' : undefined,
        marginTop: spacing ? -moved.gapTop : undefined,
        marginBottom: spacing ? -moved.gapBottom : undefined,
      }}
      className={cn(subgrid && SUBGRID, rowRule && ROW_RULE, frameClassName) || undefined}
    >
      {/* The moved spacing, then the caller's content box — two boxes, so a caller's own padding never fights it. */}
      <div
        className={subgrid ? SUBGRID : undefined}
        style={{
          paddingTop: moved.gapTop + moved.marginTop || undefined,
          paddingBottom: moved.gapBottom + moved.marginBottom || undefined,
        }}
      >
        <div className={cn(subgrid && SUBGRID, className) || undefined}>{children}</div>
      </div>
    </Frame>
  );
}

interface CollapseProps extends CollapseItemProps {
  open: boolean;
  /** Animate the very first mount too (default: an already-open region paints open). */
  appear?: boolean;
}

/** A region that opens and closes in place — the whole box, spacing included, rides the height. */
export function Collapse({ open, appear = false, ...item }: CollapseProps) {
  return <AnimatePresence initial={appear}>{open ? <CollapseItem key="collapse" {...item} /> : null}</AnimatePresence>;
}
