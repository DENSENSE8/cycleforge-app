'use client';

/**
 * Left-dock park / restore controls — one glyph + size SoT.
 *
 * | Action   | Glyph              | Button | Icon class                          |
 * | Collapse | ArrowLeftToLine    | xs     | LEFT_DOCK_TOGGLE_ICON_CLASS         |
 * | Expand   | ArrowRightToLine   | xs     | same                                |
 *
 * Collapse seats in TechRailSearchBar `trailingAction` (age column).
 * Expand seats in {@link LeftDockCollapseStrip} footer (same column when parked).
 *
 * Public exports: {@link RailFilterCollapseButton}, {@link LeftDockCollapseStrip}.
 * Expand button + icon class stay module-private so size cannot fork.
 */

import type { ReactNode } from 'react';
import { ArrowLeftToLine, ArrowRightToLine } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  CONTEXT_PANEL_COLLAPSE_STRIP_CLASS,
  CONTEXT_PANEL_COLLAPSE_STRIP_FOOTER_CLASS,
} from '@/components/sidebar/context-panel-column';
import { IconButton } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';

/** Shared glyph box for collapse + expand — never a bare `h-4` twin. */
const LEFT_DOCK_TOGGLE_ICON_CLASS = 'h-3.5 w-3.5';

const TOGGLE_BTN_CLASS = 'shrink-0 text-text-faint hover:text-text-default';

export function RailFilterCollapseButton({
  onCollapse,
  label = 'Hide sidebar',
  testId = 'rail-filter-collapse',
}: {
  onCollapse: () => void;
  label?: string;
  testId?: string;
}) {
  return (
    <HoverTooltip label={label} asChild>
      <IconButton
        size="xs"
        tone="neutral"
        ariaLabel={label}
        icon={<ArrowLeftToLine className={LEFT_DOCK_TOGGLE_ICON_CLASS} />}
        onClick={onCollapse}
        data-testid={testId}
        className={TOGGLE_BTN_CLASS}
      />
    </HoverTooltip>
  );
}

function LeftDockExpandButton({
  onExpand,
  label = 'Show sidebar',
  testId = 'left-dock-expand',
}: {
  onExpand: () => void;
  label?: string;
  testId?: string;
}) {
  return (
    <HoverTooltip label={label} asChild>
      <IconButton
        size="xs"
        tone="neutral"
        ariaLabel={label}
        icon={<ArrowRightToLine className={LEFT_DOCK_TOGGLE_ICON_CLASS} />}
        onClick={onExpand}
        data-testid={testId}
        className={TOGGLE_BTN_CLASS}
      />
    </HoverTooltip>
  );
}

/**
 * Parked left-dock strip — full-height age column with expand pinned to the
 * bottom filter-height footer (same seat as {@link RailFilterCollapseButton}).
 */
export function LeftDockCollapseStrip({
  onExpand,
  label = 'Show sidebar',
  testId = 'left-dock-expand',
  hostDataAttrs,
  children,
}: {
  onExpand: () => void;
  label?: string;
  testId?: string;
  /** Host identity hooks (e.g. `data-context-panel-collapsed`). */
  hostDataAttrs?: Record<string, string | boolean | undefined>;
  /** Optional mid-strip content above the footer (pins later). */
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(CONTEXT_PANEL_COLLAPSE_STRIP_CLASS, 'min-h-0 self-stretch')}
      data-left-dock-collapsed=""
      {...hostDataAttrs}
    >
      <div className="flex min-h-0 flex-1 flex-col items-center" aria-hidden={children ? undefined : true}>
        {children}
      </div>
      <div className={CONTEXT_PANEL_COLLAPSE_STRIP_FOOTER_CLASS}>
        <LeftDockExpandButton onExpand={onExpand} label={label} testId={testId} />
      </div>
    </div>
  );
}
