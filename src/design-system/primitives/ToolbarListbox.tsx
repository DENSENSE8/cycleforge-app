'use client';

/** `ToolbarListbox*` — the ONE option-row anatomy for a quiet workbench toolbar dropdown (a `ToolbarButton` trigger + a `Popover… */

import type { KeyboardEvent, ReactNode, RefObject } from 'react';
import { Check } from '@/components/Icons';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

/** `Popover` className for a toolbar listbox panel — one panel geometry. */
export const TOOLBAR_LISTBOX_PANEL_CLASS = 'min-w-[11rem] rounded-none p-0.5 shadow-md';

/**
 * Roving focus + Escape for a listbox option. Options are located by
 * `data-option-index`, which {@link ToolbarListboxOption} sets for you.
 *
 * `onDismiss` should close the popover *and* return focus to the trigger.
 */
export function toolbarListboxOptionKeyDown(
  event: KeyboardEvent<HTMLButtonElement>,
  index: number,
  count: number,
  listRef: RefObject<HTMLUListElement | null>,
  onDismiss: () => void,
) {
  if (event.key === 'Escape') {
    event.preventDefault();
    onDismiss();
    return;
  }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  event.preventDefault();
  const next = event.key === 'ArrowDown' ? (index + 1) % count : (index - 1 + count) % count;
  listRef.current?.querySelector<HTMLButtonElement>(`[data-option-index="${next}"]`)?.focus();
}

/** Opens the popover on the keys a listbox trigger is expected to answer. */
export function toolbarListboxTriggerKeyDown(
  event: KeyboardEvent<HTMLButtonElement>,
  onOpen: () => void,
) {
  if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
    event.preventDefault();
    onOpen();
  }
}

interface ToolbarListboxOptionProps {
  /** Position in the list — powers `data-option-index` roving focus. Omit for
   *  a menu that does not implement roving focus (the filter popover). */
  index?: number;
  /** Current value (single-select), shown column (multi-select), active filter. */
  selected?: boolean;
  /** How the row announces itself: */
  semantics?: 'option' | 'toggle' | 'plain';
  /** Replaces the checkmark in the glyph gutter (e.g. a reset arrow). */
  icon?: ReactNode;
  /**
   * Where the selection check sits. Default `start` (reserved left gutter so
   * rows do not jump). `end` is the combobox face — check on the far right,
   * still reserved so unselected rows keep the same width.
   */
  checkAlign?: 'start' | 'end';
  /** Sits between the check gutter and the label — a lifecycle/status dot. */
  leading?: ReactNode;
  /** Right-aligned meta — a count, a `kbd` shortcut chip. */
  trailing?: ReactNode;
  children: ReactNode;
  onClick: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
  /** Escape hatch for a test/selector hook (e.g. `data-field-key`). */
  dataAttrs?: Record<string, string>;
  className?: string;
}

export function ToolbarListboxOption({
  index,
  selected = false,
  semantics = 'option',
  icon,
  checkAlign = 'start',
  leading,
  trailing,
  children,
  onClick,
  onKeyDown,
  dataAttrs,
  className,
}: ToolbarListboxOptionProps) {
  const check = icon ?? (
    <Check
      className={cn(
        'h-3.5 w-3.5 shrink-0 text-blue-600',
        selected ? 'opacity-100' : 'opacity-0',
      )}
    />
  );
  return (
    // ds-raw-button: flush full-width menu child (role=option / aria-pressed) — no DS Button variant expresses it.
    <button
      type="button"
      {...(semantics === 'option' ? { role: 'option' as const, 'aria-selected': selected } : null)}
      {...(semantics === 'toggle' ? { 'aria-pressed': selected } : null)}
      data-option-index={index}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={cn(
        // `role-caption` (12px sans), not `role-micro`: a menu option is CONTENT
        // the operator reads, not the dense chrome the condensed 10px cut exists
        // for. One role for all three menus — never a per-menu size.
        'flex w-full items-center gap-2 rounded-none px-2.5 py-1.5 text-left text-role-caption font-semibold transition-colors',
        focusRing('control'),
        selected
          ? 'text-text-default hover:bg-surface-hover'
          : 'text-text-muted hover:bg-surface-hover hover:text-text-default',
        className,
      )}
      {...dataAttrs}
    >
      {checkAlign === 'start' ? check : null}
      {leading}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing}
      {checkAlign === 'end' ? check : null}
    </button>
  );
}
