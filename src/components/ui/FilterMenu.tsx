'use client';

/** The filter menu for RAILS and sidebars — a lit trigger and a list of rows. */

import { useEffect, useRef, type ReactNode } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Filter, X } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { ToolbarListboxOption } from '@/design-system/primitives/ToolbarListbox';
import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';
import { cornerClass, DROPDOWN_ITEM_CORNER, DROPDOWN_SHELL_CORNER } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { KeyboardKey } from '@/design-system/primitives';

interface FilterMenuProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** An active refinement — lights the trigger and keeps it lit while closed. */
  hot: boolean;
  label: string;
  /** When hot, appended into aria-label — "Order scope (Repair active)". */
  hotActiveLabel?: string;
  children: ReactNode;
  /** Override content width (default `w-56`) for a wider body (date pickers). */
  contentClassName?: string;
  /** Trigger glyph. Defaults to the funnel — override only on a chrome row
   *  where the menu sits among unrelated controls and needs distinguishing. */
  icon?: ReactNode;
  align?: 'start' | 'end';
}

export function FilterMenu({
  open,
  onOpenChange,
  hot,
  label,
  hotActiveLabel,
  children,
  contentClassName,
  icon,
  align = 'end',
}: FilterMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(open);

  // Restore focus to the trigger when the menu closes (APG menu-button).
  useEffect(() => {
    if (wasOpenRef.current && !open) {
      triggerRef.current?.focus({ preventScroll: true });
    }
    wasOpenRef.current = open;
  }, [open]);

  const ariaLabel = hot && hotActiveLabel ? `${label} (${hotActiveLabel} active)` : label;

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={open}
          aria-label={ariaLabel}
          aria-pressed={hot}
          data-testid="filter-menu-trigger"
          className={cn(
            'ds-raw-button inline-flex shrink-0 items-center justify-center gap-1 px-1.5',
            // Colour only — ops chrome never tweens anything that moves a
            // neighbour (AGENTS.md: no layout animations).
            'transition-colors duration-100 ease-out',
            PRIMARY_CHROME_ROW_FACE,
            cornerClass('flush'),
            focusRing('control'),
            // Lit, not dotted. A dot alone fails WCAG 1.4.1 and floor
            // glanceability, which is why surfaces used to grow a separate
            // "hot chip" beside the trigger to compensate.
            open || hot
              ? 'bg-blue-600 text-white hover:bg-blue-600'
              : 'text-text-muted hover:bg-surface-hover hover:text-text-default',
          )}
        >
          <HoverTooltip label={ariaLabel} focusable={false} asChild>
            <span className="inline-flex items-center justify-center leading-none">
              {icon ?? <Filter className="h-3.5 w-3.5 shrink-0" />}
            </span>
          </HoverTooltip>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align={align}
          sideOffset={6}
          data-testid="filter-menu"
          className={cn(
            'z-dropdown overflow-hidden border border-border-soft bg-surface-card p-0.5 shadow-md ring-1 ring-black/5',
            DROPDOWN_SHELL_CORNER,
            focusRing('field', 'accent'),
            contentClassName ?? 'w-56',
          )}
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** A dismissible chip naming the active refinement, beside the trigger. */
export function FilterHotChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex h-5 shrink-0 items-center gap-0.5 rounded-md border border-blue-200 bg-blue-50 pl-1.5 pr-0.5 text-role-micro font-semibold text-blue-800">
      <span className="max-w-[6rem] truncate">{label}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Clear ${label} filter`}
        className="ds-raw-button inline-flex h-4 w-4 items-center justify-center rounded text-blue-700 hover:bg-blue-100"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}

/** Section eyebrow inside a {@link FilterMenu}. */
export function FilterMenuGroupLabel({ children }: { children: ReactNode }) {
  return (
    // px-2.5 aligns the eyebrow with the row label gutter below it.
    <p className="px-2.5 pb-1 pt-1.5 text-role-eyebrow text-text-faint">
      {children}
    </p>
  );
}

/** Hairline between groups inside a {@link FilterMenu}. */
export function FilterMenuDivider() {
  return <div className="my-1 h-px bg-surface-sunken" />;
}

/**
 * One filter row. Composes {@link ToolbarListboxOption}, so an active row is a
 * **leading blue check** rather than a filled background: a filter is
 * independently on/off, not one choice among a listbox.
 */
export function FilterMenuRow({
  label,
  count,
  active,
  onClick,
  leading,
  shortcut,
  sectionHeader = false,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  leading?: ReactNode;
  shortcut?: string;
  /**
   * Clickable default for an icon-bearing section (e.g. All types/platforms).
   * It replaces the separate eyebrow and starts flush: no check gutter,
   * leading-icon gutter, or row left padding.
   */
  sectionHeader?: boolean;
}) {
  return (
    <ToolbarListboxOption
      semantics="toggle"
      selected={active}
      onClick={onClick}
      icon={sectionHeader ? <></> : undefined}
      leading={
        sectionHeader ? undefined : (leading ?? <span className="w-2 shrink-0" aria-hidden />)
      }
      className={cn(DROPDOWN_ITEM_CORNER, sectionHeader && 'px-0')}
      trailing={
        count === undefined && !shortcut ? null : (
          <span className="flex shrink-0 items-center gap-2">
            {typeof count === 'number' ? (
              <span className={cn('tabular-nums', active ? 'text-text-soft' : 'text-text-faint')}>
                {count > 99 ? '99+' : count}
              </span>
            ) : null}
            {shortcut ? (
              <KeyboardKey size="xs" className="hidden sm:inline-flex">
                {shortcut}
              </KeyboardKey>
            ) : null}
          </span>
        )
      }
    >
      {label}
    </ToolbarListboxOption>
  );
}
