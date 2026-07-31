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
   * `outset` straddles the border (needs a non-clipping parent).
   * `inset` keeps the pill inside an `overflow-hidden` card.
   */
  placement?: HorizontalEdgeResizePlacement;
  /** Tooltip copy. Defaults to the receiving-rail wording. */
  tooltipLabel?: string;
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
  className,
}: HorizontalEdgeResizeHandleProps) {
  return (
    <HoverTooltip label={tooltipLabel} asChild focusable={false} openDelayMs={1500}>
      {/* Wide hit target; pill cue appears only on handle hover (VS Code /
          Linear pattern) — invisible at rest, stronger while held. */}
      <div
        {...edgeHandleProps}
        className={cn(hitTargetClass(edge, placement), className)}
      >
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
