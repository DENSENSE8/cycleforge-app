'use client';

/**
 * `FilterMenu` — the one filter control in the product.
 *
 * A funnel trigger that lights when something is applied, and a menu of rows
 * beneath it. Tables reach it through {@link DataTable}, which builds the rows
 * from filter OPTIONS; sidebar rails, whose facets are their own vocabulary,
 * compose {@link FilterMenuRow} directly.
 *
 * ## Why one component and not one per surface
 *
 * The thing this replaces (`workbench-filter-popover`, deleted 2026-08-29) was
 * 408 lines with a `density` prop, and its `density="field"` mode is how a
 * second funnel ended up INSIDE the search field on the To-ship desk — one
 * intent reached by two controls. There is no field density here: the menu is
 * always a control beside the thing it narrows, never inside it.
 *
 * ## Lit and counted, never a bare dot
 *
 * A dot alone fails WCAG 1.4.1 and floor glanceability, which is why the old
 * band had to paint a separate "hot chip" beside the field to compensate. The
 * trigger fills solid and prints how many refinements are on, so one control
 * carries the whole fact and there is nothing to keep in sync beside it.
 */

import * as Popover from '@radix-ui/react-popover';
import type { ReactNode } from 'react';
import { Filter } from '@/components/Icons';
import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';
import { cornerClass } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

export interface FilterMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Something is applied — lights the trigger. */
  hot?: boolean;
  /** How many refinements are on. Printed beside the funnel when > 0. */
  count?: number;
  /** Accessible name for the trigger. */
  label: string;
  /** The rows — {@link FilterMenuRow} / {@link FilterMenuGroupLabel} / {@link FilterMenuDivider}. */
  children: ReactNode;
  /** Width / scroll of the menu panel. */
  contentClassName?: string;
  /** Clears every refinement. Rendered as a footer row while any are on. */
  onClearAll?: () => void;
  'data-testid'?: string;
}

export function FilterMenu({
  open,
  onOpenChange,
  hot = false,
  count,
  label,
  children,
  contentClassName,
  onClearAll,
  'data-testid': testId = 'filter-menu',
}: FilterMenuProps) {
  const showCount = typeof count === 'number' && count > 0;

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          data-testid={`${testId}-trigger`}
          aria-label={showCount ? `${label}, ${count} active` : label}
          aria-pressed={hot}
          aria-expanded={open}
          className={cn(
            'ds-raw-button inline-flex shrink-0 items-center justify-center gap-1 px-1.5 text-role-caption',
            // Colour only. Ops chrome never tweens anything that moves a
            // neighbour (AGENTS.md — no layout animations).
            'transition-colors duration-100 ease-out',
            PRIMARY_CHROME_ROW_FACE,
            cornerClass('flush'),
            focusRing('control'),
            hot
              ? 'bg-blue-600 text-white hover:bg-blue-600'
              : 'text-text-muted hover:bg-surface-hover hover:text-text-default',
          )}
        >
          <Filter className="h-3.5 w-3.5 shrink-0" />
          {showCount ? <span className="tabular-nums">{count}</span> : null}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={2}
          data-testid={testId}
          className={cn(
            'z-dropdown overflow-hidden rounded-lg border border-border-soft bg-surface-card p-0.5 shadow-md ring-1 ring-black/5',
            focusRing('field', 'accent'),
            contentClassName ?? 'w-60',
          )}
        >
          {children}
          {hot && onClearAll ? (
            <>
              <FilterMenuDivider />
              <button
                type="button"
                onClick={() => {
                  onClearAll();
                  onOpenChange(false);
                }}
                data-testid={`${testId}-clear`}
                className={cn(
                  'ds-raw-button w-full rounded px-2 py-1.5 text-left text-role-caption text-text-soft',
                  focusRing('control'),
                  'hover:bg-surface-hover hover:text-text-default',
                )}
              >
                Clear all filters
              </button>
            </>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function FilterMenuGroupLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 pb-0.5 pt-1.5 text-role-eyebrow font-semibold uppercase tracking-widest text-text-faint">
      {children}
    </div>
  );
}

export function FilterMenuDivider() {
  return <div className="my-0.5 h-px bg-border-soft" aria-hidden />;
}

export interface FilterMenuRowProps {
  label: string;
  /** Rows behind it. Omit for honest absence — never print a fake 0. */
  count?: number;
  active?: boolean;
  /** Keyboard hint printed on the right (the desk's own hotkey). */
  shortcut?: string;
  /** A dot or mark before the label (platform / status colour). */
  leading?: ReactNode;
  /** Reads as a section head rather than a peer (e.g. "All platforms"). */
  sectionHeader?: boolean;
  onClick: () => void;
}

export function FilterMenuRow({
  label,
  count,
  active = false,
  shortcut,
  leading,
  sectionHeader = false,
  onClick,
}: FilterMenuRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active ? '' : undefined}
      className={cn(
        'ds-raw-button flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-role-caption',
        focusRing('control'),
        active
          ? 'bg-surface-sunken font-semibold text-text-default'
          : 'text-text-soft hover:bg-surface-hover hover:text-text-default',
        sectionHeader && !active && 'text-text-muted',
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        {leading}
        <span className="truncate">{label}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 tabular-nums text-role-micro text-text-faint">
        {typeof count === 'number' ? <span>{count}</span> : null}
        {shortcut ? <kbd className="font-sans">{shortcut}</kbd> : null}
      </span>
    </button>
  );
}
