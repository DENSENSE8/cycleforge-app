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
 *   keep `overflow-hidden`. Top chrome (`→|` / `DeskRailChromeRow`) sits above
 *   the sash in z-order so Hide stays free of drag — never shorten the
 *   hairline with `top-*` clearance.
 * - `placement: 'outset'` — grip straddles the panel border (legacy). Prefer
 *   `inset` so hover paint cannot read as a line to the right of the seam.
 * - Optional `onCollapse` — same edge control grows a hover-reveal chevron
 *   parked at the **top** of the full-height edge (left context rail). Click
 *   collapses. When the paired hook also sets `onCollapseBeyondMin`, dragging
 *   past min collapses on release; double-click still snaps default.
 */

import { ChevronLeft, ChevronRight } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import type {
  HorizontalEdge,
  HorizontalEdgeHandleProps,
} from '@/design-system/hooks/useHorizontalEdgeResize';
import { IconButton } from '@/design-system/primitives';
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
  /**
   * When set, a collapse chevron appears on the same edge hover as the resize
   * hairline, anchored at the **top** of the vertical edge (not stacked
   * mid-handle with the rule). Click collapses the pane; pointerdown is stopped
   * so it does not start a drag. Chevron faces inward (toward the pane being hidden).
   */
  onCollapse?: () => void;
  /** Tooltip / aria for {@link onCollapse}. Defaults to "Hide sidebar". */
  collapseLabel?: string;
  className?: string;
}

const HIT_TARGET_BASE =
  'group absolute top-0 z-raised flex h-full w-3 cursor-col-resize touch-none items-stretch';

function hitTargetClass(edge: HorizontalEdge, placement: HorizontalEdgeResizePlacement): string {
  if (placement === 'outset') {
    // Center the paint on the border — half may sit outside.
    return edge === 'trailing'
      ? cn(HIT_TARGET_BASE, 'justify-center -right-1.5 translate-x-1/2')
      : cn(HIT_TARGET_BASE, 'justify-center -left-1.5 -translate-x-1/2');
  }
  // Inset: full-height paint on the panel seam (no top-* cutoff). Chrome with
  // `relative z-raised` mounts after this sash and owns the `→|` hit target.
  // `justify-end` / `justify-start` keep the 4px bar flush to the seam so it
  // thickens the display hairline in place — never a twin line beside it.
  return edge === 'trailing'
    ? cn(HIT_TARGET_BASE, 'right-0 justify-end')
    : cn(HIT_TARGET_BASE, 'left-0 justify-start');
}

/** Collapse glyph sits ON the seam — inset anchors the sash edge; outset the sash center. */
function collapseAnchorClass(
  edge: HorizontalEdge,
  placement: HorizontalEdgeResizePlacement,
): string {
  if (placement === 'inset') {
    return edge === 'trailing' ? 'right-0' : 'left-0';
  }
  return 'left-1/2';
}

export function HorizontalEdgeResizeHandle({
  edgeHandleProps,
  isDragging,
  edge,
  placement = 'inset',
  tooltipLabel = 'Resize',
  onCollapse,
  collapseLabel = 'Hide sidebar',
  className,
}: HorizontalEdgeResizeHandleProps) {
  // Trailing edge hides a left-anchored pane → chevron points left (into the
  // pane). Leading edge hides a right-anchored pane → chevron points right.
  const CollapseIcon = edge === 'trailing' ? ChevronLeft : ChevronRight;

  return (
    <HoverTooltip label={tooltipLabel} asChild focusable={false} openDelayMs={1500}>
      {/* Thin full-height sash for drag; collapse is its own absolute control. */}
      <div
        {...edgeHandleProps}
        className={cn(hitTargetClass(edge, placement), className)}
      >
        {onCollapse ? (
          <IconButton
            size="xs"
            tone="neutral"
            ariaLabel={collapseLabel}
            icon={<CollapseIcon className="h-4 w-4" />}
            // Absolute at the top of the full-height edge; stop sash drag.
            // Low-key glyph only — same faint→strong reveal as the resize
            // hairline, no card bubble / shadow / ring. Centered on the seam.
            className={cn(
              'absolute top-3.5 z-10 -translate-x-1/2',
              collapseAnchorClass(edge, placement),
              'text-text-faint hover:text-text-default',
              // hover:opacity-100 keeps the glyph lit when the pointer is on
              // the button itself (outset overhang can leave group-hover).
              'opacity-0 transition-[opacity,color] duration-150 group-hover:opacity-100 hover:opacity-100',
              isDragging && 'opacity-0',
            )}
            data-testid="edge-resize-collapse"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onCollapse();
            }}
          />
        ) : null}
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
