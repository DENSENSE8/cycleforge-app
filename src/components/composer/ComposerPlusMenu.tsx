'use client';

/**
 * Shared composer + menu chrome — one panel + row grammar for Unbox inserts,
 * Ticket visibility/tools, and @ context attach menus.
 */

import { forwardRef, type ReactNode, type RefObject } from 'react';
import { Plus } from '@/components/Icons';
import { Popover } from '@/design-system/primitives/Popover';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';
import {
  NOTE_INSERT_MENU_PANEL,
  NOTE_INSERT_MENU_PANEL_CLASS,
  NOTE_INSERT_MENU_ROW,
  NOTE_INSERT_MENU_ROW_SELECTED,
  NOTE_INSERT_MENU_SECTION,
  NOTE_INSERT_MENU_ICON_CELL,
  NOTE_INSERT_TRIGGER_COMPOSER_BTN,
  NOTE_INSERT_TRIGGER_COMPOSER_BTN_ACTIVE,
} from '@/components/receiving/workspace/note-composer-helpers';

export const COMPOSER_PLUS_MENU_PANEL_CLASS = cn(
  NOTE_INSERT_MENU_PANEL_CLASS,
  NOTE_INSERT_MENU_PANEL,
);

export function ComposerPlusMenuPanel({
  open,
  onClose,
  anchorRef,
  children,
  'data-testid': testId,
  ariaLabel = 'Composer menu',
  className,
  placement = 'top-start',
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  'data-testid'?: string;
  ariaLabel?: string;
  className?: string;
  placement?: 'top-start' | 'bottom-end';
}) {
  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      placement={placement}
      gap={4}
      level="panelOverlay"
      role="menu"
      aria-label={ariaLabel}
      data-testid={testId}
      padded={false}
      className={cn(COMPOSER_PLUS_MENU_PANEL_CLASS, className)}
    >
      {children}
    </Popover>
  );
}

export function ComposerPlusMenuRow({
  children,
  selected,
  disabled,
  onClick,
  icon,
  iconTone,
}: {
  children: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon?: ReactNode;
  iconTone?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cn(NOTE_INSERT_MENU_ROW, selected && NOTE_INSERT_MENU_ROW_SELECTED)}
    >
      {icon ? (
        <span className={cn(NOTE_INSERT_MENU_ICON_CELL, iconTone ?? 'text-text-muted')} aria-hidden>
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}

export function ComposerPlusMenuSection({ children }: { children: ReactNode }) {
  return <div className={NOTE_INSERT_MENU_SECTION}>{children}</div>;
}

export const ComposerPlusTrigger = forwardRef<
  HTMLButtonElement,
  {
    open: boolean;
    onClick: () => void;
    disabled?: boolean;
    ariaLabel?: string;
    'data-testid'?: string;
    tooltip?: string;
    children?: ReactNode;
    className?: string;
  }
>(function ComposerPlusTrigger(
  {
    open,
    onClick,
    disabled,
    ariaLabel = 'Add context',
    'data-testid': testId = 'composer-plus',
    tooltip = ariaLabel,
    children,
    className,
  },
  ref,
) {
  return (
    <HoverTooltip label={tooltip} asChild>
      <button
        ref={ref}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        data-testid={testId}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          NOTE_INSERT_TRIGGER_COMPOSER_BTN,
          open && NOTE_INSERT_TRIGGER_COMPOSER_BTN_ACTIVE,
          disabled && 'cursor-not-allowed opacity-50',
          focusRing('control', 'accent'),
          className,
        )}
      >
        {children ?? <Plus className="h-3.5 w-3.5" />}
      </button>
    </HoverTooltip>
  );
});
