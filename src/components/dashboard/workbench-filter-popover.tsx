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
import { Check, Filter } from '@/components/Icons';
import { ToolbarButton } from '@/components/ui/ToolbarButton';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cn } from '@/utils/_cn';

export function WorkbenchFilterPopover({
  open,
  onOpenChange,
  hot,
  label,
  children,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** An active refinement — dots the trigger and keeps it lit while closed. */
  hot: boolean;
  label: string;
  children: ReactNode;
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
          className="z-dropdown w-56 overflow-hidden rounded-lg border border-border-soft bg-surface-card p-1 shadow-lg ring-1 ring-black/5 focus:outline-none"
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
    <p className="px-2 pb-1 pt-1.5 text-role-eyebrow uppercase tracking-widest text-text-faint">
      {children}
    </p>
  );
}

/** Hairline between groups inside a {@link WorkbenchFilterPopover}. */
export function WorkbenchFilterDivider() {
  return <div className="my-1 h-px bg-surface-sunken" />;
}

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
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'ds-raw-button flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-role-caption font-semibold transition-colors',
        active ? 'bg-surface-accent text-text-accent' : 'text-text-muted hover:bg-surface-hover',
      )}
    >
      {leading ?? <span className="w-2 shrink-0" aria-hidden />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {typeof count === 'number' ? (
        <span className={cn('tabular-nums', active ? 'text-text-accent/80' : 'text-text-faint')}>
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
      {shortcut ? (
        <kbd className="hidden rounded bg-surface-sunken px-1 text-role-micro font-bold text-text-faint sm:inline">
          {shortcut}
        </kbd>
      ) : null}
      {active ? <Check className="h-3.5 w-3.5 shrink-0" /> : <span className="w-3.5 shrink-0" aria-hidden />}
    </button>
  );
}
