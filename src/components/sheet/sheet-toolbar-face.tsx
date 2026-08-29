'use client';

/**
 * The Sheets toolbar's control faces — one cube, one separator, one group.
 *
 * `WorkbenchBandControl` already solved this problem one band down, and its
 * docblock records why: Views, KPI and the inspector each ran their own rung,
 * tone and glyph size until a single face was imposed. This toolbar hosts
 * *twelve* controls in one row, so the same failure would be four times as loud.
 *
 * It is a separate face from `WorkbenchBandControl` for exactly one reason: this
 * row's controls come in GROUPS separated by hairlines (marks · colour · align),
 * and a group needs its members to abut at `gap-0` inside it while the groups
 * themselves are walled. That is a property of the row, not of the button, so
 * the button stays dumb and {@link SheetToolbarGroup} owns the walls.
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cornerClass } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

/** Glyph box — one size for every control in the row. */
export const SHEET_TOOLBAR_GLYPH_CLASS = 'h-3.5 w-3.5 shrink-0';

export interface SheetToolbarButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'type' | 'aria-label'> {
  icon: ReactNode;
  /** Tooltip text and, unless {@link ariaLabel} says more, the accessible name. */
  label: string;
  ariaLabel?: string;
  /** Visible text beside the glyph — only for a control whose VALUE matters closed. */
  text?: string;
  /**
   * Control is ON.
   *
   * Same law as `WorkbenchBandControl`: `active` is for a control that is
   * CHANGING something — bold is on, a filter is applied, fullscreen is engaged.
   * It is never used to mark a default. A toolbar lit up on first load teaches
   * an operator to ignore the lit state entirely.
   */
  active?: boolean;
  /** Trailing count (the filter button's "2"). Rendered only when > 0. */
  count?: number;
}

export const SheetToolbarButton = forwardRef<HTMLButtonElement, SheetToolbarButtonProps>(
  function SheetToolbarButton(
    { icon, label, ariaLabel, text, active = false, count, className, ...rest },
    ref,
  ) {
    const showCount = typeof count === 'number' && count > 0;
    return (
      <HoverTooltip label={label} asChild>
        {/*
          ds-raw-button: `IconButton` is icon-only by contract and cannot hold
          the value text; `ToolbarButton` is a soft rounded-lg uppercase pill —
          the wrong corner and the wrong type role for flush ops chrome.
        */}
        <button
          ref={ref}
          type="button"
          aria-label={ariaLabel ?? label}
          aria-pressed={active}
          className={cn(
            'ds-raw-button inline-flex items-center justify-center gap-1 text-role-caption',
            // Colour only — never a size or position transition. Ops chrome
            // must not tween anything that moves a neighbour (AGENTS.md).
            'transition-colors duration-100 ease-out',
            PRIMARY_CHROME_ROW_FACE,
            text || showCount ? 'px-1.5' : 'aspect-square',
            cornerClass('flush'),
            focusRing('control'),
            active
              ? 'bg-blue-600 text-white hover:bg-blue-600 hover:text-white'
              : 'text-text-muted hover:bg-surface-hover hover:text-text-default',
            // A disabled control still occupies the row so the groups do not
            // reflow as capabilities change between tabs.
            'disabled:pointer-events-none disabled:opacity-40',
            className,
          )}
          {...rest}
        >
          {icon}
          {text ? <span className="max-w-[12ch] truncate">{text}</span> : null}
          {showCount ? (
            <span
              className={cn(
                'tabular-nums text-role-micro',
                active ? 'text-white' : 'text-text-soft',
              )}
            >
              {count}
            </span>
          ) : null}
        </button>
      </HoverTooltip>
    );
  },
);

/**
 * A walled group of controls.
 *
 * Members abut at `gap-0` (flush chrome grammar); the wall is a leading
 * hairline, drawn by every group except the first. `empty:hidden` matters here —
 * a capability-gated group with nothing in it is still a flex ITEM, and would
 * otherwise reserve its own hairline against nothing.
 */
export function SheetToolbarGroup({
  children,
  className,
  first = false,
}: {
  children: ReactNode;
  className?: string;
  /** Omit the leading wall — the leftmost group in the row. */
  first?: boolean;
  }) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-0 self-stretch empty:hidden',
        !first && 'border-l border-border-soft',
        className,
      )}
    >
      {children}
    </div>
  );
}
