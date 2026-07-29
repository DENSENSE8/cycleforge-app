'use client';

/**
 * Workbench chrome filter popover — the icon-only [⫶] trigger + its menu rows,
 * shared by every `WorkbenchChromeHeader` `right` slot (Outbound lanes /
 * statuses, Inbound carton source / search field).
 *
 * Resting chrome is one glyph; labels, counts, and shortcuts live inside the
 * popover. A hot filter marks the trigger with a dot so an active refinement is
 * visible without opening it.
 *
 * Extracted from `OutboundFilterStrip` when Inbound needed the same popover —
 * grow the shared primitive, don't fork a second menu.
 */

import type { ReactNode } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Filter } from '@/components/Icons';
import { ToolbarButton } from '@/components/ui/ToolbarButton';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { ToolbarListboxOption } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';

export function WorkbenchFilterPopover({
  open,
  onOpenChange,
  hot,
  label,
  children,
  /** Override content width (default `w-56`). Use a wider class when the menu
   *  hosts date pickers / multi-column tables (e.g. Incoming PO + carrier). */
  contentClassName,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** An active refinement — dots the trigger and keeps it lit while closed. */
  hot: boolean;
  label: string;
  children: ReactNode;
  contentClassName?: string;
}) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <ToolbarButton iconOnly active={open || hot} aria-expanded={open} aria-label={label}>
          <HoverTooltip label={label} focusable={false}>
            <span className="relative inline-flex">
              <Filter className="h-3.5 w-3.5" />
              {hot ? (
                <span
                  className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-blue-500 ring-1 ring-surface-card"
                  aria-hidden
                />
              ) : null}
            </span>
          </HoverTooltip>
        </ToolbarButton>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className={cn(
            // Panel chrome matches the house `Popover` the sibling toolbar
            // dropdowns use (p-0.5 + shadow-md), so the three read as one menu.
            'z-dropdown overflow-hidden rounded-lg border border-border-soft bg-surface-card p-0.5 shadow-md ring-1 ring-black/5 focus:outline-none',
            contentClassName ?? 'w-56',
          )}
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Section eyebrow inside a {@link WorkbenchFilterPopover}. */
export function WorkbenchFilterGroupLabel({ children }: { children: ReactNode }) {
  return (
    // px-2.5 aligns the eyebrow with the row label gutter below it.
    <p className="px-2.5 pb-1 pt-1.5 text-role-eyebrow uppercase tracking-widest text-text-faint">
      {children}
    </p>
  );
}

/** Hairline between groups inside a {@link WorkbenchFilterPopover}. */
export function WorkbenchFilterDivider() {
  return <div className="my-1 h-px bg-surface-sunken" />;
}

/**
 * One filter row. Composes {@link ToolbarListboxOption} — the same anatomy as
 * `QueueSortSwitch` / `GridFieldsMenu`, so all three trailing-cluster dropdowns
 * read as one control: an active row is a **leading blue check**, never a
 * `bg-surface-accent` fill. The status dot moves in beside the label; count and
 * shortcut ride the trailing slot.
 */
export function WorkbenchFilterMenuRow({
  label,
  count,
  active,
  onClick,
  leading,
  shortcut,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  leading?: ReactNode;
  shortcut?: string;
}) {
  return (
    <ToolbarListboxOption
      // A filter is independently on/off, not one choice among a listbox.
      semantics="toggle"
      selected={active}
      onClick={onClick}
      leading={leading ?? <span className="w-2 shrink-0" aria-hidden />}
      trailing={
        count === undefined && !shortcut ? null : (
          <span className="flex shrink-0 items-center gap-2">
            {typeof count === 'number' ? (
              <span className={cn('tabular-nums', active ? 'text-text-soft' : 'text-text-faint')}>
                {count > 99 ? '99+' : count}
              </span>
            ) : null}
            {shortcut ? (
              <kbd className="hidden rounded bg-surface-sunken px-1 text-role-micro text-text-faint sm:inline">
                {shortcut}
              </kbd>
            ) : null}
          </span>
        )
      }
    >
      {label}
    </ToolbarListboxOption>
  );
}
