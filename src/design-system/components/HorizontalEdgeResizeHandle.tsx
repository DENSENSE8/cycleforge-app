'use client';

/**
 * Shared visual for a horizontal pane edge resize — wide hit sash + hover-reveal
 * thickened hairline on the panel seam (VS Code / Linear splitter grammar). Pair
 * with {@link useHorizontalEdgeResize}; do not hand-roll a second grip for the
 * same job.
 *
 * Hit vs paint: the sash is a **12px** (`w-3`) grab zone; the painted rule is a
 * **4px** (`w-1`) full-height bar that fades in on hover / stays lit while
 * dragging — centered on the display hairline, never a second line parked to
 * the side of the seam.
 *
 * - `placement: 'inset'` — hit sash lives **inside** the panel; paint sits on
 *   the panel's own edge seam (trailing `border-r` / leading `border-l`).
 *   Prefer for every flush rail (context · right-rail · Displays). Parent may
 *   keep `overflow-hidden`. Stacking (low → high): armed-row faces / body
 *   hairlines (`z-base`·`z-raised`) → this sash (`z-sticky`) → chrome bands
 *   that opt into the top-band twin (`z-header` + `pointer-events-none`, with
 *   interactive children re-enabled): column fullscreen / carton cursor,
 *   Displays leaf ← → eyebrow (`StationDisplayLeafHeader`), desk rail chrome.
 *   Same-token `z-raised` on body content used to tie the sash and steal the
 *   left-edge hit — do not raise body rows to `z-header`. Never shorten the
 *   hairline with `top-*` clearance.
 * - `placement: 'outset'` — grip straddles the panel border (legacy). Prefer
 *   `inset` so hover paint cannot read as a line to the right of the seam.
 *
 * Drag-only: collapse / park lives elsewhere (left context = filter trailing
 * + drag-past-min; right rail / Displays = `→|` + Band 3). Never a sash-top
 * chevron on this grip.
 */

import { HoverTooltip } from '@/components/ui/HoverTooltip';
import type {
  HorizontalEdge,
  HorizontalEdgeHandleProps,
} from '@/design-system/hooks/useHorizontalEdgeResize';
import { zIndex } from '@/design-system/tokens/z-index';
import { cn } from '@/utils/_cn';

type HorizontalEdgeResizePlacement = 'outset' | 'inset';

/** The 4px rule shared by the in-hit paint and the elevated overlay. */
const PAINT_BASE =
  'pointer-events-none w-1 self-stretch rounded-sm transition-[opacity,colors] duration-150';

/**
 * State → paint. Precedence: armed (about to close) > dragging > hover-reveal.
 * The hover reveal selector differs by host — `group-hover` for the paint INSIDE
 * the hit group, `peer-hover` for the elevated overlay that sits OUTSIDE it.
 */
function paintStateClass(
  armed: boolean,
  isDragging: boolean,
  hoverReveal: string,
): string {
  if (armed) return 'bg-fill-warning opacity-100';
  if (isDragging) return 'bg-border-strong opacity-100';
  return `bg-border-default opacity-0 ${hoverReveal}`;
}

interface HorizontalEdgeResizeHandleProps {
  edgeHandleProps: HorizontalEdgeHandleProps;
  isDragging: boolean;
  /** Which panel edge owns the handle — mirrors `useHorizontalEdgeResize` `edge`. */
  edge: HorizontalEdge;
  /**
   * `inset` — paint on the panel's own edge seam (context / right-rail / Displays).
   * `outset` — straddles the border into the adjacent surface (legacy).
   */
  placement?: HorizontalEdgeResizePlacement;
  /**
   * Arm-to-close highlight (splitter snap-zone grammar). When true, the rule
   * turns solid warning-amber at full opacity — regardless of hover / drag — to
   * mark that this pane is pinned at its bound and one shove from collapsing (its
   * OWN drag-past-min park, or the FAR-rail close on the station cascade). Lets
   * the seam of the thing about to disappear light before it does. Outranks the
   * neutral drag paint. Distinct from the Displays accent focus ring so the two
   * signals never collide.
   */
  armed?: boolean;
  /**
   * Render the 4px hairline as an elevated overlay that paints ABOVE sibling
   * chrome bands (`z-index: header + 1`, `pointer-events-none`), instead of the
   * default in-hit paint that a `z-header` chrome band would occlude. Use on a
   * pane whose leading seam is crossed by an opaque sticky header (Station
   * Displays leaf ← → band): the hairline reads continuously ON TOP of the Back
   * chevron, while the hit target stays BELOW the chrome so the chevron keeps
   * receiving clicks. Inset only.
   */
  elevatedHairline?: boolean;
  /** Tooltip copy. Defaults to the receiving-rail wording. */
  tooltipLabel?: string;
  className?: string;
}

/** Seam-edge position for the elevated overlay — mirrors the hit's paint edge. */
function elevatedHairlineClass(edge: HorizontalEdge): string {
  return cn(
    'absolute top-0 h-full',
    edge === 'trailing' ? 'right-0' : 'left-0',
  );
}

const HIT_TARGET_BASE =
  // z-sticky — above body `z-raised` (← → eyebrow · armed rows · hairlines);
  // below chrome `z-header` (`→|` / fullscreen).
  'group absolute top-0 z-sticky flex h-full w-3 cursor-col-resize touch-none items-stretch';

function hitTargetClass(edge: HorizontalEdge, placement: HorizontalEdgeResizePlacement): string {
  if (placement === 'outset') {
    // Center the paint on the border — half may sit outside.
    return edge === 'trailing'
      ? cn(HIT_TARGET_BASE, 'justify-center -right-1.5 translate-x-1/2')
      : cn(HIT_TARGET_BASE, 'justify-center -left-1.5 -translate-x-1/2');
  }
  // Inset: full-height paint on the panel seam (no top-* cutoff). Chrome with
  // `relative z-header` owns the `→|` hit target above this sash.
  // `justify-end` / `justify-start` keep the 4px bar flush to the seam so it
  // thickens the display hairline in place — never a twin line beside it.
  return edge === 'trailing'
    ? cn(HIT_TARGET_BASE, 'right-0 justify-end')
    : cn(HIT_TARGET_BASE, 'left-0 justify-start');
}

export function HorizontalEdgeResizeHandle({
  edgeHandleProps,
  isDragging,
  edge,
  placement = 'inset',
  armed = false,
  elevatedHairline = false,
  tooltipLabel = 'Resize',
  className,
}: HorizontalEdgeResizeHandleProps) {
  return (
    <>
      <HoverTooltip label={tooltipLabel} asChild focusable={false} openDelayMs={1500}>
        <div
          {...edgeHandleProps}
          {...(armed ? { 'data-arm': 'close' } : null)}
          // `peer` lets the elevated overlay below react to hover on the hit.
          className={cn(hitTargetClass(edge, placement), elevatedHairline && 'peer', className)}
        >
          {/* Default in-hit paint — carries the seam highlight where no opaque
              chrome band crosses the sash. Omitted when `elevatedHairline` moves
              the paint to the overlay so it never double-paints. */}
          {elevatedHairline ? null : (
            <span
              aria-hidden
              // Wide hit / 4px paint — full height on the display seam (industry
              // splitter highlight). Resting opacity 0; structural panel border
              // carries the idle hairline; hover thickens it in place.
              className={cn(PAINT_BASE, paintStateClass(armed, isDragging, 'group-hover:opacity-100'))}
            />
          )}
        </div>
      </HoverTooltip>
      {elevatedHairline ? (
        // Sibling of the hit (not a child), so its z escapes the hit's
        // `z-sticky` stacking context and paints ABOVE a `z-header` chrome band
        // that crosses the seam (Displays leaf ← → header). `pointer-events-none`
        // so the Back chevron underneath still takes clicks; `peer-hover` mirrors
        // the hover reveal off the hit. Inline z = one step over the header band
        // (no tailwind token in the 41–49 gap; the "+N off a band" idiom).
        <span
          aria-hidden
          data-testid="edge-resize-hairline"
          style={{ zIndex: zIndex.header + 1 }}
          className={cn(
            elevatedHairlineClass(edge),
            PAINT_BASE,
            paintStateClass(armed, isDragging, 'peer-hover:opacity-100'),
          )}
        />
      ) : null}
    </>
  );
}
