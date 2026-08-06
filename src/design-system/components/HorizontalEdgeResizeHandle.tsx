'use client';

/**
 * Shared visual for a horizontal pane edge resize — wide hit sash + hover-reveal
 * 1px hairline (same hit-vs-paint rule as {@link ColumnResizeHandle}). Pair with
 * {@link useHorizontalEdgeResize}; do not hand-roll a second grip for the same job.
 *
 * - `placement: 'inset'` — hit sash lives **inside** the panel; the 1px paint
 *   is flush top→bottom on the panel's own edge seam (the display hairline).
 *   Prefer for right-rail / Displays push. Parent may keep `overflow-hidden`.
 *   Top chrome (`→|` / `DeskRailChromeRow`) sits above the sash in z-order so
 *   Hide stays free of drag — never shorten the hairline with `top-*` clearance.
 * - `placement: 'outset'` — grip straddles the panel border (left context rail).
 *   Parent must not clip (`overflow-visible`); put `overflow-hidden` on an inner
 *   content shell. Hit strip stays `w-3` even when `onCollapse` is set — a wider
 *   sash was eating the LedgerGrid select gutter on Unbox History.
 * - Optional `onCollapse` — same edge control grows a hover-reveal chevron
 *   parked at the **top** of the full-height edge (receiving context rail).
 *   Click collapses. When the paired hook also sets `onCollapseBeyondMin`,
 *   dragging past min collapses on release; double-click still snaps default.
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
   * `inset` — paint on the panel's own edge seam (right-rail / Displays).
   * `outset` — straddles the border into the adjacent surface (left context rail).
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
    // Center the paint on the border — half may sit outside (context rail only).
    return edge === 'trailing'
      ? cn(HIT_TARGET_BASE, 'justify-center -right-1.5 translate-x-1/2')
      : cn(HIT_TARGET_BASE, 'justify-center -left-1.5 -translate-x-1/2');
  }
  // Inset: full-height paint on the panel seam (no top-* cutoff). Chrome with
  // `relative z-raised` mounts after this sash and owns the `→|` hit target.
  return edge === 'trailing'
    ? cn(HIT_TARGET_BASE, 'right-0 justify-end')
    : cn(HIT_TARGET_BASE, 'left-0 justify-start');
}

export function HorizontalEdgeResizeHandle({
  edgeHandleProps,
  isDragging,
  edge,
  placement = 'outset',
  tooltipLabel = 'Resize',
  onCollapse,
  collapseLabel = 'Hide sidebar',
  className,
}: HorizontalEdgeResizeHandleProps) {
  // Trailing edge hides a left-anchored pane → chevron points left (into the
  // pane). Leading edge hides a right-anchored pane → chevron points right.
  const CollapseIcon = edge === 'trailing' ? ChevronLeft : ChevronRight;
  // Collapse glyph sits ON the panel side of the border — never widen the
  // full-height sash into the workspace (that stole Unbox History's 2rem
  // select gutter under `w-8` + outset). Trailing → nudge left; leading → right.
  const collapseNudgeClass =
    edge === 'trailing' ? 'left-[calc(50%-4px)]' : 'left-[calc(50%+4px)]';

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
            // hairline, no card bubble / shadow / ring. xs hit + 16px glyph —
            // readable next to the scan band without overhanging so far it clips away.
            className={cn(
              'absolute top-3.5 z-10 -translate-x-1/2',
              collapseNudgeClass,
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
            // Wide hit / 1px paint — flush top→bottom on the display seam.
            // Outset keeps a short end inset so it does not kiss left-rail chrome.
            'pointer-events-none w-px self-stretch rounded transition-[opacity,colors] duration-150',
            placement === 'outset' && 'my-1',
            isDragging
              ? 'bg-border-strong opacity-100'
              : 'bg-border-default opacity-0 group-hover:opacity-100',
          )}
        />
      </div>
    </HoverTooltip>
  );
}
