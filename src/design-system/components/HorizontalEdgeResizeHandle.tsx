'use client';

/**
 * Shared visual for a horizontal pane edge resize — the short hover-reveal
 * pill (VS Code / Linear). Pair with {@link useHorizontalEdgeResize}; do not
 * hand-roll a second grip for the same job.
 *
 * - `placement: 'outset'` — grip straddles the panel border (receiving
 *   context rail + non-modal detail inspectors). Parent must not clip
 *   (`overflow-visible`); put `overflow-hidden` on an inner content shell.
 * - `placement: 'inset'` — grip sits inside the panel edge when the shell
 *   cannot relax clipping.
 * - Optional `onCollapse` — same edge control grows a hover-reveal chevron
 *   parked at the **top** of the full-height edge (receiving context rail).
 *   Click collapses; drag / double-click resize behavior is unchanged.
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
   * `outset` straddles the border (needs a non-clipping parent).
   * `inset` keeps the pill inside an `overflow-hidden` card.
   */
  placement?: HorizontalEdgeResizePlacement;
  /** Tooltip copy. Defaults to the receiving-rail wording. */
  tooltipLabel?: string;
  /**
   * When set, a collapse chevron appears on the same edge hover as the resize
   * pill, anchored at the **top** of the vertical edge (not stacked mid-handle
   * with the pill). Click collapses the pane; pointerdown is stopped so it
   * does not start a drag. Chevron faces inward (toward the pane being hidden).
   */
  onCollapse?: () => void;
  /** Tooltip / aria for {@link onCollapse}. Defaults to "Hide sidebar". */
  collapseLabel?: string;
  className?: string;
}

const HIT_TARGET_BASE =
  'group absolute top-0 z-raised flex h-full w-3 cursor-col-resize touch-none items-center justify-center';

function hitTargetClass(edge: HorizontalEdge, placement: HorizontalEdgeResizePlacement): string {
  if (placement === 'outset') {
    return edge === 'trailing'
      ? cn(HIT_TARGET_BASE, '-right-1.5 translate-x-1/2')
      : cn(HIT_TARGET_BASE, '-left-1.5 -translate-x-1/2');
  }
  return edge === 'trailing'
    ? cn(HIT_TARGET_BASE, 'right-0')
    : cn(HIT_TARGET_BASE, 'left-0');
}

export function HorizontalEdgeResizeHandle({
  edgeHandleProps,
  isDragging,
  edge,
  placement = 'outset',
  tooltipLabel = 'Drag to resize · double-click for default',
  onCollapse,
  collapseLabel = 'Hide sidebar',
  className,
}: HorizontalEdgeResizeHandleProps) {
  // Trailing edge hides a left-anchored pane → chevron points left (into the
  // pane). Leading edge hides a right-anchored pane → chevron points right.
  const CollapseIcon = edge === 'trailing' ? ChevronLeft : ChevronRight;
  const resizeHint = onCollapse
    ? `${tooltipLabel} · click chevron to hide`
    : tooltipLabel;

  return (
    <HoverTooltip label={resizeHint} asChild focusable={false} openDelayMs={1500}>
      {/* Wide hit target; pill stays vertically centered. Optional collapse
          chevron parks at the TOP of this edge (not mid-stack with the pill). */}
      <div
        {...edgeHandleProps}
        className={cn(
          hitTargetClass(edge, placement),
          // Slightly wider sash when collapse is present so the chevron is not
          // clipped by the hit strip or covered by the workspace sibling.
          onCollapse && 'w-8',
          className,
        )}
      >
        {onCollapse ? (
          <IconButton
            size="xs"
            tone="neutral"
            ariaLabel={collapseLabel}
            icon={<CollapseIcon className="h-4 w-4" />}
            // Absolute at the top of the full-height edge; stop sash drag.
            // Low-key glyph only — same faint→strong reveal as the resize pill,
            // no card bubble / shadow / ring. xs hit + 16px glyph — readable
            // next to the scan band without overhanging so far it clips away.
            className={cn(
              // Nudge right of the card edge + slightly below the top radius.
              'absolute top-3.5 left-[calc(50%+3px)] z-10 -translate-x-1/2',
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
            'pointer-events-none h-8 w-1 rounded-full transition-[opacity,colors] duration-150',
            isDragging
              ? 'bg-border-strong opacity-100'
              : 'bg-border-default opacity-0 group-hover:opacity-100',
          )}
        />
      </div>
    </HoverTooltip>
  );
}
