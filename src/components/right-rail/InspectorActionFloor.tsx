'use client';

/** Workbench inspector action floor — the ONE icons-first Macro floor for desk triage RightRailHost record peeks (History · Orders ·… */

import type { MouseEvent, ReactNode } from 'react';
import { Loader2, MoreHorizontal } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton, KeyboardKey } from '@/design-system/primitives';
import {
  ICON_ACTION_FLOOR_CELL_ACTIVE_CLASS,
  ICON_ACTION_FLOOR_CELL_CLASS,
  IconActionFloor,
} from '@/design-system/primitives/IconActionFloor';
import {
  FLUSH_TERMINAL_SPREAD_GLYPH_CLASS,
  FLUSH_TERMINAL_SPREAD_PEER_CLASS,
} from '@/design-system/primitives/FlushTerminalFooter';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

/** Fill-width Macro spread peer face (hit target IS the column). */
/** Glyph size for a spread peer, applied by the CELL rather than by each caller. */
const FLOOR_GLYPH_CLASS = FLUSH_TERMINAL_SPREAD_GLYPH_CLASS.split(' ')
  .map((c) => `[&_svg]:${c}`)
  .join(' ');

const FLOOR_CELL = cn(
  FLUSH_TERMINAL_SPREAD_PEER_CLASS,
  FLOOR_GLYPH_CLASS,
  ICON_ACTION_FLOOR_CELL_CLASS,
);

/** Class every trailing `<InspectorFlushDelete />` peer must carry (no left rule). */
export const FLOOR_DELETE_PEER_CLASS = cn(FLUSH_TERMINAL_SPREAD_PEER_CLASS, 'border-l-0');

export function InspectorActionFloor({
  above,
  children,
  surface = 'canvas',
  className,
  'data-testid': testId = 'inspector-action-floor',
}: {
  /** Expand host / notes composer / error / teaching text seated above the bar. */
  above?: ReactNode;
  /**
   * Equal fill-width icon peers — `<FloorOverflowButton>` (leading) ·
   * `<FloorIconButton>` verbs · trailing `<InspectorFlushDelete>`.
   */
  children?: ReactNode;
  /**
   * Plane paint. `canvas` (default) is the desk floor's own step below the card — the depth cue that separates a Macro floor from the record…
   * operator-ruled 2026-08-10). Hairline + `border-t` still carry the seam
   */
  surface?: 'card' | 'canvas';
  className?: string;
  'data-testid'?: string;
}) {
  const hasRow = children != null;
  if (above == null && !hasRow) return null;

  return (
    <div className={cn('shrink-0', className)} data-testid={testId}>
      {above != null ? (
        <div
          className={cn(
            'border-t border-border-hairline',
            surface === 'card' ? 'bg-surface-card' : 'bg-surface-canvas',
          )}
        >
          {above}
        </div>
      ) : null}
      {hasRow ? (
        <IconActionFloor surface={surface} data-testid={`${testId}-bar`}>
          {children}
        </IconActionFloor>
      ) : null}
    </div>
  );
}

/** One icon verb in the floor — the shared peer every desk panel composes so the row is identical across rails. */
export function FloorIconButton({
  icon,
  label,
  onClick,
  disabled = false,
  busy = false,
  selected = false,
  href,
  hrefTarget,
  hrefRel,
  'data-testid': testId,
}: {
  icon: ReactNode;
  /** HoverTooltip + aria-label. */
  label: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  busy?: boolean;
  selected?: boolean;
  /** External link peer — renders an `<a>` instead of a button. */
  href?: string;
  hrefTarget?: string;
  hrefRel?: string;
  'data-testid'?: string;
}) {
  const glyph = busy ? <Loader2 className="animate-spin" /> : icon;
  const cellClass = cn(FLOOR_CELL, selected && ICON_ACTION_FLOOR_CELL_ACTIVE_CLASS);

  if (href) {
    return (
      <HoverTooltip asChild label={label}>
        {/* ds-raw-anchor — external link styled as a fill peer (not a button). */}
        <a
          href={href}
          target={hrefTarget}
          rel={hrefRel}
          aria-label={label}
          data-testid={testId}
          className={cn(
            'ds-raw-anchor inline-flex items-center justify-center',
            focusRing('control', 'accent'),
            cellClass,
          )}
        >
          {glyph}
        </a>
      </HoverTooltip>
    );
  }

  return (
    <HoverTooltip asChild label={label}>
      <IconButton
        type="button"
        size="fill"
        tone="neutral"
        icon={glyph}
        onClick={onClick}
        disabled={disabled || busy}
        ariaLabel={label}
        aria-pressed={selected || undefined}
        className={cellClass}
        data-testid={testId}
      />
    </HoverTooltip>
  );
}

type FloorOverflowItem = {
  key: string;
  label: string;
  shortcut?: string;
  onSelect: () => void;
  disabled?: boolean;
};

/**
 * The `⋯` overflow peer — leads the row, holds secondary verbs (never a verb
 * that already has its own icon). Disabled when empty; never hidden, so the row
 * geometry stays stable across record states.
 */
function FloorOverflowButton({
  items,
  label = 'More actions',
  'data-testid': testId = 'inspector-floor-more',
}: {
  items: readonly FloorOverflowItem[];
  label?: string;
  'data-testid'?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          type="button"
          size="fill"
          tone="neutral"
          icon={<MoreHorizontal />}
          disabled={items.length === 0}
          ariaLabel={label}
          title={label}
          className={FLOOR_CELL}
          data-testid={testId}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.key}
            disabled={item.disabled}
            onSelect={item.onSelect}
            className="justify-between gap-4"
          >
            <span>{item.label}</span>
            {item.shortcut ? (
              <KeyboardKey size="xs">
                ⌥{item.shortcut}
              </KeyboardKey>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
