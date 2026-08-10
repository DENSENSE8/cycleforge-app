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
import { cn } from '@/utils/_cn';

type HorizontalEdgeResizePlacement = 'outset' | 'inset';

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
  /** Tooltip copy. Defaults to the receiving-rail wording. */
  tooltipLabel?: string;
  className?: string;
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
  tooltipLabel = 'Resize',
  className,
}: HorizontalEdgeResizeHandleProps) {
  return (
    <HoverTooltip label={tooltipLabel} asChild focusable={false} openDelayMs={1500}>
      <div
        {...edgeHandleProps}
        className={cn(hitTargetClass(edge, placement), className)}
      >
        <span
          aria-hidden
          className={cn(
            // Wide hit / 4px paint — full height on the display seam (industry
            // splitter highlight). Resting opacity 0; structural panel border
            // carries the idle hairline; hover thickens it in place.
            'pointer-events-none w-1 self-stretch rounded-sm transition-[opacity,colors] duration-150',
            isDragging
              ? 'bg-border-strong opacity-100'
              : 'bg-border-default opacity-0 group-hover:opacity-100',
          )}
        />
      </div>
    </HoverTooltip>
  );
}
